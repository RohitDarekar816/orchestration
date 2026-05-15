import type { ActionFunction } from '@sdk/types'
import { leon } from '@sdk/leon'
import { Network } from '@sdk/network'
import { Settings } from '@sdk/settings'

import {
  errorMessage,
  findServerInUtterance,
  getOzConfig,
  getToken,
  launchAndWait,
  resolveServerByName,
} from '../lib/oz_client'

// Global shared state for duplicate invocation coordination.
// Leon's ActionCalling LLM may call launch_agent multiple times per utterance
// with separate tsx module evaluations. A global ensures all evaluations
// share the same GitHub file card state.
const _G = (globalThis as any).__oz_launch_shared = (globalThis as any).__oz_launch_shared || { ghCard: null as string | null }

const FILE_RE = /\[FILE:([^\]]+)\]\s*\n?([\s\S]*?)\n?\[\/FILE\]/gi
const CODEBLOCK_RE = /```(\w*)\n([\s\S]*?)```/g
const LANG_HINTS: Record<string, string> = {
  yaml: 'docker-compose.yml', yml: 'docker-compose.yml',
  json: 'output.json', python: 'script.py', py: 'script.py',
  ts: 'file.ts', typescript: 'file.ts',
  js: 'file.js', javascript: 'file.js',
  html: 'index.html', css: 'styles.css',
  sh: 'script.sh', bash: 'script.sh', shell: 'script.sh',
  dockerfile: 'Dockerfile', xml: 'output.xml',
  sql: 'query.sql', go: 'main.go', rust: 'main.rs',
  md: 'output.md', markdown: 'output.md',
}

function extractFiles(output: string): { files: { filename: string; content: string }[]; cleaned: string } {
  const files: { filename: string; content: string }[] = []

  // Pass 1: extract [FILE:...][/FILE] markers (structured artifact output).
  let cleaned = output.replace(FILE_RE, (_match, filename: string, content: string) => {
    files.push({ filename: filename.trim(), content: content.trim() })
    return ''
  })

  // Pass 2: if no FILE markers found, extract markdown code blocks as fallback.
  if (files.length === 0) {
    let blockIndex = 0
    cleaned = cleaned.replace(CODEBLOCK_RE, (_match: string, lang: string, content: string) => {
      blockIndex++
      const trimmed = content.trim()
      if (trimmed.length < 5) return _match
      const hint = lang.toLowerCase().trim()
      const filename = LANG_HINTS[hint] || (hint ? `output.${hint}` : `codeblock_${blockIndex}.txt`)
      files.push({ filename, content: trimmed })
      return ''
    })
    if (files.length > 0) cleaned = cleaned.trim()
  }

  // Pass 3: content-based heuristic detection when both markers and code
  // blocks are absent. Looks for blocks that strongly resemble known file
  // formats (docker-compose, Dockerfile, JSON, shell scripts, etc.).
  if (files.length === 0) {
    const lines = cleaned.split('\n')
    const nonEmptyLines = lines.filter(l => l.trim().length > 0)
    if (nonEmptyLines.length >= 3) {
      const first = nonEmptyLines[0].trim()
      const second = nonEmptyLines[1]?.trim() ?? ''
      const block = nonEmptyLines.slice(0, 30).join('\n')

      let fileName = ''
      if (/^version:\s*["']\d/.test(first) && /\bservices:\s*$/.test(second)) {
        fileName = 'docker-compose.yml'
      } else if (/^FROM\s+\S+/i.test(first)) {
        fileName = 'Dockerfile'
      } else if (/^[\s]*\{[\s\S]*\}[\s]*$/.test(block) && block.includes('"')) {
        fileName = 'output.json'
      } else if (/^#!/.test(first)) {
        fileName = first.includes('python') ? 'script.py' : first.includes('bash') || first.includes('sh') ? 'script.sh' : 'script'
      }

      if (fileName) {
        files.push({ filename: fileName, content: nonEmptyLines.join('\n') })
        cleaned = cleaned.replace(nonEmptyLines.join('\n'), '').trim()
        if (!cleaned) cleaned = ''
      }
    }
  }

  return { files, cleaned: cleaned.trim() || '(file extracted)' }
}

export const run: ActionFunction = async function (params) {
  const settings = new Settings()
  const network = new Network()

  const prompt = (params.action_arguments?.prompt as string) || params.utterance
  console.error('[oz-launch] prompt:', prompt ? prompt.substring(0, 300) : 'EMPTY')
  console.error('[oz-launch] utterance:', params.utterance ? params.utterance.substring(0, 300) : 'EMPTY')
  console.error('[oz-launch] action_arguments:', JSON.stringify(params.action_arguments))
  if (!prompt) {
    await leon.answer({ key: 'no_prompt' })
    return
  }

  const serverName = (params.action_arguments?.server as string) || ''
  const agentType = ((await settings.get('default_agent_type')) as string) || 'oz-local'
  const maxRuntime = Number((await settings.get('default_max_runtime')) as string) || 300

  try {
    const cfg = await getOzConfig(settings)
    const token = await getToken(cfg, network)

    // Check for GitHub repo URL in the prompt — fetch files directly if found.
    const ghMatch = prompt.match(
      /github\.com\/([^/\s]+)\/([^/\s.#?]+)(?:\.git|[\/#?\s]|$)/i
    )
    console.error('[oz-launch] ghMatch:', ghMatch ? `${ghMatch[1]}/${ghMatch[2]}` : 'NO MATCH')
    if (ghMatch && !_G.ghCard) {
      const [, owner, repo] = ghMatch
      const branches = ['master', 'main']
      const candidates = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml']
      for (const branch of branches) {
        for (const file of candidates) {
          const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${file}`
          console.error('[oz-launch] trying:', rawUrl)
          try {
            const resp = await network.request<string>({ url: rawUrl, method: 'GET', responseType: 'text' })
            console.error('[oz-launch] response status:', resp.statusCode, 'length:', resp.data ? resp.data.length : 0)
            if (resp.data && resp.data.length > 10) {
              const content = resp.data
              const escaped = content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
              const ext = file.includes('.') ? file.split('.').pop()!.toUpperCase() : 'FILE'
              const sizeLabel = content.length > 1024 ? `${(content.length / 1024).toFixed(1)} KB` : `${content.length} B`
              const copyId = `cpy-gh-${owner}-${repo}-${branch}`
              _G.ghCard = `<div style="margin-bottom:8px;"><div style="background:#1e293b;border:1px solid #334155;border-radius:12px;margin:12px 0;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.3);">
  <div style="display:flex;align-items:center;gap:10px;padding:10px 16px;background:#0f172a;border-bottom:1px solid #334155;">
    <span style="background:#334155;color:#94a3b8;font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;letter-spacing:0.5px;">${ext}</span>
    <span style="color:#e2e8f0;font-size:14px;font-weight:600;font-family:monospace;flex:1;">${file}</span>
    <span style="color:#64748b;font-size:11px;font-family:monospace;">${sizeLabel}</span>
  </div>
  <pre style="margin:0;padding:16px;background:#1e293b;color:#e2e8f0;font-size:13px;line-height:1.6;overflow-x:auto;white-space:pre-wrap;word-break:break-all;font-family:monospace;">${escaped}</pre>
  <div style="display:flex;gap:8px;padding:8px 16px;background:#0f172a;border-top:1px solid #334155;">
    <div id="${copyId}" style="display:none;">${escaped}</div>
    <button onclick="navigator.clipboard.writeText(document.getElementById('${copyId}').textContent)" style="cursor:pointer;background:#334155;color:#e2e8f0;border:none;border-radius:6px;padding:6px 14px;font-size:12px;font-family:sans-serif;">Copy</button>
    <a href="${rawUrl}" target="_blank" rel="noopener noreferrer" style="cursor:pointer;background:#1d4ed8;color:#fff;border:none;border-radius:6px;padding:6px 14px;font-size:12px;font-family:sans-serif;text-decoration:none;display:inline-block;">Download</a>
  </div>
</div></div>`
              continue
            }
          } catch {
            // File not found on this branch — try next candidate.
          }
        }
      }
    }

    // If a GitHub file card exists, return immediately (no agent needed).
    if (_G.ghCard) {
      await leon.answer({ key: 'result', data: { files_html: _G.ghCard, logs: 'Found file from GitHub.', files: [] } })
      return
    }

    let server = serverName ? await resolveServerByName(serverName, cfg.apiUrl, token, network) : null
    if (serverName && !server) {
      await leon.answer({
        key: 'error',
        data: { message: `Server '${serverName}' not found in Oz. Register it at /api/servers first.` },
      })
      return
    }
    if (!server) {
      server = await findServerInUtterance(prompt, cfg.apiUrl, token, network)
    }

    await leon.answer({ key: 'launching' })

    const { output, status, agentId } = await launchAndWait({
      apiUrl: cfg.apiUrl,
      token,
      network,
      agentType,
      prompt,
      serverId: server?.id ?? null,
      maxRuntime,
      maxPollSeconds: maxRuntime + 60,
      onProgress: async (message) => {
        await leon.answer({ key: 'still_working', data: { message } })
      },
    })

    // Extract file artifacts from agent output and upload them.
    const { files, cleaned } = extractFiles(output)
    let uploadedFiles: { id: number; filename: string; size: number; mime_type: string }[] = []
    if (files.length > 0) {
      try {
        const res = await network.request<{ files: typeof uploadedFiles }>({
          url: `${cfg.apiUrl}/agents/${agentId}/files`,
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          data: files.map((f) => ({
            filename: f.filename,
            content: f.content,
            mime_type: f.filename.endsWith('.md') ? 'text/markdown'
              : f.filename.endsWith('.json') ? 'application/json'
              : f.filename.endsWith('.py') ? 'text/x-python'
              : f.filename.endsWith('.ts') || f.filename.endsWith('.tsx') ? 'text/typescript'
              : f.filename.endsWith('.js') || f.filename.endsWith('.mjs') ? 'text/javascript'
              : f.filename.endsWith('.html') ? 'text/html'
              : f.filename.endsWith('.css') ? 'text/css'
              : f.filename.endsWith('.yaml') || f.filename.endsWith('.yml') ? 'text/yaml'
              : f.filename.endsWith('.sh') ? 'text/x-shellscript'
              : f.filename.endsWith('.xml') ? 'text/xml'
              : f.filename.endsWith('.sql') ? 'text/x-sql'
              : f.filename.endsWith('.go') ? 'text/x-go'
              : f.filename.endsWith('.rs') ? 'text/x-rust'
              : f.filename.endsWith('.toml') ? 'text/toml'
              : f.filename.endsWith('.ini') || f.filename.endsWith('.cfg') ? 'text/plain'
              : f.filename.endsWith('.env') ? 'text/plain'
              : 'text/plain',
          })),
        })
        uploadedFiles = res.data.files
      } catch {
        // File upload is best-effort — don't fail the whole response.
      }
    }

    await leon.answer({
      key: 'launched',
      data: { agent_id: String(agentId), status, files: uploadedFiles },
    })

    const filesHtml = uploadedFiles.length > 0
      ? '<div style="margin-bottom:8px;">' + uploadedFiles.map((f) => {
          const raw = files.find((ff) => ff.filename === f.filename)
          if (!raw) return ''
          const escaped = raw.content
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
          const downloadUrl = `${cfg.publicUrl}/api/agents/${agentId}/files/${f.id}`
          const ext = f.filename.includes('.') ? f.filename.split('.').pop()!.toUpperCase() : 'FILE'
          const sizeLabel = f.size > 1024 ? `${(f.size / 1024).toFixed(1)} KB` : `${f.size} B`
          const copyId = `cpy-${agentId}-${f.id}`
          const rawHtml = raw.content
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
          return `<div style="background:#1e293b;border:1px solid #334155;border-radius:12px;margin:12px 0;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.3);">
  <div style="display:flex;align-items:center;gap:10px;padding:10px 16px;background:#0f172a;border-bottom:1px solid #334155;">
    <span style="background:#334155;color:#94a3b8;font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;letter-spacing:0.5px;">${ext}</span>
    <span style="color:#e2e8f0;font-size:14px;font-weight:600;font-family:monospace;flex:1;">${f.filename}</span>
    <span style="color:#64748b;font-size:11px;font-family:monospace;">${sizeLabel}</span>
  </div>
  <pre style="margin:0;padding:16px;background:#1e293b;color:#e2e8f0;font-size:13px;line-height:1.6;overflow-x:auto;white-space:pre-wrap;word-break:break-all;font-family:monospace;">${escaped}</pre>
  <div style="display:flex;gap:8px;padding:8px 16px;background:#0f172a;border-top:1px solid #334155;">
    <div id="${copyId}" style="display:none;">${rawHtml}</div>
    <button onclick="navigator.clipboard.writeText(document.getElementById('${copyId}').textContent)" style="cursor:pointer;background:#334155;color:#e2e8f0;border:none;border-radius:6px;padding:6px 14px;font-size:12px;font-family:sans-serif;">Copy</button>
    <a href="${downloadUrl}" download style="cursor:pointer;background:#1d4ed8;color:#fff;border:none;border-radius:6px;padding:6px 14px;font-size:12px;font-family:sans-serif;text-decoration:none;display:inline-block;">Download</a>
  </div>
</div>`
        }).filter(Boolean).join('') + '</div>'
      : ''

    const displayText = cleaned || output

    await leon.answer({
      key: 'result',
      data: { files_html: (_G.ghCard || '') + filesHtml, logs: displayText, files: uploadedFiles },
    })
  } catch (error) {
    await leon.answer({ key: 'error', data: { message: errorMessage(error) } })
  }
}
