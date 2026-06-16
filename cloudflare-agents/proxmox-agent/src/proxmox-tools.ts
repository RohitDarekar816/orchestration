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
    {
      type: 'function',
      function: {
        name: 'delete_vm',
        description: 'Permanently delete a QEMU VM and all its disks. The VM must be stopped first — call vm_action with action="stop" if it is running, then call this. Use purge=true to also remove the VM from backup and replication jobs.',
        parameters: {
          type: 'object',
          properties: {
            node: { type: 'string', description: 'Node name' },
            vmid: { type: 'string', description: 'VM ID number' },
            purge: { type: 'boolean', description: 'Also remove from backup/replication jobs. Default true.' },
          },
          required: ['node', 'vmid'],
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
        name: 'delete_container',
        description: 'Permanently delete an LXC container and all its storage. The container must be stopped first — call container_action with action="stop" if it is running, then call this.',
        parameters: {
          type: 'object',
          properties: {
            node: { type: 'string', description: 'Node name' },
            vmid: { type: 'string', description: 'Container ID number' },
            purge: { type: 'boolean', description: 'Also remove from backup/replication jobs. Default true.' },
          },
          required: ['node', 'vmid'],
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
        name: 'wait_for_task',
        description: 'Wait for an async Proxmox task (UPID) to complete. ALWAYS call this after clone_vm before calling set_vm_cloudinit, resize_vm_disk, or vm_action. Returns when the task succeeds, or throws if it fails.',
        parameters: {
          type: 'object',
          properties: {
            node: { type: 'string', description: 'Node name where the task is running' },
            task_id: { type: 'string', description: 'Task UPID returned by clone_vm or other async operations' },
          },
          required: ['node', 'task_id'],
        },
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
    // ── VM Config Update ──────────────────────────────────────────────────────
    {
      type: 'function',
      function: {
        name: 'update_vm_config',
        description: 'Update hardware configuration of an existing VM: CPU cores, memory (MB), name, description, or tags. Most changes take effect immediately; CPU/memory changes on a running VM may require a reboot.',
        parameters: {
          type: 'object',
          properties: {
            node: { type: 'string', description: 'Node name' },
            vmid: { type: 'string', description: 'VM ID number' },
            cores: { type: 'string', description: 'Number of CPU cores, e.g. "4"' },
            memory: { type: 'string', description: 'Memory in MB, e.g. "4096" for 4 GB' },
            name: { type: 'string', description: 'New VM name' },
            description: { type: 'string', description: 'VM description or notes' },
            tags: { type: 'string', description: 'Semicolon-separated tags, e.g. "web;production"' },
          },
          required: ['node', 'vmid'],
        },
      },
    },
    // ── LXC Container Provisioning ────────────────────────────────────────────
    {
      type: 'function',
      function: {
        name: 'create_container',
        description: 'Create a new LXC container from an OS template. Use list_storage_content(content="vztmpl") to find available templates first. Returns a task ID — call wait_for_task before starting the container.',
        parameters: {
          type: 'object',
          properties: {
            node: { type: 'string', description: 'Node name, e.g. "pve"' },
            vmid: { type: 'string', description: 'Container ID from get_next_vmid' },
            ostemplate: { type: 'string', description: 'Template storage path, e.g. "local:vztmpl/ubuntu-22.04-standard_22.04-1_amd64.tar.zst"' },
            hostname: { type: 'string', description: 'Container hostname' },
            password: { type: 'string', description: 'Root password' },
            storage: { type: 'string', description: 'Storage pool for rootfs, e.g. "local-lvm"' },
            rootfs_size: { type: 'string', description: 'Root filesystem size in GB, e.g. "8". Default "8".' },
            cores: { type: 'string', description: 'CPU cores, e.g. "2". Default "1".' },
            memory: { type: 'string', description: 'Memory in MB, e.g. "1024". Default "512".' },
            ip: { type: 'string', description: 'IP config: "dhcp" or "192.168.1.x/24,gw=192.168.1.1". Default "dhcp".' },
            start: { type: 'string', description: 'Start container after creation: "1" or "0". Default "0".' },
          },
          required: ['node', 'vmid', 'ostemplate', 'hostname', 'password', 'storage'],
        },
      },
    },
    // ── LXC Config Update ─────────────────────────────────────────────────────
    {
      type: 'function',
      function: {
        name: 'update_container_config',
        description: 'Update configuration of an existing LXC container: CPU cores, memory (MB), hostname, description, or tags.',
        parameters: {
          type: 'object',
          properties: {
            node: { type: 'string', description: 'Node name' },
            vmid: { type: 'string', description: 'Container ID number' },
            cores: { type: 'string', description: 'Number of CPU cores, e.g. "2"' },
            memory: { type: 'string', description: 'Memory in MB, e.g. "2048"' },
            hostname: { type: 'string', description: 'New container hostname' },
            description: { type: 'string', description: 'Container description or notes' },
            tags: { type: 'string', description: 'Semicolon-separated tags, e.g. "db;staging"' },
          },
          required: ['node', 'vmid'],
        },
      },
    },
    // ── LXC Snapshots ─────────────────────────────────────────────────────────
    {
      type: 'function',
      function: {
        name: 'create_container_snapshot',
        description: 'Create a snapshot of an LXC container. The container can be running or stopped.',
        parameters: {
          type: 'object',
          properties: {
            node: { type: 'string', description: 'Node name' },
            vmid: { type: 'string', description: 'Container ID number' },
            snapname: { type: 'string', description: 'Snapshot name (no spaces, e.g. "snap1")' },
            description: { type: 'string', description: 'Optional description' },
          },
          required: ['node', 'vmid', 'snapname'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'rollback_container_snapshot',
        description: 'Roll back an LXC container to a previously created snapshot. WARNING: replaces current container state.',
        parameters: {
          type: 'object',
          properties: {
            node: { type: 'string', description: 'Node name' },
            vmid: { type: 'string', description: 'Container ID number' },
            snapname: { type: 'string', description: 'Snapshot name to roll back to' },
          },
          required: ['node', 'vmid', 'snapname'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'delete_container_snapshot',
        description: 'Delete an LXC container snapshot.',
        parameters: {
          type: 'object',
          properties: {
            node: { type: 'string', description: 'Node name' },
            vmid: { type: 'string', description: 'Container ID number' },
            snapname: { type: 'string', description: 'Snapshot name to delete' },
          },
          required: ['node', 'vmid', 'snapname'],
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
          base.template = r.template === 1 || r.template === true
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
        template: vm.template === 1 || vm.template === true,
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

    case 'delete_vm': {
      const { node, vmid } = args as { node: string; vmid: string }
      const purge = (args.purge as boolean) !== false // default true
      const qs = purge ? '?purge=1&destroy-unreferenced-disks=1' : ''
      const task = await pveDelete(base, proxmoxToken, `/nodes/${node}/qemu/${vmid}${qs}`)
      return { task_id: task, vmid, node, message: `VM ${vmid} deletion started. All disks will be removed.` }
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

    case 'delete_container': {
      const { node, vmid } = args as { node: string; vmid: string }
      const purge = (args.purge as boolean) !== false // default true
      const qs = purge ? '?purge=1&destroy-unreferenced-disks=1' : ''
      const task = await pveDelete(base, proxmoxToken, `/nodes/${node}/lxc/${vmid}${qs}`)
      return { task_id: task, vmid, node, message: `Container ${vmid} deletion started. All storage will be removed.` }
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

    case 'wait_for_task': {
      const { node, task_id } = args as { node: string; task_id: string }
      const deadline = Date.now() + 50_000
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 5_000))
        try {
          const status = await pveGet(base, proxmoxToken, `/nodes/${node}/tasks/${encodeURIComponent(task_id)}/status`) as Record<string, unknown>
          if (status.status === 'stopped') {
            const exit = status.exitstatus as string
            if (exit === 'OK') return { status: 'completed', message: 'Task completed successfully' }
            throw new Error(`Task failed: ${exit}`)
          }
        } catch (err) {
          if (err instanceof Error && err.message.startsWith('Task failed')) throw err
        }
      }
      return { status: 'still_running', message: 'Task still running after 50s — disk may be large. Proceed with cloud-init config but do NOT start the VM yet.' }
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
      const body: Record<string, string> = {
        ciuser, cipassword, ipconfig0,
        // Enable QEMU guest agent so get_vm_ip works after boot
        agent: '1',
      }
      if (sshkeys) body.sshkeys = sshkeys
      if (nameserver) body.nameserver = nameserver
      if (searchdomain) body.searchdomain = searchdomain
      await pvePut(base, proxmoxToken, `/nodes/${node}/qemu/${vmid}/config`, body)
      return {
        vmid, message: `Cloud-init configured on VM ${vmid}`,
        user: ciuser,
        ip_config: ipconfig0,
        note: 'QEMU guest agent enabled. Start the VM — cloud-init will apply network config on first boot.',
      }
    }

    case 'resize_vm_disk': {
      const { node, vmid, disk, size } = args as { node: string; vmid: string; disk: string; size: string }
      await pvePut(base, proxmoxToken, `/nodes/${node}/qemu/${vmid}/resize`, { disk, size })
      return { vmid, disk, size, message: `Disk ${disk} on VM ${vmid} resized to ${size}` }
    }

    case 'get_vm_ip': {
      const { node, vmid } = args as { node: string; vmid: string }
      // Ubuntu cloud images take 60-90s to boot, run cloud-init, and start qemu-guest-agent.
      // Poll every 30s for up to 3 attempts (90s total).
      const MAX_RETRIES = 3
      const RETRY_DELAY_MS = 30_000
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
          // Guest agent responded but no IPv4 yet — DHCP still pending, retry
        } catch {
          // Guest agent not up yet — retry
        }
      }
      return {
        vmid,
        primary_ip: null,
        message: 'VM is running but IP could not be retrieved after 90s. The VM likely booted successfully. To find the IP: (1) Check your router admin page → DHCP client list, (2) Open the VM console in Proxmox and run: ip addr — or — (3) Run this again in 1-2 minutes.',
        troubleshoot: 'If the VM consistently has no IP: verify the cloud-init drive is attached (Proxmox → VM → Hardware → look for CloudInit Drive), and confirm net0 uses bridge=vmbr0.',
      }
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

    case 'update_vm_config': {
      const { node, vmid } = args as { node: string; vmid: string }
      const body: Record<string, string> = {}
      if (args.cores) body.cores = String(args.cores)
      if (args.memory) body.memory = String(args.memory)
      if (args.name) body.name = args.name as string
      if (args.description) body.description = args.description as string
      if (args.tags) body.tags = args.tags as string
      if (Object.keys(body).length === 0) throw new Error('No config changes specified. Provide at least one of: cores, memory, name, description, tags.')
      await pvePut(base, proxmoxToken, `/nodes/${node}/qemu/${vmid}/config`, body)
      return { vmid, updated: body, message: `VM ${vmid} configuration updated successfully.` }
    }

    case 'create_container': {
      const { node, vmid, ostemplate, hostname, password, storage } = args as {
        node: string; vmid: string; ostemplate: string; hostname: string; password: string; storage: string
      }
      const rootfsSize = (args.rootfs_size as string) ?? '8'
      const ip = (args.ip as string) ?? 'dhcp'
      const body: Record<string, string> = {
        vmid,
        ostemplate,
        hostname,
        password,
        rootfs: `${storage}:${rootfsSize}`,
        net0: `name=eth0,bridge=vmbr0,ip=${ip}`,
        unprivileged: '1',
      }
      if (args.cores) body.cores = String(args.cores)
      if (args.memory) body.memory = String(args.memory)
      if (args.start) body.start = String(args.start)
      const task = await pvePost(base, proxmoxToken, `/nodes/${node}/lxc`, body)
      return { task_id: task, vmid, hostname, message: `Container ${vmid} (${hostname}) creation started. Call wait_for_task then container_action(start) when ready.` }
    }

    case 'update_container_config': {
      const { node, vmid } = args as { node: string; vmid: string }
      const body: Record<string, string> = {}
      if (args.cores) body.cores = String(args.cores)
      if (args.memory) body.memory = String(args.memory)
      if (args.hostname) body.hostname = args.hostname as string
      if (args.description) body.description = args.description as string
      if (args.tags) body.tags = args.tags as string
      if (Object.keys(body).length === 0) throw new Error('No config changes specified. Provide at least one of: cores, memory, hostname, description, tags.')
      await pvePut(base, proxmoxToken, `/nodes/${node}/lxc/${vmid}/config`, body)
      return { vmid, updated: body, message: `Container ${vmid} configuration updated successfully.` }
    }

    case 'create_container_snapshot': {
      const { node, vmid, snapname, description } = args as { node: string; vmid: string; snapname: string; description?: string }
      const body: Record<string, string> = { snapname }
      if (description) body.description = description
      const result = await pvePost(base, proxmoxToken, `/nodes/${node}/lxc/${vmid}/snapshot`, body)
      return { task_id: result, snapname, vmid, node, message: `Snapshot "${snapname}" creation started for container ${vmid}` }
    }

    case 'rollback_container_snapshot': {
      const { node, vmid, snapname } = args as { node: string; vmid: string; snapname: string }
      const result = await pvePost(base, proxmoxToken, `/nodes/${node}/lxc/${vmid}/snapshot/${snapname}/rollback`)
      return { task_id: result, snapname, vmid, node, message: `Rollback to snapshot "${snapname}" started for container ${vmid}` }
    }

    case 'delete_container_snapshot': {
      const { node, vmid, snapname } = args as { node: string; vmid: string; snapname: string }
      const result = await pveDelete(base, proxmoxToken, `/nodes/${node}/lxc/${vmid}/snapshot/${snapname}`)
      return { task_id: result, snapname, vmid, node, message: `Snapshot "${snapname}" deleted from container ${vmid}` }
    }

    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}

// ── Dynamic tool selection ────────────────────────────────────────────────────
// Returns only the tool subset relevant to the detected task intent.
// Sending fewer tools = fewer input tokens on every LLM step.

const TOOL_GROUPS: Record<string, Set<string>> = {
  provision:     new Set(['get_next_vmid','wait_for_task','clone_vm','set_vm_cloudinit','resize_vm_disk','vm_action','get_vm_ip','list_vms','list_nodes','get_cluster_resources']),
  lxc_provision: new Set(['get_next_vmid','wait_for_task','create_container','container_action','list_nodes','list_storage','list_storage_content']),
  power:         new Set(['list_vms','list_containers','get_vm_status','vm_action','delete_vm','update_vm_config','container_action','delete_container','update_container_config','list_nodes']),
  snapshot:      new Set(['list_vms','list_vm_snapshots','create_vm_snapshot','rollback_vm_snapshot','delete_vm_snapshot','list_nodes','list_containers','list_container_snapshots','create_container_snapshot','rollback_container_snapshot','delete_container_snapshot']),
  lxc:           new Set(['list_nodes','list_containers','get_container_status','get_container_config','container_action','delete_container','list_container_snapshots','update_container_config']),
  storage:       new Set(['list_nodes','list_storage','list_storage_content']),
  network:       new Set(['list_nodes','list_node_network']),
  tasks:         new Set(['list_nodes','get_node_tasks']),
  overview:      new Set(['get_cluster_resources','get_cluster_status','list_nodes','get_node_status','list_vms','get_vm_status','get_vm_config','list_containers','get_container_status']),
}

export function getToolsForTask(task: string): ToolDefinition[] {
  const all = getToolDefinitions()
  let group: Set<string> | null = null

  if (/\b(creat|provision|spin.?up|deploy|new)\b.{0,30}\bvm\b|\bvm\b.{0,30}\b(creat|provision|new)\b/i.test(task))
    group = TOOL_GROUPS.provision
  else if (/\b(creat|provision|spin.?up|deploy|new)\b.{0,30}\b(lxc|container)\b|\b(lxc|container)\b.{0,30}\b(creat|provision|new)\b/i.test(task))
    group = TOOL_GROUPS.lxc_provision
  else if (/\bsnapshot\b|\brollback\b|\brestore\b/i.test(task))
    group = TOOL_GROUPS.snapshot
  else if (/\b(delete|destroy|remove|wipe)\b.{0,30}\b(vm|machine|container|lxc)\b|\b(vm|machine|container|lxc)\b.{0,30}\b(delete|destroy|remove)\b/i.test(task))
    group = TOOL_GROUPS.power
  else if (/\b(update|change|set|resize|rename|modify)\b.{0,30}\b(vm|machine|container|lxc)\b.{0,40}\b(cpu|core|mem|ram|name|hostname|tag|desc)\b|\b(cpu|core|mem|ram|name|hostname|tag|desc)\b.{0,40}\b(vm|machine|container|lxc)\b/i.test(task))
    group = TOOL_GROUPS.power
  else if (/\b(start|stop|reboot|shutdown|reset|suspend|resume|restart)\b.{0,20}\b(vm|machine|container)\b|\b(vm|machine|container)\b.{0,20}\b(start|stop|reboot|shutdown)\b/i.test(task))
    group = TOOL_GROUPS.power
  else if (/\blxc\b|\bcontainer\b(?!.*docker)/i.test(task))
    group = TOOL_GROUPS.lxc
  else if (/\b(storage|disk\s+space|volume|iso\s|backup|datastore)\b/i.test(task))
    group = TOOL_GROUPS.storage
  else if (/\b(network|interface|bridge|ip.?address|vlan|bond|nic)\b/i.test(task))
    group = TOOL_GROUPS.network
  else if (/\b(task|log|history|recent\s+operation)\b/i.test(task))
    group = TOOL_GROUPS.tasks
  else if (/\b(overview|status|health|list|show|all|cluster|node|resource|how\s+many|what.*running)\b/i.test(task))
    group = TOOL_GROUPS.overview

  return group ? all.filter(t => group!.has(t.function.name)) : all
}
