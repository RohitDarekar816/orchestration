import { getToolsForTask, executeTool } from './proxmox-tools'

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

/**
 * Llama 4 Scout sometimes emits tool calls as inline JSON in the response
 * field instead of the structured tool_calls array. Format seen in the wild:
 *   {"name":"tool_name","parameters":{"arg":{"type":"string","value":"val"}}}
 * This parser detects and normalises them into OaiToolCall objects.
 */
function parseLlamaInlineToolCalls(response: string, validNames: Set<string>): OaiToolCall[] | null {
  if (!response || !response.includes('"name"')) return null
  const calls: OaiToolCall[] = []
  let searchFrom = 0

  while (searchFrom < response.length) {
    const braceIdx = response.indexOf('{', searchFrom)
    if (braceIdx === -1) break

    // Walk to the matching closing brace
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
      // Validate: must be a known tool name (snake_case) to avoid false positives on JSON in text
      if (!obj.name || !validNames.has(obj.name)) continue
      // Flatten Llama typed params: {"node":{"type":"string","value":"pve"}} → {"node":"pve"}
      const flat: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(obj.parameters ?? {})) {
        flat[k] = (v && typeof v === 'object' && 'value' in (v as object))
          ? (v as { value: unknown }).value
          : v
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

const MODEL = '@cf/meta/llama-4-scout-17b-16e-instruct'

function generateVmPassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const lower = 'abcdefghjkmnpqrstuvwxyz'
  const digits = '23456789'
  const symbols = '!@#$%^&*'
  const all = upper + lower + digits + symbols
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  const chars = [
    upper[bytes[0] % upper.length],
    lower[bytes[1] % lower.length],
    digits[bytes[2] % digits.length],
    symbols[bytes[3] % symbols.length],
    ...Array.from(bytes.slice(4), b => all[b % all.length]),
  ]
  // Fisher-Yates shuffle using fresh random bytes
  const shuffleBytes = crypto.getRandomValues(new Uint8Array(chars.length))
  for (let i = chars.length - 1; i > 0; i--) {
    const j = shuffleBytes[i] % (i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}

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

    // Pre-generate a strong random password so the model doesn't invent a weak one
    const vmPassword = generateVmPassword()
    const isVmCreation = /\b(creat[a-z]*|provision[a-z]*|spin.?up|make|new)\b.*\b(vm|server|machine|container|lxc)\b|\b(vm|server|machine|container|lxc)\b.*\b(creat[a-z]*|provision[a-z]*)/i.test(task)
    const passwordHint = isVmCreation
      ? ` When creating a VM and setting cloud-init credentials, use exactly this pre-generated password: "${vmPassword}"`
      : ''

    const label = endpoint_name ? ` (${endpoint_name})` : ''
    const nodeHint = default_node ? ` The default node name is "${default_node}".` : ''

    const system = `You are a Proxmox VE systems administrator. You have full access to a Proxmox cluster at ${proxmox_url}${label} via the provided tools.${nodeHint}${passwordHint}

Rules:
- ALWAYS call a tool to get real data. Never guess VM names, IDs, or node names.
- For cluster-wide overviews: use get_cluster_resources (returns all VMs, LXCs, nodes, storage in one call). Optionally filter by type.
- For node discovery: call list_nodes first, then use those node names for subsequent calls.
- For a specific VM or container: call list_vms/list_containers first if you don't know the VMID, then get_vm_status/get_container_status.
- For power actions (start/stop/reboot/shutdown/suspend/resume): always confirm the correct vmid by listing first, then call vm_action or container_action. Prefer shutdown (graceful) over stop (force kill) unless user says "force".
- For delete/remove/destroy VM: call list_vms to get the vmid, then call vm_action with action="stop" if the VM is running (status != "stopped"), then call delete_vm. Never skip the stop step — Proxmox will refuse to delete a running VM.
- For delete/remove/destroy LXC container: call list_containers to get the vmid, stop it with container_action if running, then call delete_container.
- For storage questions: use list_storage for pool sizes; use list_storage_content to see files/images/ISOs inside a pool.
- For cluster health: call get_cluster_status then list_nodes.
- For snapshot operations: list_vm_snapshots first to see existing snapshots; use create_vm_snapshot, rollback_vm_snapshot, or delete_vm_snapshot as requested.
- For network questions: use list_node_network to show interfaces, bridges, and IP addresses.
- For container details: use get_container_config for configuration; list_container_snapshots for snapshots.
- Report memory and disk in human-readable units (GB/TB). Report CPU as percentage. Report uptime in days/hours/minutes format.
- If a tool returns an error, report it exactly — do not fabricate.
- When the user says "create a server", "new server", "spin up a server", or "provision a server" — treat it as creating a QEMU/KVM VM, NOT an LXC container. Follow the VM Provisioning steps below. Only follow the LXC Container Provisioning steps when the user explicitly says "container", "LXC", or "CT".

VM Provisioning (create new VM from cloud-init template):
1. Call get_next_vmid to get the next free VM ID.
2. Find the template: call get_cluster_resources(type="vm") — this returns all VMs across all nodes, each with a node field. Templates have template=true. Note the template's VMID AND its node field. NEVER guess or assume a template VMID or node. If you find no VMs with template=true, STOP and respond: "No cloud-init templates found on this Proxmox cluster. Please create an Ubuntu cloud-init template first."
3. Call clone_vm with node=<THE NODE WHERE THE TEMPLATE WAS FOUND> (the node field from the template result in step 2 — NOT the default_node). Use source_vmid=<template vmid>, new_vmid=<from step 1>.
   CRITICAL: The clone_vm node MUST be the exact node where the template lives. Passing the wrong node causes "Configuration file does not exist" in Proxmox.
4. IMMEDIATELY call wait_for_task with the task_id returned by clone_vm AND node=<same template node>. Do NOT skip this — starting or configuring a VM before the clone finishes causes a lock error. If wait_for_task throws an error, STOP and report the error.
5. Call set_vm_cloudinit with node=<same template node>, vmid=<new_vmid>: set ciuser="ubuntu", use the pre-generated password from your instructions, set ipconfig0="ip=dhcp" unless user specified a static IP.
6. If the user specified RAM or CPU cores, call update_vm_config with node=<same template node>, vmid=<new_vmid>, memory=<MB> (1GiB=1024, 2GiB=2048, 4GiB=4096) and/or cores=<number>. The clone_vm API does not set RAM/CPU — this is the only way to do it.
7. Optionally call resize_vm_disk with node=<same template node>, vmid=<new_vmid> if user requested a specific disk size. Default to "+18G" if not specified. Ubuntu cloud images use disk slot "scsi0" — use that unless get_vm_config shows a different slot.
8. Call vm_action with node=<same template node>, vmid=<new_vmid>, action="start" to boot the VM.
9. Call get_vm_ip with node=<same template node>, vmid=<new_vmid>. The tool waits up to 90s for the QEMU guest agent.
10. Report back: VM ID, VM name, node, IP address (or "check router DHCP"), username, password, RAM, CPU — clearly formatted.
- All steps 3–9 use the same node (the template's node). Never switch to the default_node mid-flow.
- Always generate a strong random password (never use simple passwords like "ubuntu123").
- If user provides an SSH public key, pass it as sshkeys (URL-encoded).
- If user does not specify RAM/CPU, the VM keeps the template defaults — state this in the final report.
- If get_vm_ip returns null, do NOT call it again — just report the VM details and tell the user to check their router's DHCP table or run 'ip addr' in the Proxmox console.

LXC Container Provisioning (create new container):
1. Call get_next_vmid to get the next free container ID.
2. Call list_storage(node=<default node>) to enumerate available storage pools. Identify a pool that supports "vztmpl" content (type "dir" or "zfspool" usually does; "local" almost always does).
3. Call list_storage_content(node=<default node>, storage=<storage from step 2>, content="vztmpl") to find available OS templates. Pick the most appropriate one for the user's request (e.g. ubuntu-22.04 for Ubuntu). If no templates are found, STOP and say: "No LXC OS templates found on this Proxmox cluster. Download one in Proxmox → Node → local → CT Templates."
4. Call create_container using the template path (volid), next vmid, user-supplied hostname, and pre-generated password. Use the storage pool from step 2 for rootfs (prefer "local-lvm" if available, else the pool from step 2). Default rootfs_size to "8", memory to "512", ip to "dhcp".
5. Call wait_for_task with the returned task_id before starting.
6. Call container_action with action="start" to boot the container.
7. Report back: Container ID, hostname, IP config, username "root", password.

VM/Container Config Updates:
- For "change VM cpu/memory/name/tags" or "resize VM cpu/ram": call list_vms to confirm the vmid, then call update_vm_config with only the fields to change.
- For "change container hostname/memory/cpu": call list_containers to confirm the vmid, then call update_container_config.
- Always confirm the vmid by listing first — never assume.

Container Snapshot Operations:
- For create snapshot on container: list_containers to get vmid, then create_container_snapshot.
- For rollback container to snapshot: list_container_snapshots first to confirm the snapshot exists, then rollback_container_snapshot.
- For delete container snapshot: list_container_snapshots first, then delete_container_snapshot.`

    const messages: Message[] = [
      { role: 'system', content: system },
      { role: 'user', content: task },
    ]

    // Only send tools relevant to this task — avoids sending all 26 tools (~9k tokens) every step
    const tools = getToolsForTask(task)
    let toolCallCount = 0
    let finalText = ''

    // Tie all LLM calls in this request to the same Workers AI instance for prompt cache hits
    const sessionId = `ses_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`

    // Max tool-call rounds before forcing a text-only wrap-up call
    // Provision flow: list_vms → get_next_vmid → clone_vm → wait_for_task → set_vm_cloudinit → update_vm_config → resize → start → get_vm_ip = 9 steps
    const MAX_TOOL_STEPS = 12

    try {
      for (let step = 0; step <= MAX_TOOL_STEPS; step++) {
        const isWrapUp = step === MAX_TOOL_STEPS

        if (isWrapUp) {
          // Remove tools so the model MUST respond with text, not more tool calls
          messages.push({
            role: 'user',
            content: 'You have all the data you need. Write your final answer now — do NOT call any more tools.',
          })
        }

        // Retry up to 3 times on 429 rate-limit errors with exponential backoff
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

        // Resolve tool calls — prefer structured array, fall back to inline Llama JSON
        // On wrap-up step, skip tool parsing entirely
        const validToolNames = new Set(tools.map(t => t.function.name))
        const activeCalls: OaiToolCall[] = isWrapUp
          ? []
          : (result.tool_calls && result.tool_calls.length > 0)
            ? result.tool_calls
            : (parseLlamaInlineToolCalls(result.response ?? '', validToolNames) ?? [])

        if (activeCalls.length > 0) {
          messages.push({
            role: 'assistant',
            content: null,
            tool_calls: activeCalls,
          })

          for (const call of activeCalls) {
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
          finalText = result.response?.trim() ?? ''
          break
        }
      }

      if (!finalText) {
        // Summarise what the agent tried to do so the user isn't left with a blank response
        const attempted = messages
          .filter((m): m is AssistantMessage => m.role === 'assistant' && Array.isArray(m.tool_calls))
          .flatMap(m => m.tool_calls ?? [])
          .map(c => c.function.name)
          .join(', ')
        finalText = attempted
          ? `The agent ran ${toolCallCount} tool call(s) (${attempted}) but encountered errors and could not complete the task. Check that the Proxmox node name and credentials are correct.`
          : 'No tools were called and no response was generated. The model may have failed to start.'
      }

      return Response.json({ output: finalText, success: true, tool_calls: toolCallCount })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return Response.json({ output: message, success: false }, { status: 500 })
    }
  },
}
