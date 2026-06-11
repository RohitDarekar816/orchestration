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
        name: 'system_info',
        description: 'Get Docker host info: OS, kernel, CPU count, total memory, Docker version, and container counts (running/paused/stopped).',
        parameters: { type: 'object', properties: {} },
      },
    },
    {
      type: 'function',
      function: {
        name: 'disk_usage',
        description: 'Get Docker disk usage: space consumed by images, containers, and volumes.',
        parameters: { type: 'object', properties: {} },
      },
    },
    {
      type: 'function',
      function: {
        name: 'list_containers',
        description: 'List all containers (running and stopped) with name, image, status, and state.',
        parameters: {
          type: 'object',
          properties: {
            all: { type: 'boolean', description: 'Include stopped containers, default true' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_resource_usage',
        description: 'Get CPU and memory usage for every running container. Returns per-container stats and totals.',
        parameters: { type: 'object', properties: {} },
      },
    },
    {
      type: 'function',
      function: {
        name: 'exec_in_container',
        description: 'Run a shell command inside a running container. Use to get host-level metrics: "df -h" for disk space, "free -h" for RAM, "uptime" for load average. Try containers likely to have a shell (nginx, app, api, backend, postgres).',
        parameters: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Container name or ID' },
            command: { type: 'string', description: 'Shell command, e.g. "df -h" or "free -h && uptime"' },
          },
          required: ['id', 'command'],
        },
      },
    },
  ]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function dockerGet(base: string, path: string): Promise<unknown> {
  const res = await fetch(`${base}${path}`)
  if (!res.ok) throw new Error(`Docker API ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return res.json()
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

function toHuman(bytes: number): string {
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(2)} GB`
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

// ── Tool execution ─────────────────────────────────────────────────────────────

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  dockerUrl: string
): Promise<unknown> {
  const base = dockerUrl.replace(/\/$/, '')

  switch (name) {
    case 'system_info': {
      const [info, version] = await Promise.all([
        dockerGet(base, '/info') as Promise<Record<string, unknown>>,
        dockerGet(base, '/version') as Promise<Record<string, unknown>>,
      ])
      return {
        os: info.OperatingSystem,
        kernel: info.KernelVersion,
        arch: info.Architecture,
        cpus: info.NCPU,
        memory_total: toHuman(info.MemTotal as number),
        docker_version: (version as Record<string, unknown>).Version,
        containers: {
          running: info.ContainersRunning,
          paused: info.ContainersPaused,
          stopped: info.ContainersStopped,
          total: info.Containers,
        },
        images: info.Images,
        hostname: info.Name,
        server_time: info.SystemTime,
      }
    }

    case 'disk_usage': {
      const df = await dockerGet(base, '/system/df') as Record<string, unknown>

      const images = (df.Images as Array<Record<string, unknown>>) ?? []
      const containers = (df.Containers as Array<Record<string, unknown>>) ?? []
      const volumes = (df.Volumes as Array<Record<string, unknown>>) ?? []

      const totalImageSize = images.reduce((a, img) => a + ((img.Size as number) ?? 0), 0)
      const totalImageShared = images.reduce((a, img) => a + ((img.SharedSize as number) ?? 0), 0)
      const totalContainerSize = containers.reduce((a, c) => a + ((c.SizeRw as number) ?? 0), 0)
      const totalVolumeSize = volumes.reduce((a, v) => {
        const ud = v.UsageData as Record<string, number> | undefined
        return a + (ud?.Size ?? 0)
      }, 0)

      return {
        images: {
          count: images.length,
          total_size: toHuman(totalImageSize),
          shared_size: toHuman(totalImageShared),
          unique_size: toHuman(totalImageSize - totalImageShared),
        },
        containers: { count: containers.length, rw_layer_size: toHuman(totalContainerSize) },
        volumes: { count: volumes.length, total_size: toHuman(totalVolumeSize) },
      }
    }

    case 'list_containers': {
      const raw = await dockerGet(base, `/containers/json?all=${args.all ?? true}`) as Array<Record<string, unknown>>
      return raw.map((c) => ({
        id: (c.Id as string).slice(0, 12),
        name: (c.Names as string[])[0]?.replace(/^\//, ''),
        image: c.Image,
        status: c.Status,
        state: c.State,
      }))
    }

    case 'get_resource_usage': {
      const running = await dockerGet(base, '/containers/json?all=false') as Array<Record<string, unknown>>
      if (!running.length) return { containers: [], message: 'No running containers' }

      const statsResults = await Promise.allSettled(
        running.map(async (c) => {
          const id = (c.Id as string).slice(0, 12)
          const name = (c.Names as string[])[0]?.replace(/^\//, '')
          try {
            const s = await dockerGet(base, `/containers/${id}/stats?stream=false`) as Record<string, unknown>

            const cpu = s.cpu_stats as Record<string, unknown>
            const precpu = s.precpu_stats as Record<string, unknown>
            const cpuUsage = cpu.cpu_usage as Record<string, unknown>
            const preCpuUsage = precpu.cpu_usage as Record<string, unknown>
            const cpuDelta = (cpuUsage.total_usage as number) - (preCpuUsage.total_usage as number)
            const sysDelta = (cpu.system_cpu_usage as number) - (precpu.system_cpu_usage as number)
            const numCpus = (cpu.online_cpus as number) || (cpuUsage.percpu_usage as unknown[])?.length || 1
            const cpuPct = sysDelta > 0 ? ((cpuDelta / sysDelta) * numCpus * 100).toFixed(2) : '0.00'

            const mem = s.memory_stats as Record<string, unknown>
            const memUsage = (mem.usage as number) - ((mem.stats as Record<string, number>)?.cache ?? 0)
            const memLimit = mem.limit as number
            const memPct = memLimit > 0 ? ((memUsage / memLimit) * 100).toFixed(1) : '0.0'

            return { name, id, cpu: `${cpuPct}%`, memory: { used: toHuman(memUsage), limit: toHuman(memLimit), percent: `${memPct}%` } }
          } catch {
            return { name, id, cpu: 'unavailable', memory: null }
          }
        })
      )

      return {
        containers: statsResults.map((r) =>
          r.status === 'fulfilled' ? r.value : { error: String((r as PromiseRejectedResult).reason) }
        ),
      }
    }

    case 'exec_in_container': {
      const id = args.id as string
      const cmdStr = args.command as string
      const cmd = ['sh', '-c', cmdStr]

      const execRes = await fetch(`${base}/containers/${encodeURIComponent(id)}/exec`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ AttachStdout: true, AttachStderr: true, Cmd: cmd }),
      })
      if (!execRes.ok) throw new Error(`Exec create failed (${execRes.status}): ${await execRes.text()}`)
      const exec = await execRes.json() as { Id: string }

      const startRes = await fetch(`${base}/exec/${exec.Id}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ Detach: false, Tty: false }),
      })
      if (!startRes.ok) throw new Error(`Exec start failed (${startRes.status}): ${await startRes.text()}`)

      const buf = await startRes.arrayBuffer()
      return { output: (await parseDockerLogs(buf)).slice(-3000) }
    }

    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}
