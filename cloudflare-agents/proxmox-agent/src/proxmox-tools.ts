export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: {
      type: 'object'
      properties: Record<string, { type: string; description?: string; enum?: string[] }>
      required?: string[]
    }
  }
}

export function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      type: 'function',
      function: {
        name: 'get_cluster_status',
        description: 'Get Proxmox cluster overview: node list, quorum status, HA status.',
        parameters: { type: 'object', properties: {} },
      },
    },
    {
      type: 'function',
      function: {
        name: 'list_nodes',
        description: 'List all Proxmox nodes with CPU usage, memory usage, uptime, and status.',
        parameters: { type: 'object', properties: {} },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_node_status',
        description: 'Get detailed status for a specific node: CPU, memory, disk, uptime, load average, kernel version.',
        parameters: {
          type: 'object',
          properties: {
            node: { type: 'string', description: 'Node name, e.g. "pve"' },
          },
          required: ['node'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'list_vms',
        description: 'List all QEMU/KVM virtual machines on a node with vmid, name, status, CPU cores, memory, and disk.',
        parameters: {
          type: 'object',
          properties: {
            node: { type: 'string', description: 'Node name, e.g. "pve"' },
          },
          required: ['node'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_vm_status',
        description: 'Get detailed runtime status of a specific VM: power state, CPU usage, memory, uptime, PID.',
        parameters: {
          type: 'object',
          properties: {
            node: { type: 'string', description: 'Node name' },
            vmid: { type: 'string', description: 'VM ID number, e.g. "100"' },
          },
          required: ['node', 'vmid'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'vm_action',
        description: 'Perform a power action on a VM: start, shutdown (graceful), stop (force), reboot, or reset.',
        parameters: {
          type: 'object',
          properties: {
            node: { type: 'string', description: 'Node name' },
            vmid: { type: 'string', description: 'VM ID number' },
            action: {
              type: 'string',
              description: 'Action to perform',
              enum: ['start', 'shutdown', 'stop', 'reboot', 'reset'],
            },
          },
          required: ['node', 'vmid', 'action'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'list_containers',
        description: 'List all LXC containers on a node with vmid, name, status, CPU, and memory.',
        parameters: {
          type: 'object',
          properties: {
            node: { type: 'string', description: 'Node name, e.g. "pve"' },
          },
          required: ['node'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_container_status',
        description: 'Get detailed runtime status of a specific LXC container.',
        parameters: {
          type: 'object',
          properties: {
            node: { type: 'string', description: 'Node name' },
            vmid: { type: 'string', description: 'Container ID number' },
          },
          required: ['node', 'vmid'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'container_action',
        description: 'Perform a power action on an LXC container: start, shutdown, stop, or reboot.',
        parameters: {
          type: 'object',
          properties: {
            node: { type: 'string', description: 'Node name' },
            vmid: { type: 'string', description: 'Container ID number' },
            action: {
              type: 'string',
              description: 'Action to perform',
              enum: ['start', 'shutdown', 'stop', 'reboot'],
            },
          },
          required: ['node', 'vmid', 'action'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'list_storage',
        description: 'List storage pools on a node with type, total size, used space, and available space.',
        parameters: {
          type: 'object',
          properties: {
            node: { type: 'string', description: 'Node name, e.g. "pve"' },
          },
          required: ['node'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_node_tasks',
        description: 'Get recent task history for a node — shows recent operations, their status, and start times.',
        parameters: {
          type: 'object',
          properties: {
            node: { type: 'string', description: 'Node name' },
            limit: { type: 'string', description: 'Max tasks to return, default 10' },
          },
          required: ['node'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'list_vm_snapshots',
        description: 'List all snapshots for a VM.',
        parameters: {
          type: 'object',
          properties: {
            node: { type: 'string', description: 'Node name' },
            vmid: { type: 'string', description: 'VM ID number' },
          },
          required: ['node', 'vmid'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_vm_config',
        description: 'Get the full hardware configuration of a VM: CPU count, memory, disk layout, network interfaces, boot order.',
        parameters: {
          type: 'object',
          properties: {
            node: { type: 'string', description: 'Node name' },
            vmid: { type: 'string', description: 'VM ID number' },
          },
          required: ['node', 'vmid'],
        },
      },
    },
  ]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function pveGet(base: string, token: string, path: string): Promise<unknown> {
  const res = await fetch(`${base}${path}`, {
    headers: { Authorization: `PVEAPIToken=${token}` },
  })
  if (!res.ok) throw new Error(`Proxmox API ${res.status} on ${path}: ${(await res.text()).slice(0, 300)}`)
  const json = await res.json() as { data?: unknown }
  return json.data ?? json
}

async function pvePost(base: string, token: string, path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `PVEAPIToken=${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`Proxmox API ${res.status} on ${path}: ${(await res.text()).slice(0, 300)}`)
  const json = await res.json() as { data?: unknown }
  return json.data ?? json
}

function toHuman(bytes: number): string {
  if (bytes >= 1099511627776) return `${(bytes / 1099511627776).toFixed(2)} TB`
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(2)} GB`
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`
  return `${(bytes / 1024).toFixed(1)} KB`
}

function toUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

// ── Tool execution ─────────────────────────────────────────────────────────────

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  proxmoxUrl: string,
  proxmoxToken: string
): Promise<unknown> {
  const base = proxmoxUrl.replace(/\/+$/, '')

  switch (name) {
    case 'get_cluster_status': {
      const data = await pveGet(base, proxmoxToken, '/cluster/status') as Array<Record<string, unknown>>
      return data.map((item) => ({
        type: item.type,
        name: item.name,
        status: item.online !== undefined ? (item.online ? 'online' : 'offline') : item.state,
        ...(item.quorate !== undefined ? { quorate: item.quorate } : {}),
        ...(item.nodes !== undefined ? { nodes: item.nodes } : {}),
      }))
    }

    case 'list_nodes': {
      const data = await pveGet(base, proxmoxToken, '/nodes') as Array<Record<string, unknown>>
      return data.map((n) => ({
        node: n.node,
        status: n.status,
        uptime: toUptime(n.uptime as number ?? 0),
        cpu_percent: `${((n.cpu as number ?? 0) * 100).toFixed(1)}%`,
        memory: {
          used: toHuman(n.mem as number ?? 0),
          total: toHuman(n.maxmem as number ?? 0),
          percent: `${(((n.mem as number ?? 0) / (n.maxmem as number ?? 1)) * 100).toFixed(1)}%`,
        },
        disk: {
          used: toHuman(n.disk as number ?? 0),
          total: toHuman(n.maxdisk as number ?? 0),
        },
        vms: n.maxcpu,
      }))
    }

    case 'get_node_status': {
      const node = args.node as string
      const data = await pveGet(base, proxmoxToken, `/nodes/${node}/status`) as Record<string, unknown>
      const cpu = data.cpu as Record<string, unknown>
      const mem = data.memory as Record<string, unknown>
      const swap = data.swap as Record<string, unknown>
      const rootfs = data.rootfs as Record<string, unknown>
      const loadavg = data.loadavg as number[]
      return {
        node,
        uptime: toUptime(data.uptime as number ?? 0),
        cpu: {
          usage: `${((data.cpu as number ?? 0) * 100).toFixed(2)}%`,
          cores: cpu?.cpus,
          model: cpu?.model,
        },
        memory: {
          used: toHuman(mem?.used as number ?? 0),
          total: toHuman(mem?.total as number ?? 0),
          percent: `${(((mem?.used as number ?? 0) / (mem?.total as number ?? 1)) * 100).toFixed(1)}%`,
        },
        swap: {
          used: toHuman(swap?.used as number ?? 0),
          total: toHuman(swap?.total as number ?? 0),
        },
        disk_root: {
          used: toHuman(rootfs?.used as number ?? 0),
          total: toHuman(rootfs?.total as number ?? 0),
        },
        load_avg: loadavg ? `${loadavg[0]}, ${loadavg[1]}, ${loadavg[2]}` : 'unavailable',
        kernel: data.kversion,
        pve_version: data.pveversion,
      }
    }

    case 'list_vms': {
      const node = args.node as string
      const data = await pveGet(base, proxmoxToken, `/nodes/${node}/qemu`) as Array<Record<string, unknown>>
      return data.map((vm) => ({
        vmid: vm.vmid,
        name: vm.name ?? `vm-${vm.vmid}`,
        status: vm.status,
        cpu_percent: vm.status === 'running' ? `${((vm.cpu as number ?? 0) * 100).toFixed(2)}%` : 'off',
        memory: vm.status === 'running'
          ? { used: toHuman(vm.mem as number ?? 0), total: toHuman(vm.maxmem as number ?? 0) }
          : { total: toHuman(vm.maxmem as number ?? 0) },
        disk: toHuman(vm.maxdisk as number ?? 0),
        uptime: vm.status === 'running' ? toUptime(vm.uptime as number ?? 0) : '-',
        cpus: vm.cpus,
      }))
    }

    case 'get_vm_status': {
      const { node, vmid } = args as { node: string; vmid: string }
      const data = await pveGet(base, proxmoxToken, `/nodes/${node}/qemu/${vmid}/status/current`) as Record<string, unknown>
      return {
        vmid,
        name: data.name,
        status: data.qmpstatus ?? data.status,
        cpu_percent: `${((data.cpu as number ?? 0) * 100).toFixed(2)}%`,
        memory: {
          used: toHuman(data.mem as number ?? 0),
          total: toHuman(data.maxmem as number ?? 0),
          percent: `${(((data.mem as number ?? 0) / (data.maxmem as number ?? 1)) * 100).toFixed(1)}%`,
        },
        uptime: toUptime(data.uptime as number ?? 0),
        cpus: data.cpus,
        pid: data.pid,
        ha_managed: data.ha?.managed,
      }
    }

    case 'vm_action': {
      const { node, vmid, action } = args as { node: string; vmid: string; action: string }
      const validActions = ['start', 'shutdown', 'stop', 'reboot', 'reset']
      if (!validActions.includes(action)) throw new Error(`Invalid action: ${action}. Must be one of: ${validActions.join(', ')}`)
      const result = await pvePost(base, proxmoxToken, `/nodes/${node}/qemu/${vmid}/status/${action}`)
      return { task_id: result, action, vmid, node, message: `${action} command sent to VM ${vmid}` }
    }

    case 'list_containers': {
      const node = args.node as string
      const data = await pveGet(base, proxmoxToken, `/nodes/${node}/lxc`) as Array<Record<string, unknown>>
      return data.map((ct) => ({
        vmid: ct.vmid,
        name: ct.name ?? `ct-${ct.vmid}`,
        status: ct.status,
        cpu_percent: ct.status === 'running' ? `${((ct.cpu as number ?? 0) * 100).toFixed(2)}%` : 'off',
        memory: ct.status === 'running'
          ? { used: toHuman(ct.mem as number ?? 0), total: toHuman(ct.maxmem as number ?? 0) }
          : { total: toHuman(ct.maxmem as number ?? 0) },
        uptime: ct.status === 'running' ? toUptime(ct.uptime as number ?? 0) : '-',
        cpus: ct.cpus,
      }))
    }

    case 'get_container_status': {
      const { node, vmid } = args as { node: string; vmid: string }
      const data = await pveGet(base, proxmoxToken, `/nodes/${node}/lxc/${vmid}/status/current`) as Record<string, unknown>
      return {
        vmid,
        name: data.name,
        status: data.status,
        cpu_percent: `${((data.cpu as number ?? 0) * 100).toFixed(2)}%`,
        memory: {
          used: toHuman(data.mem as number ?? 0),
          total: toHuman(data.maxmem as number ?? 0),
          percent: `${(((data.mem as number ?? 0) / (data.maxmem as number ?? 1)) * 100).toFixed(1)}%`,
        },
        uptime: toUptime(data.uptime as number ?? 0),
        cpus: data.cpus,
      }
    }

    case 'container_action': {
      const { node, vmid, action } = args as { node: string; vmid: string; action: string }
      const validActions = ['start', 'shutdown', 'stop', 'reboot']
      if (!validActions.includes(action)) throw new Error(`Invalid action: ${action}. Must be one of: ${validActions.join(', ')}`)
      const result = await pvePost(base, proxmoxToken, `/nodes/${node}/lxc/${vmid}/status/${action}`)
      return { task_id: result, action, vmid, node, message: `${action} command sent to container ${vmid}` }
    }

    case 'list_storage': {
      const node = args.node as string
      const data = await pveGet(base, proxmoxToken, `/nodes/${node}/storage`) as Array<Record<string, unknown>>
      return data.map((s) => ({
        storage: s.storage,
        type: s.type,
        content: s.content,
        active: s.active,
        used: toHuman(s.used as number ?? 0),
        total: toHuman(s.total as number ?? 0),
        available: toHuman(s.avail as number ?? 0),
        percent_used: s.total ? `${(((s.used as number ?? 0) / (s.total as number ?? 1)) * 100).toFixed(1)}%` : 'N/A',
      }))
    }

    case 'get_node_tasks': {
      const node = args.node as string
      const limit = args.limit ?? '10'
      const data = await pveGet(base, proxmoxToken, `/nodes/${node}/tasks?limit=${limit}`) as Array<Record<string, unknown>>
      return data.map((t) => ({
        task_id: t.upid,
        type: t.type,
        user: t.user,
        status: t.status ?? (t.endtime ? 'finished' : 'running'),
        started: t.starttime ? new Date((t.starttime as number) * 1000).toISOString() : 'unknown',
        node: t.node,
        description: t.id,
      }))
    }

    case 'list_vm_snapshots': {
      const { node, vmid } = args as { node: string; vmid: string }
      const data = await pveGet(base, proxmoxToken, `/nodes/${node}/qemu/${vmid}/snapshot`) as Array<Record<string, unknown>>
      return data.map((s) => ({
        name: s.name,
        description: s.description,
        snaptime: s.snaptime ? new Date((s.snaptime as number) * 1000).toISOString() : null,
        vmstate: s.vmstate,
        parent: s.parent,
      }))
    }

    case 'get_vm_config': {
      const { node, vmid } = args as { node: string; vmid: string }
      const data = await pveGet(base, proxmoxToken, `/nodes/${node}/qemu/${vmid}/config`) as Record<string, unknown>
      return {
        vmid,
        name: data.name,
        cores: data.cores,
        sockets: data.sockets,
        memory: `${data.memory} MB`,
        bios: data.bios,
        boot: data.boot,
        ostype: data.ostype,
        disks: Object.entries(data)
          .filter(([k]) => /^(virtio|scsi|ide|sata)\d+$/.test(k))
          .map(([k, v]) => ({ slot: k, config: v })),
        networks: Object.entries(data)
          .filter(([k]) => /^net\d+$/.test(k))
          .map(([k, v]) => ({ slot: k, config: v })),
        agent: data.agent,
        tags: data.tags,
      }
    }

    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}
