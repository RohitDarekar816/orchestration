import type { ActionFunction } from '@sdk/types'
import { leon } from '@sdk/leon'
import { Network } from '@sdk/network'
import { Settings } from '@sdk/settings'

import {
  errorMessage,
  getOzConfig,
  getToken,
  launchAndWait,
  resolveDockerTarget,
} from '../lib/oz_client'

// ── HTML formatter ────────────────────────────────────────────────────────────

function formatDockerOutput(raw: string, serverLabel: string): string {
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean)
  if (!lines.length) return '<p style="color:#888">No output.</p>'

  const parts: string[] = []

  // Detect a table block (header row contains multiple ALL-CAPS column names)
  const tableHeaderRe = /^(NAMES?|CONTAINER|IMAGE|STATUS|PORTS|COMMAND|CREATED|SIZE)(\s{2,}.+)?$/i
  let i = 0
  while (i < lines.length) {
    const line = lines[i]

    // ── Bullet-list item ───────────────────────────────────────────────────
    if (/^[-*•]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^[-*•]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*•]\s+/, ''))
        i++
      }

      // Detect if these are metric key-value pairs (e.g. "CPU: 1.2%", "Memory: 120 MB / 8 GB")
      // rather than container names. Heuristic: most items contain ": " with a value after it.
      const isMetrics = items.filter((t) => /:\s*\S/.test(t)).length > items.length / 2

      if (isMetrics) {
        const rows = items.map((item) => {
          const colon = item.indexOf(': ')
          if (colon === -1) return `<tr><td colspan="2" style="padding:4px 8px;font-size:12px;color:#94a3b8">${escHtml(item)}</td></tr>`
          const key = item.slice(0, colon)
          const val = item.slice(colon + 2)
          return (
            `<tr>` +
            `<td style="padding:4px 8px;font-size:11px;color:#64748b;white-space:nowrap">${escHtml(key)}</td>` +
            `<td style="padding:4px 8px;font-size:12px;color:#e2e8f0;font-weight:500">${escHtml(val)}</td>` +
            `</tr>`
          )
        }).join('')
        parts.push(
          `<table style="width:100%;border-collapse:collapse;margin:8px 0">` +
          `<tbody>${rows}</tbody></table>`
        )
      } else {
        // Container name list — green status dot per item
        const dot = '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#22c55e;margin-right:8px;vertical-align:middle"></span>'
        const lis = items.map((name) =>
          `<li style="padding:4px 0;display:flex;align-items:center">${dot}<code style="font-size:13px">${escHtml(name)}</code></li>`
        ).join('')
        parts.push(`<ul style="list-style:none;margin:8px 0;padding:0">${lis}</ul>`)
      }
      continue
    }

    // ── Table block ────────────────────────────────────────────────────────
    if (tableHeaderRe.test(line) && i + 1 < lines.length) {
      const headers = line.split(/\s{2,}/).map((h) => h.trim()).filter(Boolean)
      i++
      const rows: string[][] = []
      while (i < lines.length && lines[i] && !lines[i].startsWith('#')) {
        const cols = lines[i].split(/\s{2,}/).map((c) => c.trim())
        // Pad/truncate to match header count
        while (cols.length < headers.length) cols.push('')
        rows.push(cols.slice(0, headers.length))
        i++
      }
      const thStyle = 'padding:6px 10px;text-align:left;background:#1e293b;color:#94a3b8;font-size:11px;text-transform:uppercase;letter-spacing:.05em'
      const tdStyle = 'padding:6px 10px;font-size:12px;border-top:1px solid #334155'
      const ths = headers.map((h) => `<th style="${thStyle}">${escHtml(h)}</th>`).join('')
      const trs = rows.map((row) => {
        const statusCol = row[headers.findIndex((h) => /status/i.test(h))] || ''
        const rowColor = /^Up /i.test(statusCol) ? '#f0fdf4' : /exit|dead|restart/i.test(statusCol) ? '#fef2f2' : 'transparent'
        const tds = row.map((cell, ci) => {
          const isStatus = /status/i.test(headers[ci] || '')
          const dot = isStatus && /^Up /i.test(cell)
            ? '<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#22c55e;margin-right:6px;vertical-align:middle"></span>'
            : isStatus && /exit|dead|restart/i.test(cell)
            ? '<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#ef4444;margin-right:6px;vertical-align:middle"></span>'
            : ''
          return `<td style="${tdStyle}">${dot}<code style="font-size:12px">${escHtml(cell)}</code></td>`
        }).join('')
        return `<tr style="background:${rowColor}">${tds}</tr>`
      }).join('')
      parts.push(
        `<div style="overflow-x:auto;margin:8px 0">` +
        `<table style="width:100%;border-collapse:collapse;font-family:monospace;background:#0f172a;border-radius:6px;overflow:hidden">` +
        `<thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table></div>`
      )
      continue
    }

    // ── Numbered list item ─────────────────────────────────────────────────
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ''))
        i++
      }
      const lis = items.map((t) => `<li style="padding:3px 0;font-size:13px">${escHtml(t)}</li>`).join('')
      parts.push(`<ol style="margin:8px 0 8px 18px;padding:0">${lis}</ol>`)
      continue
    }

    // ── Log lines block (timestamped or looks like a log entry) ───────────
    // Collect consecutive lines that look like raw log output:
    // timestamps (2024-01-01T..., [2024-...], numbers), or lines that are
    // clearly not prose (contain | [ ] = : sequences typical of log lines).
    const isLogLine = (l: string) =>
      /^\d{4}-\d{2}-\d{2}/.test(l) ||           // ISO timestamp prefix
      /^\[\d{4}-\d{2}-\d{2}/.test(l) ||          // [timestamp] prefix
      /^[A-Z]{3,}\s+\d/.test(l) ||               // "INFO 2024..." style
      /^\d+\.\d+\.\d+\.\d+/.test(l) ||           // IP address log line
      /\[(?:INFO|WARN|ERROR|DEBUG|TRACE|FATAL)\]/.test(l) // log level bracket

    if (isLogLine(line)) {
      const logLines: string[] = []
      while (i < lines.length && (isLogLine(lines[i]) || /^[-\w]/.test(lines[i]))) {
        logLines.push(lines[i])
        i++
        // Stop collecting if we hit a clearly non-log line (prose sentence)
        if (i < lines.length && /^(There|The|Here|All|No |Running|Stopped|Total)/.test(lines[i])) break
      }
      parts.push(
        `<pre style="margin:8px 0;padding:10px 12px;background:#020617;border-radius:6px;` +
        `font-size:11px;line-height:1.6;overflow-x:auto;white-space:pre-wrap;word-break:break-all;` +
        `border:1px solid #1e293b;color:#94a3b8">` +
        logLines.map(escHtml).join('\n') +
        `</pre>`
      )
      continue
    }

    // ── Plain text paragraph ───────────────────────────────────────────────
    parts.push(`<p style="margin:6px 0;font-size:13px;line-height:1.5">${escHtml(line)}</p>`)
    i++
  }

  const header =
    `<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid #334155">` +
    `<span style="font-size:18px">🐳</span>` +
    `<span style="font-weight:600;font-size:14px">Docker — <code style="font-size:13px;font-weight:400">${escHtml(serverLabel)}</code></span>` +
    `</div>`

  return (
    `<div style="background:#0f172a;color:#e2e8f0;border-radius:8px;padding:14px 16px;font-family:monospace;border:1px solid #1e293b">` +
    header +
    parts.join('') +
    `</div>`
  )
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export const run: ActionFunction = async function (params) {
  const settings = new Settings()
  const network = new Network()

  const nluServerHint = (params.action_arguments?.server as string) || ''
  const container = (params.action_arguments?.container as string) || (params.action_arguments?.name as string) || ''
  const lines = Number(params.action_arguments?.lines) || 100
  const grep = (params.action_arguments?.grep as string) || (params.action_arguments?.filter as string) || ''

  try {
    const cfg = await getOzConfig(settings)
    const token = await getToken(cfg, network)
    const utterance = params.utterance || ''

    // Single authoritative call: resolves who the user wants to target.
    // Fetches endpoints + SSH servers in parallel, tries multiple match
    // strategies, and returns a typed result — no scattered if/else chains.
    const target = await resolveDockerTarget(utterance, nluServerHint, cfg.apiUrl, token, network)

    // ── Remote Docker API endpoint → Cloudflare Docker Agent ─────────────────
    if (target.kind === 'endpoint') {
      const ep = target.endpoint
      await leon.answer({ key: 'fetching_docker_logs', data: { server: ep.name, container: container || 'all' } })

      const { output, status, agentId } = await launchAndWait({
        apiUrl: cfg.apiUrl,
        token,
        network,
        agentType: 'cloudflare_docker_agent',
        prompt: utterance || `List Docker containers on ${ep.name}`,
        maxRuntime: 120,
        maxPollSeconds: 180,
      })

      await leon.answer({
        key: 'docker_logs_result',
        data: { server: ep.name, container: container || 'all', logs: formatDockerOutput(output, ep.name), agent_id: String(agentId), status },
      })
      return
    }

    // ── SSH server or local machine → oz-local agent ──────────────────────────
    const server = target.kind === 'ssh_server' ? target.server : null
    const serverLabel = server ? `${server.name} (${server.host})` : 'this machine'

    await leon.answer({ key: 'fetching_docker_logs', data: { server: serverLabel, container: container || 'all' } })

    const location = server
      ? `You have SSH access to ${server.name} (${server.host}) and Docker access via the socket.\nRun Docker commands on that server via SSH.\nConnection details in OZ_SSH_* env vars, key at /tmp/oz_ssh_key.`
      : `You have direct Docker access via /var/run/docker.sock on this machine.`

    const grepClause = grep ? `| grep -i "${grep}"` : ''

    const prompt = container
      ? `You are a Linux systems administrator. ${location}

1. Check container status:
   \`docker inspect ${container} --format "Name: {{.Name}} | Status: {{.State.Status}} | Started: {{.State.StartedAt}} | Error: {{.State.Error}}" 2>&1\`

2. Get the last ${lines} log lines:
   \`docker logs --tail ${lines} --timestamps ${container} 2>&1 ${grepClause}\`

3. If the container is not running or restarting, check why:
   \`docker inspect ${container} --format "ExitCode: {{.State.ExitCode}} | OOMKilled: {{.State.OOMKilled}}" 2>&1\`

Summarise: is the container healthy? Any errors or crash-loops visible?`
      : `You are a Linux systems administrator. ${location}

1. List all containers and their status:
   \`docker ps -a --format "table {{.Names}}\\t{{.Image}}\\t{{.Status}}\\t{{.Ports}}" 2>&1\`

2. Count running containers:
   \`docker ps -q | wc -l 2>&1\`

3. Show last ${lines} lines from any containers that are stopped or restarting:
   For each unhealthy container, run: \`docker logs --tail 20 <container_name> 2>&1\`

Summarise overall Docker health: running vs stopped containers, any crash-loops.`

    const { output, status, agentId } = await launchAndWait({
      apiUrl: cfg.apiUrl,
      token,
      network,
      agentType: 'oz-local',
      prompt,
      serverId: server?.id ?? null,
      maxRuntime: 300,
      maxPollSeconds: 360,
    })

    await leon.answer({
      key: 'docker_logs_result',
      data: { server: serverLabel, container: container || 'all', logs: formatDockerOutput(output, serverLabel), agent_id: String(agentId), status },
    })
  } catch (error) {
    await leon.answer({ key: 'error', data: { message: errorMessage(error) } })
  }
}
