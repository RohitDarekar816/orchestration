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

export function formatDockerOutput(raw: string, serverLabel: string, agentType = 'docker'): string {
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean)
  if (!lines.length) return '<p style="color:#888">No output.</p>'

  const parts: string[] = []
  const dockerTableHeaderRe = /^(NAMES?|CONTAINER|IMAGE|STATUS|PORTS|COMMAND|CREATED|SIZE)(\s{2,}.+)?$/i
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // ── Code fence block ───────────────────────────────────────────────────
    if (line.startsWith('```')) {
      i++
      const codeLines: string[] = []
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      if (i < lines.length) i++ // consume closing fence
      parts.push(
        `<pre style="margin:8px 0;padding:10px 12px;background:#020617;border-radius:6px;` +
        `font-size:11px;line-height:1.6;overflow-x:auto;white-space:pre-wrap;word-break:break-all;` +
        `border:1px solid #1e293b;color:#94a3b8">` +
        codeLines.map(escHtml).join('\n') + `</pre>`
      )
      continue
    }

    // ── Markdown headings ──────────────────────────────────────────────────
    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/)
    if (headingMatch) {
      const level = headingMatch[1].length
      const sizes = ['15px', '14px', '13px']
      const mt = level === 1 ? '14px 0 6px' : '10px 0 4px'
      const border = level === 1 ? 'border-bottom:1px solid #334155;padding-bottom:4px;' : ''
      parts.push(
        `<p style="margin:${mt};font-size:${sizes[level - 1]};font-weight:600;color:#f1f5f9;${border}">` +
        renderInline(headingMatch[2]) + `</p>`
      )
      i++
      continue
    }

    // ── HEALTHY / WARNING / CRITICAL status badge ──────────────────────────
    const statusMatch = line.match(/^(HEALTHY|WARNING|CRITICAL)\b/i)
    if (statusMatch) {
      const lvl = statusMatch[1].toUpperCase() as 'HEALTHY' | 'WARNING' | 'CRITICAL'
      const color = lvl === 'HEALTHY' ? '#22c55e' : lvl === 'WARNING' ? '#f59e0b' : '#ef4444'
      const bg    = lvl === 'HEALTHY' ? '#052e16' : lvl === 'WARNING' ? '#1c1400' : '#1c0a0a'
      parts.push(
        `<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:6px;` +
        `background:${bg};border:1px solid ${color};margin:8px 0">` +
        `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color};flex-shrink:0"></span>` +
        `<span style="font-size:13px;font-weight:600;color:${color}">${renderInline(line)}</span>` +
        `</div>`
      )
      i++
      continue
    }

    // ── Markdown pipe table ────────────────────────────────────────────────
    if (/^\|.+\|$/.test(line)) {
      const headers = line.split('|').map((c) => c.trim()).filter(Boolean)
      i++
      if (i < lines.length && /^\|[\s\-|:]+\|$/.test(lines[i])) i++ // skip separator
      const rows: string[][] = []
      while (i < lines.length && /^\|.+\|$/.test(lines[i])) {
        rows.push(lines[i].split('|').map((c) => c.trim()).filter(Boolean))
        i++
      }
      const thStyle = 'padding:6px 10px;text-align:left;background:#1e293b;color:#94a3b8;font-size:11px;text-transform:uppercase;letter-spacing:.05em'
      const tdStyle = 'padding:6px 10px;font-size:12px;border-top:1px solid #334155;color:#e2e8f0'
      const ths = headers.map((h) => `<th style="${thStyle}">${escHtml(h)}</th>`).join('')
      const trs = rows.map((row) => {
        const tds = headers.map((_, ci) => `<td style="${tdStyle}">${renderInline(row[ci] ?? '')}</td>`).join('')
        return `<tr>${tds}</tr>`
      }).join('')
      parts.push(
        `<div style="overflow-x:auto;margin:8px 0">` +
        `<table style="width:100%;border-collapse:collapse;font-family:monospace;background:#0f172a;border-radius:6px;overflow:hidden">` +
        `<thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table></div>`
      )
      continue
    }

    // ── Bullet-list item ───────────────────────────────────────────────────
    if (/^[-*•]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^[-*•]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*•]\s+/, ''))
        i++
      }

      // Heuristic: metric key-value pairs vs plain name list
      const isMetrics = items.filter((t) => /:\s*\S/.test(t)).length > items.length / 2

      if (isMetrics) {
        const rows = items.map((item) => {
          const colon = item.indexOf(': ')
          if (colon === -1) return `<tr><td colspan="2" style="padding:4px 8px;font-size:12px;color:#94a3b8">${renderInline(item)}</td></tr>`
          const key = item.slice(0, colon)
          const val = item.slice(colon + 2)
          return (
            `<tr>` +
            `<td style="padding:4px 8px;font-size:11px;color:#64748b;white-space:nowrap">${escHtml(key)}</td>` +
            `<td style="padding:4px 8px;font-size:12px;color:#e2e8f0;font-weight:500">${renderInline(val)}</td>` +
            `</tr>`
          )
        }).join('')
        parts.push(
          `<table style="width:100%;border-collapse:collapse;margin:8px 0">` +
          `<tbody>${rows}</tbody></table>`
        )
      } else {
        const dot = '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#22c55e;margin-right:8px;vertical-align:middle;flex-shrink:0"></span>'
        const lis = items.map((name) =>
          `<li style="padding:4px 0;display:flex;align-items:center">${dot}<span style="font-size:13px">${renderInline(name)}</span></li>`
        ).join('')
        parts.push(`<ul style="list-style:none;margin:8px 0;padding:0">${lis}</ul>`)
      }
      continue
    }

    // ── Docker CLI table block ─────────────────────────────────────────────
    if (dockerTableHeaderRe.test(line) && i + 1 < lines.length) {
      const headers = line.split(/\s{2,}/).map((h) => h.trim()).filter(Boolean)
      i++
      const rows: string[][] = []
      while (i < lines.length && lines[i] && !lines[i].startsWith('#')) {
        const cols = lines[i].split(/\s{2,}/).map((c) => c.trim())
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
      const lis = items.map((t) => `<li style="padding:3px 0;font-size:13px">${renderInline(t)}</li>`).join('')
      parts.push(`<ol style="margin:8px 0 8px 18px;padding:0">${lis}</ol>`)
      continue
    }

    // ── Log lines block ────────────────────────────────────────────────────
    const isLogLine = (l: string) =>
      /^\d{4}-\d{2}-\d{2}/.test(l) ||
      /^\[\d{4}-\d{2}-\d{2}/.test(l) ||
      /^[A-Z]{3,}\s+\d/.test(l) ||
      /^\d+\.\d+\.\d+\.\d+/.test(l) ||
      /\[(?:INFO|WARN|ERROR|DEBUG|TRACE|FATAL)\]/.test(l)

    if (isLogLine(line)) {
      const logLines: string[] = []
      while (i < lines.length && (isLogLine(lines[i]) || /^[-\w]/.test(lines[i]))) {
        logLines.push(lines[i])
        i++
        if (i < lines.length && /^(There|The|Here|All|No |Running|Stopped|Total)/.test(lines[i])) break
      }
      parts.push(
        `<pre style="margin:8px 0;padding:10px 12px;background:#020617;border-radius:6px;` +
        `font-size:11px;line-height:1.6;overflow-x:auto;white-space:pre-wrap;word-break:break-all;` +
        `border:1px solid #1e293b;color:#94a3b8">` +
        logLines.map(escHtml).join('\n') + `</pre>`
      )
      continue
    }

    // ── Plain text paragraph ───────────────────────────────────────────────
    parts.push(`<p style="margin:6px 0;font-size:13px;line-height:1.5">${renderInline(line)}</p>`)
    i++
  }

  const icons: Record<string, string>  = { docker: '🐳', health: '❤️', proxmox: '🖥️' }
  const labels: Record<string, string> = { docker: 'Docker', health: 'Health', proxmox: 'Proxmox' }
  const icon      = icons[agentType]  ?? '🖥️'
  const typeLabel = labels[agentType] ?? agentType

  const header =
    `<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid #334155">` +
    `<span style="font-size:18px">${icon}</span>` +
    `<span style="font-weight:600;font-size:14px">${typeLabel} — <code style="font-size:13px;font-weight:400">${escHtml(serverLabel)}</code></span>` +
    `</div>`

  return (
    `<div style="background:#0f172a;color:#e2e8f0;border-radius:8px;padding:14px 16px;font-family:monospace;border:1px solid #1e293b">` +
    header + parts.join('') + `</div>`
  )
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function renderInline(s: string): string {
  let out = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  out = out.replace(/`([^`]+)`/g, '<code style="background:#1e293b;padding:1px 4px;border-radius:3px;font-size:11px">$1</code>')
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>')
  return out
}

// ── Proxmox-specific formatter ────────────────────────────────────────────────

const PX_STATE: Record<string, [dot: string, text: string]> = {
  running:   ['#22c55e', '#4ade80'],
  stopped:   ['#64748b', '#94a3b8'],
  paused:    ['#f59e0b', '#fbbf24'],
  suspended: ['#3b82f6', '#60a5fa'],
  online:    ['#22c55e', '#4ade80'],
  offline:   ['#ef4444', '#f87171'],
  error:     ['#ef4444', '#f87171'],
  degraded:  ['#f59e0b', '#fbbf24'],
  unknown:   ['#64748b', '#94a3b8'],
  starting:  ['#3b82f6', '#60a5fa'],
}

function pxStateBadge(val: string): string {
  const s = PX_STATE[val.toLowerCase().trim()]
  if (!s) return escHtml(val)
  return (
    `<span style="display:inline-flex;align-items:center;gap:5px">` +
    `<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${s[0]};flex-shrink:0"></span>` +
    `<span style="color:${s[1]}">${escHtml(val)}</span>` +
    `</span>`
  )
}

function pxCellValue(val: string, header: string): string {
  if (/^(status|state)$/i.test(header.trim())) return pxStateBadge(val)
  const pct = val.match(/^(\d+(?:\.\d+)?)\s*%/)
  if (pct) {
    const n = parseFloat(pct[1])
    const c = n >= 85 ? '#ef4444' : n >= 70 ? '#f59e0b' : '#22c55e'
    return `<span style="color:${c};font-weight:500">${escHtml(val)}</span>`
  }
  return renderInline(val)
}

function renderCredCard(items: string[]): string {
  const kvs: [string, string][] = []
  for (const item of items) {
    const clean = item.replace(/\*\*/g, '').trim()
    const colon = clean.indexOf(':')
    if (colon === -1) continue
    kvs.push([clean.slice(0, colon).trim(), clean.slice(colon + 1).trim()])
  }
  const rows = kvs.map(([k, v]) => {
    const isPass = /password/i.test(k)
    const valHtml = isPass
      ? `<code style="background:#0f172a;border:1px solid #334155;padding:2px 10px;border-radius:4px;` +
        `font-size:12px;letter-spacing:.05em;color:#fbbf24;user-select:all">${escHtml(v)}</code>`
      : `<span style="font-size:13px;color:#e2e8f0">${renderInline(v)}</span>`
    return (
      `<tr>` +
      `<td style="padding:5px 14px 5px 0;color:#64748b;font-size:11px;text-transform:uppercase;` +
      `letter-spacing:.05em;white-space:nowrap;vertical-align:middle">${escHtml(k)}</td>` +
      `<td style="padding:5px 0;font-weight:500;vertical-align:middle">${valHtml}</td>` +
      `</tr>`
    )
  }).join('')
  return (
    `<div style="background:#0a1628;border:1px solid rgba(34,197,94,.3);border-radius:8px;padding:14px 16px;margin:10px 0">` +
    `<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">` +
    `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#22c55e"></span>` +
    `<span style="font-size:13px;font-weight:600;color:#4ade80">Instance Ready</span>` +
    `</div>` +
    `<table style="border-collapse:collapse;width:100%"><tbody>${rows}</tbody></table>` +
    `<p style="margin:10px 0 0;font-size:11px;color:#475569;border-top:1px solid #1e293b;padding-top:8px">` +
    `Save these credentials — the password will not be shown again.</p>` +
    `</div>`
  )
}

export function formatProxmoxOutput(raw: string, serverLabel: string): string {
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean)
  if (!lines.length) return '<p style="color:#888">No output.</p>'

  const parts: string[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // ── Code fence ─────────────────────────────────────────────────────────
    if (line.startsWith('```')) {
      i++
      const codeLines: string[] = []
      while (i < lines.length && !lines[i].startsWith('```')) { codeLines.push(lines[i]); i++ }
      if (i < lines.length) i++
      parts.push(
        `<pre style="margin:8px 0;padding:10px 12px;background:#020617;border-radius:6px;` +
        `font-size:11px;line-height:1.6;overflow-x:auto;white-space:pre-wrap;word-break:break-all;` +
        `border:1px solid #1e293b;color:#94a3b8">` +
        codeLines.map(escHtml).join('\n') + `</pre>`
      )
      continue
    }

    // ── Markdown headings ──────────────────────────────────────────────────
    const hm = line.match(/^(#{1,3})\s+(.+)$/)
    if (hm) {
      const lvl = hm[1].length
      const sz = (['15px', '14px', '13px'] as const)[lvl - 1]
      const mt = lvl === 1 ? '14px 0 6px' : '10px 0 4px'
      const bb = lvl === 1 ? 'border-bottom:1px solid #334155;padding-bottom:4px;' : ''
      parts.push(`<p style="margin:${mt};font-size:${sz};font-weight:600;color:#f1f5f9;${bb}">${renderInline(hm[2])}</p>`)
      i++
      continue
    }

    // ── Status / health badge (Proxmox-extended) ───────────────────────────
    const bm = line.match(/^(HEALTHY|WARNING|CRITICAL|ONLINE|OFFLINE|DEGRADED)\b/i)
    if (bm) {
      const lvl = bm[1].toUpperCase()
      const isOk   = lvl === 'HEALTHY' || lvl === 'ONLINE'
      const isWarn = lvl === 'WARNING' || lvl === 'DEGRADED'
      const color = isOk ? '#22c55e' : isWarn ? '#f59e0b' : '#ef4444'
      const bg    = isOk ? '#052e16'  : isWarn ? '#1c1400'  : '#1c0a0a'
      parts.push(
        `<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:6px;` +
        `background:${bg};border:1px solid ${color};margin:8px 0">` +
        `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color};flex-shrink:0"></span>` +
        `<span style="font-size:13px;font-weight:600;color:${color}">${renderInline(line)}</span>` +
        `</div>`
      )
      i++
      continue
    }

    // ── Markdown pipe table ────────────────────────────────────────────────
    if (/^\|.+\|$/.test(line)) {
      const headers = line.split('|').map((c) => c.trim()).filter(Boolean)
      i++
      if (i < lines.length && /^\|[\s\-|:]+\|$/.test(lines[i])) i++
      const rows: string[][] = []
      while (i < lines.length && /^\|.+\|$/.test(lines[i])) {
        rows.push(lines[i].split('|').map((c) => c.trim()).filter(Boolean))
        i++
      }
      const thStyle = 'padding:6px 10px;text-align:left;background:#1e293b;color:#94a3b8;font-size:11px;text-transform:uppercase;letter-spacing:.05em'
      const tdStyle = 'padding:6px 10px;font-size:12px;border-top:1px solid #334155;color:#e2e8f0'
      const ths = headers.map((h) => `<th style="${thStyle}">${escHtml(h)}</th>`).join('')
      const trs = rows.map((row) => {
        const si = headers.findIndex((h) => /^(status|state)$/i.test(h))
        const state = si >= 0 ? (row[si] ?? '').toLowerCase() : ''
        const rowBg = state === 'running' || state === 'online' ? 'rgba(34,197,94,.04)'
          : state === 'stopped' || state === 'offline' ? 'rgba(100,116,139,.04)'
          : 'transparent'
        const tds = headers.map((h, ci) =>
          `<td style="${tdStyle}">${pxCellValue(row[ci] ?? '', h)}</td>`
        ).join('')
        return `<tr style="background:${rowBg}">${tds}</tr>`
      }).join('')
      parts.push(
        `<div style="overflow-x:auto;margin:8px 0">` +
        `<table style="width:100%;border-collapse:collapse;font-family:monospace;background:#0f172a;border-radius:6px;overflow:hidden">` +
        `<thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table></div>`
      )
      continue
    }

    // ── Bullet list ────────────────────────────────────────────────────────
    if (/^[-*•]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^[-*•]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*•]\s+/, ''))
        i++
      }

      // Credential card: bullet list that contains both a VM/container ID and a password
      const hasPass = items.some((t) => /password\s*:/i.test(t.replace(/\*\*/g, '')))
      const hasId   = items.some((t) => /\b(vm\s*id|vmid|container\s*id|ct\s*id)\b/i.test(t))
      if (hasPass && hasId) {
        parts.push(renderCredCard(items))
        continue
      }

      const isMetrics = items.filter((t) => /:\s*\S/.test(t)).length > items.length / 2
      if (isMetrics) {
        const tableRows = items.map((item) => {
          const clean = item.replace(/\*\*/g, '').trim()
          const colon = clean.indexOf(':')
          if (colon === -1) return `<tr><td colspan="2" style="padding:4px 8px;font-size:12px;color:#94a3b8">${renderInline(item)}</td></tr>`
          const key = clean.slice(0, colon).trim()
          const val = clean.slice(colon + 1).trim()
          return (
            `<tr>` +
            `<td style="padding:4px 8px;font-size:11px;color:#64748b;white-space:nowrap">${escHtml(key)}</td>` +
            `<td style="padding:4px 8px;font-size:12px;color:#e2e8f0;font-weight:500">${pxCellValue(val, key)}</td>` +
            `</tr>`
          )
        }).join('')
        parts.push(`<table style="width:100%;border-collapse:collapse;margin:8px 0"><tbody>${tableRows}</tbody></table>`)
      } else {
        const dot = '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#3b82f6;margin-right:8px;vertical-align:middle;flex-shrink:0"></span>'
        const lis = items.map((name) =>
          `<li style="padding:4px 0;display:flex;align-items:center">${dot}<span style="font-size:13px">${renderInline(name)}</span></li>`
        ).join('')
        parts.push(`<ul style="list-style:none;margin:8px 0;padding:0">${lis}</ul>`)
      }
      continue
    }

    // ── Numbered list ──────────────────────────────────────────────────────
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ''))
        i++
      }
      const lis = items.map((t) => `<li style="padding:3px 0;font-size:13px">${renderInline(t)}</li>`).join('')
      parts.push(`<ol style="margin:8px 0 8px 18px;padding:0">${lis}</ol>`)
      continue
    }

    // ── Plain paragraph ────────────────────────────────────────────────────
    parts.push(`<p style="margin:6px 0;font-size:13px;line-height:1.5">${renderInline(line)}</p>`)
    i++
  }

  const header =
    `<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid #334155">` +
    `<span style="font-size:18px">🖥️</span>` +
    `<span style="font-weight:600;font-size:14px">Proxmox — <code style="font-size:13px;font-weight:400">${escHtml(serverLabel)}</code></span>` +
    `</div>`

  return (
    `<div style="background:#0f172a;color:#e2e8f0;border-radius:8px;padding:14px 16px;font-family:monospace;border:1px solid #1e293b">` +
    header + parts.join('') + `</div>`
  )
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
