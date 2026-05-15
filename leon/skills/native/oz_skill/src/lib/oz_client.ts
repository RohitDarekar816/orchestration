import { Network, NetworkError } from '@sdk/network'
import { Settings } from '@sdk/settings'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LogEntry {
  stream: string
  content: string
  timestamp: string
}

export interface AgentSummary {
  id: number
  agent_type: string
  status: string
  started_at: string | null
  finished_at: string | null
  created_at: string
  exit_code: number | null
}

export interface ServerSummary {
  id: number
  name: string
  host: string
  port: number
  username: string
  auth_type: string
  tags: string[]
  description: string | null
}

export interface LaunchResult {
  output: string
  status: string
  agentId: number
}

// ── Output extraction ─────────────────────────────────────────────────────────

const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]/g

const NOISE_PATTERNS: RegExp[] = [
  /^Reading package lists/,
  /^Building dependency tree/,
  /^Setting up /,
  /^Processing triggers/,
  /^Preparing to unpack/,
  /^Unpacking /,
  /^update-alternatives/,
  /^\d+ upgraded,/,
  /^npm warn/i,
  /^added \d+ packages/,
  /^Performing one time/,
  /^sqlite-migration/,
  /^Database migration complete/,
  /^The `oz` CLI/,
]

/**
 * Strip ANSI codes and package-manager noise from agent log entries, then
 * truncate to a safe length so Leon's response stays readable.
 */
export function extractOutput(
  logs: LogEntry[],
  maxLines = 300,
  maxChars = 6000
): string {
  // Only use stdout — stderr contains agent debug/trace lines (e.g. [oz-local] …).
  // If there is no stdout at all (e.g. plain bash agent), fall back to stderr.
  const stdoutLines = logs
    .filter((l) => l.stream === 'stdout')
    .map((l) => l.content.replace(ANSI_RE, '').trim())
    .filter((l) => l.length > 0 && !NOISE_PATTERNS.some((p) => p.test(l)))

  const rawLines = stdoutLines.length > 0
    ? stdoutLines
    : logs
        .filter((l) => l.stream === 'stderr')
        .map((l) => l.content.replace(ANSI_RE, '').trim())
        .filter((l) => l.length > 0 && !NOISE_PATTERNS.some((p) => p.test(l)))

  const lines = rawLines

  const kept = lines.length > maxLines ? lines.slice(-maxLines) : lines
  const joined = kept.join('\n').trim()

  if (!joined) return '(no output)'
  if (joined.length <= maxChars) return joined

  // Keep the tail — most useful for logs and deploy output.
  const tail = joined.slice(-maxChars)
  const firstBreak = tail.indexOf('\n')
  const trimmed = firstBreak >= 0 ? tail.slice(firstBreak + 1) : tail
  return `[… output truncated — showing last ~${maxChars} chars …]\n${trimmed}`
}

// ── Network retry ─────────────────────────────────────────────────────────────

function isRetryable(err: unknown): boolean {
  if (err instanceof NetworkError) {
    const code: number = (err as NetworkError & { response?: { statusCode?: number } }).response?.statusCode ?? 0
    // Retry on server errors or rate-limiting; never on 4xx client errors.
    return code === 0 || code === 429 || code >= 500
  }
  if (err instanceof Error) {
    return (
      err.message.includes('ECONNREFUSED') ||
      err.message.includes('ETIMEDOUT') ||
      err.message.includes('ENOTFOUND') ||
      err.message.includes('fetch failed')
    )
  }
  return false
}

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3, baseDelay = 1500): Promise<T> {
  let lastErr: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (!isRetryable(err) || attempt === maxAttempts) throw err
      await sleep(baseDelay * attempt)
    }
  }
  throw lastErr
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function getOzConfig(
  settings: Settings
): Promise<{ apiUrl: string; publicUrl: string; email: string | null; password: string | null; authToken: string | null }> {
  return {
    apiUrl: ((await settings.get('oz_api_url')) as string) || 'http://localhost:8000/api',
    publicUrl: ((await settings.get('oz_public_url')) as string) || 'http://localhost:8090',
    authToken: ((await settings.get('oz_auth_token')) as string) || null,
    email: ((await settings.get('oz_email')) as string) || null,
    password: ((await settings.get('oz_password')) as string) || null,
  }
}

export async function getToken(
  cfg: Awaited<ReturnType<typeof getOzConfig>>,
  network: Network
): Promise<string> {
  if (cfg.authToken) return cfg.authToken

  if (!cfg.email || !cfg.password) {
    throw new Error('Oz API credentials not configured. Set oz_auth_token or oz_email + oz_password in settings.')
  }

  const formData = new URLSearchParams()
  formData.append('username', cfg.email)
  formData.append('password', cfg.password)

  const res = await withRetry(() =>
    network.request<Record<string, unknown>>({
      url: `${cfg.apiUrl}/auth/token`,
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      data: formData.toString(),
    })
  )

  const token = res.data.access_token as string
  if (!token) throw new Error('Authentication failed: no token returned.')
  return token
}

// ── Server registry ───────────────────────────────────────────────────────────

export async function resolveServerByName(
  serverName: string,
  apiUrl: string,
  token: string,
  network: Network
): Promise<ServerSummary | null> {
  if (!serverName) return null
  const res = await withRetry(() =>
    network.request<ServerSummary[]>({
      url: `${apiUrl}/servers`,
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    })
  )
  const servers = Array.isArray(res.data) ? res.data : []
  return servers.find((s) => s.name.toLowerCase() === serverName.toLowerCase()) ?? null
}

export async function fetchAllServers(
  apiUrl: string,
  token: string,
  network: Network
): Promise<ServerSummary[]> {
  const res = await withRetry(() =>
    network.request<ServerSummary[]>({
      url: `${apiUrl}/servers`,
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    })
  )
  return Array.isArray(res.data) ? res.data : []
}

export async function findServerInUtterance(
  utterance: string,
  apiUrl: string,
  token: string,
  network: Network
): Promise<ServerSummary | null> {
  if (!utterance) return null
  const servers = await fetchAllServers(apiUrl, token, network)
  const lowerUtterance = utterance.toLowerCase()
  for (const server of servers) {
    const name = server.name.toLowerCase()
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`\\b${escaped}\\b`, 'i')
    if (re.test(lowerUtterance)) return server
  }
  return null
}

// ── Launch + poll ─────────────────────────────────────────────────────────────

const PROGRESS_INTERVAL_MS = 30_000

export async function launchAndWait(opts: {
  apiUrl: string
  token: string
  network: Network
  agentType: string
  prompt: string
  serverId?: number | null
  maxRuntime?: number
  maxPollSeconds?: number
  /** Called roughly every 30 s while the agent is still running. */
  onProgress?: (message: string) => Promise<void>
}): Promise<LaunchResult> {
  const {
    apiUrl,
    token,
    network,
    agentType,
    prompt,
    serverId,
    maxRuntime = 300,
    maxPollSeconds = 600,
    onProgress,
  } = opts

  const launchRes = await withRetry(() =>
    network.request<{ id: number; status: string }>({
      url: `${apiUrl}/agents/launch`,
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: {
        agent_type: agentType,
        prompt,
        ...(serverId != null ? { server_id: serverId } : {}),
        max_runtime: maxRuntime,
      },
    })
  )

  const agentId = launchRes.data.id
  const startMs = Date.now()
  const deadline = startMs + maxPollSeconds * 1000
  let interval = 2000
  let lastProgressMs = startMs

  while (Date.now() < deadline) {
    await sleep(interval)
    interval = Math.min(Math.round(interval * 1.5), 10_000)

    // Emit a progress heartbeat every ~30 s for long-running tasks.
    if (onProgress && Date.now() - lastProgressMs >= PROGRESS_INTERVAL_MS) {
      const elapsed = Math.round((Date.now() - startMs) / 1000)
      await onProgress(`Agent #${agentId} is still running (${elapsed}s elapsed)…`)
      lastProgressMs = Date.now()
    }

    let status: string
    try {
      const statusRes = await withRetry(() =>
        network.request<{ status: string }>({
          url: `${apiUrl}/agents/${agentId}`,
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` },
        })
      )
      status = statusRes.data.status
    } catch {
      // Transient poll failure — keep waiting until deadline.
      continue
    }

    if (status === 'completed' || status === 'failed' || status === 'cancelled') {
      const logsRes = await withRetry(() =>
        network.request<LogEntry[]>({
          url: `${apiUrl}/agents/${agentId}/logs`,
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` },
        })
      )
      const raw = Array.isArray(logsRes.data) ? logsRes.data : []
      return { output: extractOutput(raw), status, agentId }
    }
  }

  return {
    output: `Agent #${agentId} is still running after ${maxPollSeconds}s. Use get_agent to check on it.`,
    status: 'running',
    agentId,
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function errorMessage(error: unknown): string {
  if (error instanceof NetworkError) {
    const data = (error as NetworkError & { response?: { data?: unknown } }).response?.data
    if (data) return typeof data === 'string' ? data : JSON.stringify(data)
  }
  if (error instanceof Error) return error.message
  return String(error)
}
