import { getToolDefinitions, executeTool } from './health-tools'

export interface Env {
  AI: Ai
}

interface UserMessage   { role: 'user';      content: string }
interface SystemMessage { role: 'system';    content: string }
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

/**
 * Llama 4 Scout sometimes emits tool calls as inline JSON in the response
 * field instead of the structured tool_calls array.
 */
function parseLlamaInlineToolCalls(response: string, validNames: Set<string>): OaiToolCall[] | null {
  if (!response || !response.includes('"name"')) return null
  const calls: OaiToolCall[] = []
  let searchFrom = 0

  while (searchFrom < response.length) {
    const braceIdx = response.indexOf('{', searchFrom)
    if (braceIdx === -1) break

    let depth = 0, end = -1
    for (let i = braceIdx; i < response.length; i++) {
      if (response[i] === '{') depth++
      else if (response[i] === '}') { depth--; if (depth === 0) { end = i; break } }
    }
    if (end === -1) break

    const chunk = response.slice(braceIdx, end + 1)
    searchFrom = end + 1

    try {
      const obj = JSON.parse(chunk) as { name?: string; parameters?: Record<string, unknown> }
      if (!obj.name || !validNames.has(obj.name)) continue
      const flat: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(obj.parameters ?? {})) {
        flat[k] = (v && typeof v === 'object' && 'value' in (v as object))
          ? (v as { value: unknown }).value : v
      }
      calls.push({
        id: `llama_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'function',
        function: { name: obj.name, arguments: JSON.stringify(flat) },
      })
    } catch { /* malformed chunk — skip */ }
  }

  return calls.length > 0 ? calls : null
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (request.method === 'GET' && url.pathname === '/health') {
      return Response.json({ status: 'ok', service: 'cf-server-health-agent', model: MODEL })
    }

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 })
    }

    let body: { task?: string; docker_url?: string; endpoint_name?: string }
    try {
      body = await request.json() as typeof body
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { task, docker_url, endpoint_name } = body
    if (!task || !docker_url) {
      return Response.json({ error: 'Missing required fields: task, docker_url' }, { status: 400 })
    }

    const label = endpoint_name ? ` (${endpoint_name})` : ''
    const system = `You are a server health monitoring specialist. You have access to a Docker Engine API at ${docker_url}${label} via the provided tools.

Always follow this procedure to produce a complete health report:
1. Call system_info — get OS, CPU count, total memory, Docker version, running/stopped container counts.
2. Call list_containers (all=true) — get the full container inventory. Note which are stopped or restarting.
3. Call get_resource_usage — get per-container CPU and memory usage.
4. Call disk_usage — get Docker disk footprint for images, containers, and volumes.
5. Call exec_in_container with command "df -h" on the first running container that likely has a shell (prefer containers named: nginx, app, api, backend, postgres, web). If it fails, try the next container.
6. Call exec_in_container with command "free -h && uptime" on the same container to get RAM and load average.

Then produce a structured report with these sections:
- Overall status: HEALTHY / WARNING / CRITICAL with a one-line reason
- Host: OS, kernel, hostname, CPU count, total RAM
- Containers: running vs total, list any stopped/restarting containers by name
- Resources: per-container CPU% and memory usage
- Disk: host filesystem usage (from df -h), Docker disk footprint
- Load: from uptime output
- Warnings: flag disk > 80%, containers in restart loops, CPU > 80%, memory > 90%

Be concise. Use bullet points and short headers. Do not repeat raw JSON.`

    const messages: Message[] = [
      { role: 'system', content: system },
      { role: 'user', content: task },
    ]

    const tools = getToolDefinitions()
    let toolCallCount = 0
    let finalText = ''

    // Tie all LLM calls in this request to the same Workers AI instance for prompt cache hits
    const sessionId = `ses_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`

    // Health check needs 6 tool steps (one per procedure step); 7 gives a wrap-up buffer
    const MAX_TOOL_STEPS = 7

    try {
      for (let step = 0; step <= MAX_TOOL_STEPS; step++) {
        const isWrapUp = step === MAX_TOOL_STEPS

        if (isWrapUp) {
          messages.push({
            role: 'user',
            content: 'You have all the data you need. Write your final health report now — do NOT call any more tools.',
          })
        }

        let result!: AiResponse
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            result = await (env.AI.run as Function)(
              MODEL,
              isWrapUp ? { messages } : { messages, tools },
              { extraHeaders: { 'x-session-affinity': sessionId } },
            ) as AiResponse
            break
          } catch (aiErr) {
            const msg = aiErr instanceof Error ? aiErr.message : String(aiErr)
            if (msg.includes('429') && attempt < 2) {
              await new Promise(r => setTimeout(r, (attempt + 1) * 5000))
              continue
            }
            throw aiErr
          }
        }

        const validToolNames = new Set(tools.map(t => t.function.name))
        const activeCalls: OaiToolCall[] = isWrapUp
          ? []
          : (result.tool_calls && result.tool_calls.length > 0)
            ? result.tool_calls
            : (parseLlamaInlineToolCalls(result.response ?? '', validToolNames) ?? [])

        if (activeCalls.length > 0) {
          messages.push({ role: 'assistant', content: null, tool_calls: activeCalls })

          for (const call of activeCalls) {
            toolCallCount++
            let toolResult: unknown
            try {
              const args = JSON.parse(call.function.arguments || '{}') as Record<string, unknown>
              toolResult = await executeTool(call.function.name, args, docker_url)
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
          finalText = result.response?.trim() ?? ''
          break
        }
      }

      if (!finalText) {
        const attempted = messages
          .filter((m): m is AssistantMessage => m.role === 'assistant' && Array.isArray(m.tool_calls))
          .flatMap(m => m.tool_calls ?? [])
          .map(c => c.function.name)
          .join(', ')
        finalText = attempted
          ? `The agent ran ${toolCallCount} tool call(s) (${attempted}) but could not produce a final report. Check the Docker endpoint URL.`
          : 'No tools were called and no response was generated. The model may have failed to start.'
      }

      return Response.json({ output: finalText, success: true, tool_calls: toolCallCount })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return Response.json({ output: message, success: false }, { status: 500 })
    }
  },
}
