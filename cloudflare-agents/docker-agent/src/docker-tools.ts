import { tool } from 'ai'
import { z } from 'zod'

async function dockerFetch(baseUrl: string, path: string, init?: RequestInit): Promise<unknown> {
  const url = `${baseUrl.replace(/\/$/, '')}${path}`
  const res = await fetch(url, init)
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Docker API ${res.status} ${res.statusText}: ${body.slice(0, 300)}`)
  }
  const contentType = res.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    return res.json()
  }
  return { raw: await res.text() }
}

async function dockerJSON(baseUrl: string, path: string, init?: RequestInit): Promise<unknown> {
  return dockerFetch(baseUrl, path, init)
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
  const result = lines.join('')
  return result || decoder.decode(buffer)
}

export function dockerTools(dockerUrl: string) {
  const base = dockerUrl.replace(/\/$/, '')

  return {
    list_containers: tool({
      description: 'List Docker containers on the host. all=true includes stopped containers.',
      parameters: z.object({ all: z.boolean().optional().default(false) }),
      execute: async ({ all }) =>
        dockerJSON(base, `/containers/json?all=${all}`),
    }),

    inspect_container: tool({
      description: 'Get detailed configuration and state for a container by ID or name.',
      parameters: z.object({ id: z.string().describe('Container ID or name') }),
      execute: async ({ id }) =>
        dockerJSON(base, `/containers/${encodeURIComponent(id)}/json`),
    }),

    get_container_logs: tool({
      description: 'Fetch stdout/stderr logs from a container.',
      parameters: z.object({
        id: z.string().describe('Container ID or name'),
        tail: z.union([z.string(), z.number()]).optional().default('100').describe('Lines to tail, or "all"'),
        since: z.number().optional().describe('Unix timestamp — only show logs since this time'),
        timestamps: z.boolean().optional().default(false),
      }),
      execute: async ({ id, tail, since, timestamps }) => {
        let path = `/containers/${encodeURIComponent(id)}/logs?stdout=true&stderr=true&tail=${tail}&timestamps=${timestamps}`
        if (since) path += `&since=${since}`
        const res = await fetch(`${base}${path}`)
        if (!res.ok) throw new Error(`Docker API ${res.status}: ${await res.text()}`)
        const buf = await res.arrayBuffer()
        const logs = await parseDockerLogs(buf)
        return { logs: logs.slice(-8000) }
      },
    }),

    container_stats: tool({
      description: 'Get one-shot resource usage stats (CPU, memory, network I/O) for a container.',
      parameters: z.object({ id: z.string().describe('Container ID or name') }),
      execute: async ({ id }) =>
        dockerJSON(base, `/containers/${encodeURIComponent(id)}/stats?stream=false`),
    }),

    run_container: tool({
      description: 'Create and start a Docker container.',
      parameters: z.object({
        image: z.string().describe('Image name, e.g. nginx:latest'),
        name: z.string().optional().describe('Optional container name'),
        command: z.array(z.string()).optional().describe('Override image CMD'),
        env: z.array(z.string()).optional().describe('Env vars as KEY=VALUE strings'),
        port_bindings: z.record(
          z.array(z.object({ HostIp: z.string().optional(), HostPort: z.string() }))
        ).optional().describe('Port bindings, e.g. {"80/tcp": [{"HostPort": "8080"}]}'),
        auto_remove: z.boolean().optional().default(false),
      }),
      execute: async ({ image, name, command, env, port_bindings, auto_remove }) => {
        const body: Record<string, unknown> = { Image: image }
        if (command) body.Cmd = command
        if (env) body.Env = env
        const hostConfig: Record<string, unknown> = { AutoRemove: auto_remove }
        if (port_bindings) {
          body.ExposedPorts = Object.fromEntries(Object.keys(port_bindings).map(k => [k, {}]))
          hostConfig.PortBindings = port_bindings
        }
        body.HostConfig = hostConfig

        const qs = name ? `?name=${encodeURIComponent(name)}` : ''
        const created = await dockerJSON(base, `/containers/create${qs}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }) as { Id: string; Warnings: string[] }

        await dockerJSON(base, `/containers/${created.Id}/start`, { method: 'POST' })
        return { id: created.Id, warnings: created.Warnings, started: true }
      },
    }),

    stop_container: tool({
      description: 'Stop a running container gracefully (SIGTERM, then SIGKILL after timeout).',
      parameters: z.object({
        id: z.string().describe('Container ID or name'),
        timeout: z.number().optional().default(10).describe('Seconds before SIGKILL'),
      }),
      execute: async ({ id, timeout }) => {
        await dockerJSON(base, `/containers/${encodeURIComponent(id)}/stop?t=${timeout}`, { method: 'POST' })
        return { stopped: true }
      },
    }),

    remove_container: tool({
      description: 'Remove a stopped container. Use force=true to kill and remove a running container.',
      parameters: z.object({
        id: z.string().describe('Container ID or name'),
        force: z.boolean().optional().default(false),
        remove_volumes: z.boolean().optional().default(false),
      }),
      execute: async ({ id, force, remove_volumes }) => {
        const res = await fetch(
          `${base}/containers/${encodeURIComponent(id)}?force=${force}&v=${remove_volumes}`,
          { method: 'DELETE' }
        )
        if (!res.ok) throw new Error(`Docker API ${res.status}: ${await res.text()}`)
        return { removed: true }
      },
    }),

    list_images: tool({
      description: 'List Docker images available on the host.',
      parameters: z.object({ all: z.boolean().optional().default(false) }),
      execute: async ({ all }) =>
        dockerJSON(base, `/images/json?all=${all}`),
    }),

    pull_image: tool({
      description: 'Pull a Docker image from a registry.',
      parameters: z.object({
        image: z.string().describe('Image reference, e.g. nginx:latest or ubuntu:24.04'),
      }),
      execute: async ({ image }) => {
        const [fromImage, tag] = image.includes(':') ? image.split(':') : [image, 'latest']
        const res = await fetch(
          `${base}/images/create?fromImage=${encodeURIComponent(fromImage)}&tag=${encodeURIComponent(tag)}`,
          { method: 'POST' }
        )
        if (!res.ok) throw new Error(`Docker API ${res.status}: ${await res.text()}`)
        const text = await res.text()
        return { pulled: true, summary: text.slice(-500) }
      },
    }),

    exec_in_container: tool({
      description: 'Execute a command inside a running container and return its output.',
      parameters: z.object({
        id: z.string().describe('Container ID or name'),
        command: z.array(z.string()).describe('Command + args array, e.g. ["df", "-h"]'),
      }),
      execute: async ({ id, command }) => {
        const exec = await dockerJSON(base, `/containers/${encodeURIComponent(id)}/exec`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ AttachStdout: true, AttachStderr: true, Cmd: command }),
        }) as { Id: string }

        const res = await fetch(`${base}/exec/${exec.Id}/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ Detach: false, Tty: false }),
        })
        if (!res.ok) throw new Error(`Exec start error ${res.status}: ${await res.text()}`)
        const buf = await res.arrayBuffer()
        const output = await parseDockerLogs(buf)
        return { output: output.slice(-4000) }
      },
    }),

    docker_system_info: tool({
      description: 'Get Docker daemon info: version, OS, total containers/images, memory limits.',
      parameters: z.object({}),
      execute: async () => {
        const [info, version] = await Promise.all([
          dockerJSON(base, '/info'),
          dockerJSON(base, '/version'),
        ])
        return { info, version }
      },
    }),

    list_networks: tool({
      description: 'List Docker networks.',
      parameters: z.object({}),
      execute: async () =>
        dockerJSON(base, '/networks'),
    }),

    list_volumes: tool({
      description: 'List Docker volumes.',
      parameters: z.object({}),
      execute: async () =>
        dockerJSON(base, '/volumes'),
    }),
  }
}
