// OpenAI-style tool definitions as expected by Cloudflare Workers AI.
export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: {
      type: 'object'
      properties: Record<string, { type: string; description?: string }>
      required?: string[]
    }
  }
}

export function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      type: 'function',
      function: {
        name: 'list_containers',
        description: 'List Docker containers. Set all=true to include stopped containers.',
        parameters: {
          type: 'object',
          properties: {
            all: { type: 'boolean', description: 'Include stopped containers (default false)' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'inspect_container',
        description: 'Get detailed configuration and state for a container.',
        parameters: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Container ID or name' },
          },
          required: ['id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_container_logs',
        description: 'Fetch stdout/stderr logs from a container.',
        parameters: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Container ID or name' },
            tail: { type: 'string', description: 'Lines to tail, default 100' },
            timestamps: { type: 'boolean', description: 'Prefix lines with timestamps' },
          },
          required: ['id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'container_stats',
        description: 'Get one-shot CPU, memory, and network I/O stats for a container.',
        parameters: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Container ID or name' },
          },
          required: ['id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'run_container',
        description: 'Create and start a Docker container.',
        parameters: {
          type: 'object',
          properties: {
            image: { type: 'string', description: 'Image name, e.g. nginx:latest' },
            name: { type: 'string', description: 'Optional container name' },
            env: { type: 'string', description: 'Comma-separated KEY=VALUE env vars' },
          },
          required: ['image'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'stop_container',
        description: 'Stop a running container.',
        parameters: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Container ID or name' },
          },
          required: ['id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'remove_container',
        description: 'Remove a stopped container. Use force=true to kill and remove running containers.',
        parameters: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Container ID or name' },
            force: { type: 'boolean', description: 'Force remove even if running' },
          },
          required: ['id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'list_images',
        description: 'List Docker images available on the host.',
        parameters: {
          type: 'object',
          properties: {
            all: { type: 'boolean', description: 'Include intermediate images' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'exec_in_container',
        description: 'Run a shell command inside a running container and return its output.',
        parameters: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Container ID or name' },
            command: { type: 'string', description: 'Shell command to run, e.g. "df -h"' },
          },
          required: ['id', 'command'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'docker_system_info',
        description: 'Get Docker daemon info: version, OS, total containers and images.',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
    },
  ]
}

// ── Execution ─────────────────────────────────────────────────────────────────

async function dockerGet(base: string, path: string): Promise<unknown> {
  const res = await fetch(`${base}${path}`)
  if (!res.ok) throw new Error(`Docker API ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return res.json()
}

async function dockerPost(base: string, path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok && res.status !== 204) throw new Error(`Docker API ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const text = await res.text()
  if (!text) return { ok: true }
  try { return JSON.parse(text) } catch { return { raw: text.slice(0, 500) } }
}

async function parseDockerLogs(buffer: ArrayBuffer): Promise<string> {
  const view = new DataView(buffer)
  const decoder = new TextDecoder()
  const lines: string[] = []
  let offset = 0
  while (offset + 8 <= buffer.byteLength) {
    const size = view.getUint32(offset + 4, false)
    offset += 8
    if (size === 0) continue
    if (offset + size > buffer.byteLength) break
    lines.push(decoder.decode(buffer.slice(offset, offset + size)))
    offset += size
  }
  return lines.join('') || new TextDecoder().decode(buffer)
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  dockerUrl: string
): Promise<unknown> {
  const base = dockerUrl.replace(/\/$/, '')

  switch (name) {
    case 'list_containers':
      return dockerGet(base, `/containers/json?all=${args.all ?? false}`)

    case 'inspect_container':
      return dockerGet(base, `/containers/${encodeURIComponent(args.id as string)}/json`)

    case 'get_container_logs': {
      const tail = args.tail ?? '100'
      const ts = args.timestamps ? '&timestamps=true' : ''
      const path = `/containers/${encodeURIComponent(args.id as string)}/logs?stdout=true&stderr=true&tail=${tail}${ts}`
      const res = await fetch(`${base}${path}`)
      if (!res.ok) throw new Error(`Docker API ${res.status}: ${await res.text()}`)
      const buf = await res.arrayBuffer()
      return { logs: (await parseDockerLogs(buf)).slice(-6000) }
    }

    case 'container_stats':
      return dockerGet(base, `/containers/${encodeURIComponent(args.id as string)}/stats?stream=false`)

    case 'run_container': {
      const body: Record<string, unknown> = { Image: args.image }
      if (args.env) {
        body.Env = (args.env as string).split(',').map(s => s.trim()).filter(Boolean)
      }
      const qs = args.name ? `?name=${encodeURIComponent(args.name as string)}` : ''
      const created = await dockerPost(base, `/containers/create${qs}`, body) as { Id: string }
      await dockerPost(base, `/containers/${created.Id}/start`)
      return { id: created.Id, started: true }
    }

    case 'stop_container':
      await dockerPost(base, `/containers/${encodeURIComponent(args.id as string)}/stop?t=10`)
      return { stopped: true }

    case 'remove_container': {
      const res = await fetch(
        `${base}/containers/${encodeURIComponent(args.id as string)}?force=${args.force ?? false}`,
        { method: 'DELETE' }
      )
      if (!res.ok && res.status !== 204) throw new Error(`Docker API ${res.status}: ${await res.text()}`)
      return { removed: true }
    }

    case 'list_images':
      return dockerGet(base, `/images/json?all=${args.all ?? false}`)

    case 'exec_in_container': {
      const cmd = (args.command as string).split(' ')
      const exec = await dockerPost(base, `/containers/${encodeURIComponent(args.id as string)}/exec`, {
        AttachStdout: true, AttachStderr: true, Cmd: cmd,
      }) as { Id: string }
      const res = await fetch(`${base}/exec/${exec.Id}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ Detach: false, Tty: false }),
      })
      if (!res.ok) throw new Error(`Exec start ${res.status}: ${await res.text()}`)
      return { output: (await parseDockerLogs(await res.arrayBuffer())).slice(-3000) }
    }

    case 'docker_system_info': {
      const [info, version] = await Promise.all([
        dockerGet(base, '/info'),
        dockerGet(base, '/version'),
      ])
      return { info, version }
    }

    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}
