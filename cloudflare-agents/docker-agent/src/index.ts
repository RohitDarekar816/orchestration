import { getToolDefinitions, executeTool } from './docker-tools'

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

// OpenAI-style tool call as returned by Llama 4 Scout via Workers AI
interface OaiToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string  // JSON-encoded string, not an object
  }
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
      return Response.json({ status: 'ok', service: 'cf-docker-agent', model: MODEL })
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
    const system = `You are a Docker operations specialist. You have direct access to a Docker Engine API at ${docker_url}${label} via the provided tools.

Rules:
- ALWAYS call a tool to get real data. Never guess or fabricate container names, IDs, or status.
- For listing tasks: call list_containers or list_images, then summarise the real results.
- For log tasks: call get_container_logs with the exact tail count the user requested. Then output EVERY log line verbatim — do NOT summarise, truncate, or paraphrase log lines.
- For counts or status: a short paragraph or bullet list is fine.
- If a tool returns an error, report it exactly.`

    const messages: Message[] = [
      { role: 'system', content: system },
      { role: 'user', content: task },
    ]

    const tools = getToolDefinitions()
    let toolCallCount = 0
    let finalText = ''

    try {
      for (let step = 0; step < 10; step++) {
        const result = await (env.AI.run as Function)(MODEL, { messages, tools }) as AiResponse

        if (result.tool_calls && result.tool_calls.length > 0) {
          // Record the assistant turn that produced these tool calls
          messages.push({
            role: 'assistant',
            content: null,
            tool_calls: result.tool_calls,
          })

          for (const call of result.tool_calls) {
            toolCallCount++
            let toolResult: unknown
            try {
              // arguments is a JSON string from the model, must be parsed
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
