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
    // ── Cluster ────────────────────────────────────────────────────────────────
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
        name: 'get_cluster_resources',
        description: 'Get ALL resources across the entire cluster in one call: every VM, LXC container, node, and storage pool with their current status. Use this for cluster-wide overview queries.',
        parameters: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              description: 'Optional filter: "vm", "lxc", "node", or "storage". Omit for all.',
              enum: ['vm', 'lxc', 'node', 'storage'],
            },
          },
        },
      },
    },
    // ── Nodes ─────────────────────────────────────────────────────────────────
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
        name: 'list_node_network',
        description: 'List network interfaces on a node: bridges, bonds, VLANs, physical NICs with IP addresses and link state.',
        parameters: {
          type: 'object',
          properties: {
            node: { type: 'string', description: 'Node name, e.g. "pve"' },
          },
          required: ['node'],
        },
      },
    },
    // ── QEMU VMs ──────────────────────────────────────────────────────────────
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
    {
      type: 'function',
      function: {
        name: 'vm_action',
        description: 'Perform a power action on a VM: start, shutdown (graceful), stop (force kill), reboot, reset (hard reset), suspend, or resume.',
        parameters: {
          type: 'object',
          properties: {
            node: { type: 'string', description: 'Node name' },
            vmid: { type: 'string', description: 'VM ID number' },
            action: {
              type: 'string',
              description: 'Action to perform',
              enum: ['start', 'shutdown', 'stop', 'reboot', 'reset', 'suspend', 'resume'],
            },
          },
          required: ['node', 'vmid', 'action'],
        },
      },
    },
    // ── VM Snapshots ──────────────────────────────────────────────────────────
    {
      type: 'function',
      function: {
        name: 'list_vm_snapshots',
        description: 'List all snapshots for a VM with name, description, creation time, and parent.',
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
        name: 'create_vm_snapshot',
        description: 'Create a snapshot of a VM. The VM can be running or stopped.',
        parameters: {
          type: 'object',
          properties: {
            node: { type: 'string', description: 'Node name' },
            vmid: { type: 'string', description: 'VM ID number' },
            snapname: { type: 'string', description: 'Snapshot name (no spaces, e.g. "snap1" or "before-update")' },
            description: { type: 'string', description: 'Optional description for the snapshot' },
          },
          required: ['node', 'vmid', 'snapname'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'rollback_vm_snapshot',
        description: 'Roll back a VM to a previously created snapshot. WARNING: this replaces current VM state.',
        parameters: {
          type: 'object',
          properties: {
            node: { type: 'string', description: 'Node name' },
            vmid: { type: 'string', description: 'VM ID number' },
            snapname: { type: 'string', description: 'Snapshot name to roll back to' },
          },
          required: ['node', 'vmid', 'snapname'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'delete_vm_snapshot',
        description: 'Delete a VM snapshot.',
        parameters: {
          type: 'object',
          properties: {
            node: { type: 'string', description: 'Node name' },
            vmid: { type: 'string', description: 'VM ID number' },
            snapname: { type: 'string', description: 'Snapshot name to delete' },
          },
          required: ['node', 'vmid', 'snapname'],
        },
      },
    },
    // ── LXC Containers ────────────────────────────────────────────────────────
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
        name: 'get_container_config',
        description: 'Get the full configuration of an LXC container: CPU, memory, disk, network interfaces, features.',
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
        description: 'Perform a power action on an LXC container: start, shutdown (graceful), stop (force), reboot, suspend, or resume.',
        parameters: {
          type: 'object',
          properties: {
            node: { type: 'string', description: 'Node name' },
            vmid: { type: 'string', description: 'Container ID number' },
            action: {
              type: 'string',
              description: 'Action to perform',
              enum: ['start', 'shutdown', 'stop', 'reboot', 'suspend', 'resume'],
            },
          },
          required: ['node', 'vmid', 'action'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'list_container_snapshots',
        description: 'List all snapshots for an LXC container.',
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
    // ── Storage ───────────────────────────────────────────────────────────────
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
        name: 'list_storage_content',
        description: 'List contents of a specific storage pool: VM disk images, ISO files, backups, templates, and container images with their sizes.',
        parameters: {
          type: 'object',
          properties: {
            node: { type: 'string', description: 'Node name' },
            storage: { type: 'string', description: 'Storage pool name, e.g. "local", "local-lvm", "nfs"' },
            content: {
              type: 'string',
              description: 'Filter by content type: "images", "iso", "backup", "vztmpl", "rootdir". Omit for all.',
            },
          },
          required: ['node', 'storage'],
        },
      },
    },
    // ── VM Provisioning ───────────────────────────────────────────────────────
    {
      type: 'function',
      function: {
        name: 'get_next_vmid',
        description: 'Get the next available VM ID from the cluster. Always call this before creating a new VM.',
        parameters: { type: 'object', properties: {} },
      },
    },
    {
      type: 'function',
      function: {
        name: 'clone_vm',
        description: 'Clone an existing VM or template into a new VM. Used to provision new VMs from a cloud-init template. Returns the task ID.',
        parameters: {
          type: 'object',
          properties: {
            node: { type: 'string', description: 'Node where the source template lives' },
            source_vmid: { type: 'string', description: 'VMID of the template to clone from' },
            new_vmid: { type: 'string', description: 'VMID for the new VM (from get_next_vmid)' },
            name: { type: 'string', description: 'Hostname/name for the new VM' },
            full: { type: 'string', description: 'Set to "1" for full clone (independent disk copy), "0" for linked clone. Default "1".' },
            storage: { type: 'string', description: 'Storage pool for the new disk, e.g. "local-lvm". If omitted the source storage is used.' },
          },
          required: ['node', 'source_vmid', 'new_vmid', 'name'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'set_vm_cloudinit',
        description: 'Set Cloud-Init configuration on a VM: username, password, SSH key, IP address (DHCP or static), DNS. Call this after cloning from a cloud-init template before starting the VM.',
        parameters: {
          type: 'object',
          properties: {
            node: { type: 'string', description: 'Node name' },
            vmid: { type: 'string', description: 'VM ID' },
            ciuser: { type: 'string', description: 'Cloud-init username, e.g. "ubuntu"' },
            cipassword: { type: 'string', description: 'Cloud-init password (plain text — Proxmox hashes it)' },
            sshkeys: { type: 'string', description: 'Public SSH key(s) to inject, URL-encoded. Optional.' },
            ipconfig0: { type: 'string', description: 'Network config for eth0. Use "ip=dhcp" for DHCP, or "ip=192.168.1.50/24,gw=192.168.1.1" for static.' },
            nameserver: { type: 'string', description: 'DNS server IP, e.g. "1.1.1.1 8.8.8.8". Optional.' },
            searchdomain: { type: 'string', description: 'DNS search domain, e.g. "local". Optional.' },
          },
          required: ['node', 'vmid', 'ciuser', 'cipassword', 'ipconfig0'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'resize_vm_disk',
        description: 'Resize a VM disk. Use after cloning to give the new VM more disk space.',
        parameters: {
          type: 'object',
          properties: {
            node: { type: 'string', description: 'Node name' },
            vmid: { type: 'string', description: 'VM ID' },
            disk: { type: 'string', description: 'Disk name, e.g. "scsi0" or "virtio0"' },
            size: { type: 'string', description: 'New size with suffix: "+20G" to add 20GB, or "40G" for absolute size.' },
          },
          required: ['node', 'vmid', 'disk', 'size'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_vm_ip',
        description: 'Get the IP address(es) of a running VM using the QEMU guest agent. The VM must be running and have qemu-guest-agent installed (cloud images include it). Wait ~30s after start before calling this.',
        parameters: {
          type: 'object',
          properties: {
            node: { type: 'string', description: 'Node name' },
            vmid: { type: 'string', description: 'VM ID' },
          },
          required: ['node', 'vmid'],
        },
      },
    },
    // ── Tasks ─────────────────────────────────────────────────────────────────
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

async function pvePost(base: string, token: string, path: string, body?: Record<string, string>): Promise<unknown> {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `PVEAPIToken=${token}`,
      ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: body ? new URLSearchParams(body).toString() : undefined,
  })
  if (!res.ok) throw new Error(`Proxmox API ${res.status} on ${path}: ${(await res.text()).slice(0, 300)}`)
  const json = await res.json() as { data?: unknown }
  return json.data ?? json
}

async function pvePut(base: string, token: string, path: string, body: Record<string, string>): Promise<unknown> {
  const res = await fetch(`${base}${path}`, {
    method: 'PUT',
    headers: {
      Authorization: `PVEAPIToken=${token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(body).toString(),
  })
  if (!res.ok) throw new Error(`Proxmox API ${res.status} on ${path}: ${(await res.text()).slice(0, 300)}`)
  const json = await res.json() as { data?: unknown }
  return json.data ?? json
}

async function pveDelete(base: string, token: string, path: string): Promise<unknown> {
  const res = await fetch(`${base}${path}`, {
    method: 'DELETE',
    headers: { Authorization: `PVEAPIToken=${token}` },
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

    case 'get_cluster_resources': {
      const typeFilter = args.type as string | undefined
      const path = typeFilter ? `/cluster/resources?type=${typeFilter}` : '/cluster/resources'
      const data = await pveGet(base, proxmoxToken, path) as Array<Record<string, unknown>>
      return data.map((r) => {
        const base: Record<string, unknown> = {
          id: r.id,
          type: r.type,
          name: r.name ?? r.storage ?? r.node,
          status: r.status,
          node: r.node,
        }
        if (r.type === 'vm' || r.type === 'lxc') {
          base.vmid = r.vmid
          base.cpu_percent = r.cpu !== undefined ? `${((r.cpu as number) * 100).toFixed(1)}%` : '-'
          base.memory = r.maxmem ? {
            used: toHuman(r.mem as number ?? 0),
            total: toHuman(r.maxmem as number),
          } : undefined
          base.uptime = r.uptime ? toUptime(r.uptime as number) : '-'
          base.pool = r.pool
          base.tags = r.tags
        } else if (r.type === 'node') {
          base.cpu_percent = r.cpu !== undefined ? `${((r.cpu as number) * 100).toFixed(1)}%` : '-'
          base.memory = r.maxmem ? {
            used: toHuman(r.mem as number ?? 0),
            total: toHuman(r.maxmem as number),
          } : undefined
          base.uptime = r.uptime ? toUptime(r.uptime as number) : '-'
        } else if (r.type === 'storage') {
          base.used = toHuman(r.disk as number ?? 0)
          base.total = toHuman(r.maxdisk as number ?? 0)
          base.percent_used = r.maxdisk ? `${(((r.disk as number ?? 0) / (r.maxdisk as number)) * 100).toFixed(1)}%` : 'N/A'
          base.storage_type = r.plugintype
        }
        return base
      })
    }

    case 'list_node_network': {
      const node = args.node as string
      const data = await pveGet(base, proxmoxToken, `/nodes/${node}/network`) as Array<Record<string, unknown>>
      return data.map((iface) => ({
        iface: iface.iface,
        type: iface.type,
        active: iface.active,
        address: iface.address,
        netmask: iface.netmask,
        cidr: iface.cidr,
        gateway: iface.gateway,
        bridge_ports: iface.bridge_ports,
        bond_slaves: iface.bond_slaves,
        autostart: iface.autostart,
        comments: iface.comments,
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
        ha_managed: (data.ha as Record<string, unknown>)?.managed,
      }
    }

    case 'vm_action': {
      const { node, vmid, action } = args as { node: string; vmid: string; action: string }
      const validActions = ['start', 'shutdown', 'stop', 'reboot', 'reset', 'suspend', 'resume']
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
      const validActions = ['start', 'shutdown', 'stop', 'reboot', 'suspend', 'resume']
      if (!validActions.includes(action)) throw new Error(`Invalid action: ${action}. Must be one of: ${validActions.join(', ')}`)
      const result = await pvePost(base, proxmoxToken, `/nodes/${node}/lxc/${vmid}/status/${action}`)
      return { task_id: result, action, vmid, node, message: `${action} command sent to container ${vmid}` }
    }

    case 'get_container_config': {
      const { node, vmid } = args as { node: string; vmid: string }
      const data = await pveGet(base, proxmoxToken, `/nodes/${node}/lxc/${vmid}/config`) as Record<string, unknown>
      return {
        vmid,
        hostname: data.hostname,
        ostype: data.ostype,
        cores: data.cores,
        cpulimit: data.cpulimit,
        memory: `${data.memory} MB`,
        swap: `${data.swap} MB`,
        rootfs: data.rootfs,
        networks: Object.entries(data)
          .filter(([k]) => /^net\d+$/.test(k))
          .map(([k, v]) => ({ slot: k, config: v })),
        features: data.features,
        unprivileged: data.unprivileged,
        onboot: data.onboot,
        tags: data.tags,
        description: data.description,
      }
    }

    case 'list_container_snapshots': {
      const { node, vmid } = args as { node: string; vmid: string }
      const data = await pveGet(base, proxmoxToken, `/nodes/${node}/lxc/${vmid}/snapshot`) as Array<Record<string, unknown>>
      return data.map((s) => ({
        name: s.name,
        description: s.description,
        snaptime: s.snaptime ? new Date((s.snaptime as number) * 1000).toISOString() : null,
        parent: s.parent,
      }))
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

    case 'list_storage_content': {
      const { node, storage, content } = args as { node: string; storage: string; content?: string }
      const path = content
        ? `/nodes/${node}/storage/${storage}/content?content=${content}`
        : `/nodes/${node}/storage/${storage}/content`
      const data = await pveGet(base, proxmoxToken, path) as Array<Record<string, unknown>>
      return data.map((item) => ({
        volid: item.volid,
        name: (item.volid as string)?.split('/').pop(),
        content: item.content,
        size: toHuman(item.size as number ?? 0),
        vmid: item.vmid,
        format: item.format,
        ctime: item.ctime ? new Date((item.ctime as number) * 1000).toISOString() : null,
        notes: item.notes,
      }))
    }

    case 'get_next_vmid': {
      const data = await pveGet(base, proxmoxToken, '/cluster/nextid') as string | number
      return { next_vmid: String(data) }
    }

    case 'clone_vm': {
      const { node, source_vmid, new_vmid, name, full, storage } = args as {
        node: string; source_vmid: string; new_vmid: string; name: string; full?: string; storage?: string
      }
      const body: Record<string, string> = {
        newid: new_vmid,
        name,
        full: full ?? '1',
      }
      if (storage) body.storage = storage
      const result = await pvePost(base, proxmoxToken, `/nodes/${node}/qemu/${source_vmid}/clone`, body)
      return { task_id: result, new_vmid, name, message: `Clone started: VM ${source_vmid} → new VM ${new_vmid} (${name})` }
    }

    case 'set_vm_cloudinit': {
      const { node, vmid, ciuser, cipassword, sshkeys, ipconfig0, nameserver, searchdomain } = args as {
        node: string; vmid: string; ciuser: string; cipassword: string
        sshkeys?: string; ipconfig0: string; nameserver?: string; searchdomain?: string
      }
      const body: Record<string, string> = { ciuser, cipassword, ipconfig0 }
      if (sshkeys) body.sshkeys = sshkeys
      if (nameserver) body.nameserver = nameserver
      if (searchdomain) body.searchdomain = searchdomain
      await pvePut(base, proxmoxToken, `/nodes/${node}/qemu/${vmid}/config`, body)
      return {
        vmid, message: `Cloud-init configured on VM ${vmid}`,
        user: ciuser,
        ip_config: ipconfig0,
        note: 'Password set successfully. Start the VM to apply cloud-init.',
      }
    }

    case 'resize_vm_disk': {
      const { node, vmid, disk, size } = args as { node: string; vmid: string; disk: string; size: string }
      await pvePut(base, proxmoxToken, `/nodes/${node}/qemu/${vmid}/resize`, { disk, size })
      return { vmid, disk, size, message: `Disk ${disk} on VM ${vmid} resized to ${size}` }
    }

    case 'get_vm_ip': {
      const { node, vmid } = args as { node: string; vmid: string }
      // Retry up to 3 times (15 s total) — guest agent takes time to start after boot
      const MAX_RETRIES = 3
      const RETRY_DELAY_MS = 5_000
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        if (attempt > 0) await new Promise(r => setTimeout(r, RETRY_DELAY_MS))
        try {
          const data = await pveGet(base, proxmoxToken, `/nodes/${node}/qemu/${vmid}/agent/network-get-interfaces`) as Record<string, unknown>
          const ifaces = (data.result as Array<Record<string, unknown>>) ?? []
          const ips: Array<{ iface: string; ip: string; prefix: number; type: string }> = []
          for (const iface of ifaces) {
            const name = iface.name as string
            if (name === 'lo') continue
            const addrs = (iface['ip-addresses'] as Array<Record<string, unknown>>) ?? []
            for (const addr of addrs) {
              ips.push({
                iface: name,
                ip: addr['ip-address'] as string,
                prefix: addr['prefix'] as number,
                type: addr['ip-address-type'] as string,
              })
            }
          }
          const primary = ips.find(i => i.type === 'ipv4')?.ip
          if (primary) return { vmid, interfaces: ips, primary_ip: primary }
          // No IP yet — retry
        } catch {
          // Guest agent not running yet — retry
        }
      }
      return { vmid, primary_ip: 'not available — VM may still be booting, try again in a minute' }
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

    case 'create_vm_snapshot': {
      const { node, vmid, snapname, description } = args as { node: string; vmid: string; snapname: string; description?: string }
      const body: Record<string, string> = { snapname }
      if (description) body.description = description
      const result = await pvePost(base, proxmoxToken, `/nodes/${node}/qemu/${vmid}/snapshot`, body)
      return { task_id: result, snapname, vmid, node, message: `Snapshot "${snapname}" creation started for VM ${vmid}` }
    }

    case 'rollback_vm_snapshot': {
      const { node, vmid, snapname } = args as { node: string; vmid: string; snapname: string }
      const result = await pvePost(base, proxmoxToken, `/nodes/${node}/qemu/${vmid}/snapshot/${snapname}/rollback`)
      return { task_id: result, snapname, vmid, node, message: `Rollback to snapshot "${snapname}" started for VM ${vmid}` }
    }

    case 'delete_vm_snapshot': {
      const { node, vmid, snapname } = args as { node: string; vmid: string; snapname: string }
      const result = await pveDelete(base, proxmoxToken, `/nodes/${node}/qemu/${vmid}/snapshot/${snapname}`)
      return { task_id: result, snapname, vmid, node, message: `Snapshot "${snapname}" deletion started for VM ${vmid}` }
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
