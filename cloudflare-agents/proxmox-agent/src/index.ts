import { getToolDefinitions, executeTool } from './proxmox-tools'

export interface Env {
  AI: Ai
}

interface UserMessage    { role: 'user';      content: string }
interface SystemMessage  { role: 'system';    content: string }
interface AssistantMessage {
  role: 'assistant'
  content: string | null
  tool_calls?: OaiToolCall[]
}
interface ToolMessage {
  role: 'tool'
  tool_call_id: string
  content: string
}

type Message = UserMessage | SystemMessage | AssistantMessage | ToolMessage

interface OaiToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

interface AiResponse {
  response?: string | null
  tool_calls?: OaiToolCall[]
}

const MODEL = '@cf/meta/llama-4-scout-17b-16e-instruct'

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (request.method === 'GET' && url.pathname === '/health') {
      return Response.json({ status: 'ok', service: 'cf-proxmox-agent', model: MODEL })
    }

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 })
    }

    let body: { task?: string; proxmox_url?: string; proxmox_token?: string; endpoint_name?: string; default_node?: string }
    try {
      body = await request.json() as typeof body
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { task, proxmox_url, proxmox_token, endpoint_name, default_node } = body
    if (!task || !proxmox_url || !proxmox_token) {
      return Response.json({ error: 'Missing required fields: task, proxmox_url, proxmox_token' }, { status: 400 })
    }

    const label = endpoint_name ? ` (${endpoint_name})` : ''
    const nodeHint = default_node ? ` The default node name is "${default_node}".` : ''

    const system = `You are a Proxmox VE systems administrator. You have full access to a Proxmox cluster at ${proxmox_url}${label} via the provided tools.${nodeHint}

Rules:
- ALWAYS call a tool to get real data. Never guess VM names, IDs, or node names.
- For overview/status requests: first call list_nodes to discover all nodes and their names, then list_vms and list_containers for relevant nodes.
- For a specific VM or container: call list_vms/list_containers first if you don't know the VMID, then get_vm_status/get_container_status.
- For power actions (start/stop/reboot/shutdown): always confirm the correct vmid by listing first, then call vm_action or container_action.
- For storage questions: call list_storage for the node.
- For cluster health: call get_cluster_status then list_nodes.
- Report memory and disk in human-readable units (GB/TB). Report CPU as percentage.
- Report uptime in days/hours/minutes format.
- If a tool returns an error, report it exactly — do not fabricate.
- Use shutdown (graceful) over stop (force) unless the user explicitly says force.`

    const messages: Message[] = [
      { role: 'system', content: system },
      { role: 'user', content: task },
    ]

    const tools = getToolDefinitions()
    let toolCallCount = 0
    let finalText = ''

    try {
      for (let step = 0; step < 12; step++) {
        const result = await (env.AI.run as Function)(MODEL, { messages, tools }) as AiResponse

        if (result.tool_calls && result.tool_calls.length > 0) {
          messages.push({
            role: 'assistant',
            content: null,
            tool_calls: result.tool_calls,
          })

          for (const call of result.tool_calls) {
            toolCallCount++
            let toolResult: unknown
            try {
              const args = JSON.parse(call.function.arguments || '{}') as Record<string, unknown>
              toolResult = await executeTool(call.function.name, args, proxmox_url, proxmox_token)
            } catch (err) {
              toolResult = { error: err instanceof Error ? err.message : String(err) }
            }

            messages.push({
              role: 'tool',
              tool_call_id: call.id,
              content: JSON.stringify(toolResult).slice(0, 20000),
            })
          }
        } else {
          finalText = result.response ?? ''
          break
        }
      }

      if (!finalText) finalText = '(Agent reached step limit without a final answer.)'

      return Response.json({ output: finalText, success: true, tool_calls: toolCallCount })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return Response.json({ output: message, success: false }, { status: 500 })
    }
  },
}
