import { generateText } from 'ai'
import { createWorkersAI } from 'workers-ai-provider'
import { dockerTools } from './docker-tools'

export interface Env {
  AI: Ai
}

interface RequestBody {
  task: string
  docker_url: string
  endpoint_name?: string
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
      return Response.json({ status: 'ok', service: 'cf-docker-agent' })
    }

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 })
    }

    let body: RequestBody
    try {
      body = await request.json() as RequestBody
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { task, docker_url, endpoint_name } = body
    if (!task || !docker_url) {
      return Response.json({ error: 'Missing required fields: task, docker_url' }, { status: 400 })
    }

    const endpointLabel = endpoint_name ? ` (${endpoint_name})` : ''
    const systemPrompt = `You are a Docker operations specialist with direct access to a Docker Engine REST API at: ${docker_url}${endpointLabel}.

Use the provided tools to interact with Docker. Always call tools to retrieve real data before composing your answer.
Guidelines:
- For listing/inspection tasks: call the relevant tool and summarise the results clearly.
- For operational tasks (run, stop, remove): confirm what you are about to do, call the tool, and report the outcome.
- Be concise — one short paragraph or a compact list. No unnecessary prose.
- If a tool call fails with a permission or connection error, report the exact error to the user.`

    try {
      const workersai = createWorkersAI({ binding: env.AI })
      const { text, steps } = await generateText({
        model: workersai('@cf/meta/llama-3.1-8b-instruct-fp8-fast'),
        system: systemPrompt,
        prompt: task,
        tools: dockerTools(docker_url),
        maxSteps: 12,
      })

      const toolCallCount = steps.reduce((n, s) => n + (s.toolCalls?.length ?? 0), 0)
      return Response.json({
        output: text,
        success: true,
        tool_calls: toolCallCount,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return Response.json({ output: message, success: false }, { status: 500 })
    }
  },
}
