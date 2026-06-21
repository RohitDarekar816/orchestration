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

export interface DockerEndpointSummary {
  id: number
  name: string
  api_url: string
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
  // Package manager noise
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

  // Opencode TUI progress lines (tool trace, not the AI's response)
  /^> /,             // > build · model-name, > Edit file.ts, > Read config.yml
  /^← /,             // ← Read  (unicode left-arrow file operation)
  /^→ /,             // → Write (unicode right-arrow file operation)
  /^Wrote file/,     // "Wrote file successfully."
  /^Write /,         // "Write config.yml"
  /^\$ /,            // $ cmd  (opencode echoes each bash command it runs)

  // CF agent status lines (debug/trace, not the AI answer)
  /^\[cf-docker-agent\]/,
  /^\[cf-server-health-agent\]/,
  /^\[cf-proxmox-agent\]/,

  // System-prompt content leaking through ps aux / process listings
  /--dangerously-skip-permissions/,
  /OUTPUT RULE:/,
  /SSH RULE:/,
  /FILE OUTPUT RULE/,
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
        .filter((l) => l.stream === 'stderr' || l.stream === 'error')
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

// ── Token Cache ───────────────────────────────────────────────────────────────

let _cachedToken: { token: string; expiresAt: number } | null = null

// ── Server Cache ──────────────────────────────────────────────────────────────

let _cachedServers: { servers: ServerSummary[]; apiUrl: string; fetchedAt: number } | null = null

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

  // Use cached token if still valid (JWT tokens typically last 60 min — cache for 50).
  if (_cachedToken && Date.now() < _cachedToken.expiresAt) {
    return _cachedToken.token
  }

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

  _cachedToken = { token, expiresAt: Date.now() + 50 * 60 * 1000 }
  return token
}

export function clearTokenCache(): void {
  _cachedToken = null
}

export function clearServerCache(): void {
  _cachedServers = null
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
  // Cache server list for 30 seconds — servers rarely change mid-conversation.
  if (_cachedServers && _cachedServers.apiUrl === apiUrl && Date.now() - _cachedServers.fetchedAt < 30_000) {
    return _cachedServers.servers
  }

  const res = await withRetry(() =>
    network.request<ServerSummary[]>({
      url: `${apiUrl}/servers`,
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    })
  )

  const servers = Array.isArray(res.data) ? res.data : []
  _cachedServers = { servers, apiUrl, fetchedAt: Date.now() }
  return servers
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

// ── Docker target resolution ──────────────────────────────────────────────────

/**
 * The result of resolving who the user wants to run Docker commands against.
 * - endpoint: a registered Docker API endpoint (routes to cloudflare_docker_agent)
 * - ssh_server: an SSH-connected server registered in Oz (routes to oz-local)
 * - local: the Docker daemon on this machine (routes to oz-local, no SSH)
 */
export type DockerTarget =
  | { kind: 'endpoint'; endpoint: DockerEndpointSummary }
  | { kind: 'ssh_server'; server: ServerSummary }
  | { kind: 'local' }

/**
 * Authoritative target resolver for Docker queries.
 *
 * Strategy (in priority order):
 *  1. Explicit local-intent words → local immediately
 *  2. Fetch all endpoints + SSH servers in parallel
 *  3. Build a candidate list from: NLU hint, preposition patterns ("on X"),
 *     capitalised words, and every word ≥4 chars in the utterance
 *  4. For each candidate try:
 *     a) Exact endpoint name match
 *     b) Endpoint hostname / subdomain match (extracted from api_url)
 *     c) Partial endpoint name match (candidate ≥ 3 chars, name contains it)
 *     d) Exact SSH server name match
 *     e) SSH server host match
 *  5. Single-endpoint fallback: if no candidate matched but there is exactly
 *     one endpoint registered and the utterance carries remote intent, use it
 *  6. Default to local
 */
export async function resolveDockerTarget(
  utterance: string,
  nluServerHint: string,
  apiUrl: string,
  token: string,
  network: Network
): Promise<DockerTarget> {
  const u = utterance.toLowerCase()

  // 1. Explicit local intent overrides everything.
  if (/\b(local|localhost|this\s+machine|this\s+server|here|locally|my\s+machine|my\s+computer)\b/.test(u)) {
    return { kind: 'local' }
  }

  // 2. Fetch all endpoints + servers in parallel — one round-trip.
  const [endpointsResult, serversResult] = await Promise.allSettled([
    fetchDockerEndpoints(apiUrl, token, network),
    fetchAllServers(apiUrl, token, network),
  ])
  const endpoints: DockerEndpointSummary[] = endpointsResult.status === 'fulfilled' ? endpointsResult.value : []
  const servers: ServerSummary[] = serversResult.status === 'fulfilled' ? serversResult.value : []

  // 3. Build candidate name list (deduped, longest first so specific matches win).
  const candidates = buildCandidates(utterance, nluServerHint)

  // 4. Try each candidate against all targets.
  for (const candidate of candidates) {
    const cl = candidate.toLowerCase()

    // (a) Exact endpoint name
    const epExact = endpoints.find((e) => e.name.toLowerCase() === cl)
    if (epExact) return { kind: 'endpoint', endpoint: epExact }

    // (b) Endpoint hostname / subdomain from api_url
    const epHost = endpoints.find((e) => {
      const hostname = extractHostname(e.api_url)
      if (!hostname) return false
      // "familyestate" matches "familyestate.in", "api.familyestate.in", etc.
      return hostname === cl || hostname.startsWith(cl + '.') || hostname.endsWith('.' + cl) || hostname.includes('.' + cl + '.')
    })
    if (epHost) return { kind: 'endpoint', endpoint: epHost }

    // (c) Partial endpoint name (candidate ≥ 3 chars and name contains it)
    if (cl.length >= 3) {
      const epPartial = endpoints.find((e) => e.name.toLowerCase().includes(cl))
      if (epPartial) return { kind: 'endpoint', endpoint: epPartial }
    }

    // (d) Exact SSH server name
    const srvExact = servers.find((s) => s.name.toLowerCase() === cl)
    if (srvExact) return { kind: 'ssh_server', server: srvExact }

    // (e) SSH server host match
    const srvHost = servers.find((s) => s.host.toLowerCase() === cl)
    if (srvHost) return { kind: 'ssh_server', server: srvHost }
  }

  // 5. Single-endpoint fallback when the utterance has remote intent but no
  //    candidate matched a known name.
  if (endpoints.length === 1 && hasRemoteIntent(u, servers)) {
    return { kind: 'endpoint', endpoint: endpoints[0] }
  }

  // 6. Default to local Docker.
  return { kind: 'local' }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

async function fetchDockerEndpoints(apiUrl: string, token: string, network: Network): Promise<DockerEndpointSummary[]> {
  try {
    const res = await withRetry(() =>
      network.request<DockerEndpointSummary[]>({
        url: `${apiUrl}/docker-endpoints`,
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      })
    )
    return Array.isArray(res.data) ? res.data : []
  } catch {
    return []
  }
}

/**
 * Build a prioritised candidate list from the utterance.
 * The NLU hint is most trusted; preposition-extracted words come next;
 * then capitalised tokens; then all ≥4-char words (lowest priority).
 */
function buildCandidates(utterance: string, nluHint: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []

  const add = (s: string) => {
    const t = s.trim()
    if (!t || t.length < 2) return
    const k = t.toLowerCase()
    if (!seen.has(k)) { seen.add(k); out.push(t) }
  }

  // NLU hint has highest confidence.
  if (nluHint) add(nluHint)

  // Preposition patterns: "on X", "for X", "at X", "from X", "check X",
  //                       "inspect X", "via X", "to X"
  const prepRe = /\b(?:on|for|at|from|check|inspect|via|to|about)\s+([a-zA-Z0-9][a-zA-Z0-9_.:-]*)/gi
  for (const m of utterance.matchAll(prepRe)) add(m[1])

  // Capitalised tokens (likely proper nouns / server names).
  const capRe = /\b([A-Z][a-zA-Z0-9_-]{2,})\b/g
  for (const m of utterance.matchAll(capRe)) add(m[1])

  // All remaining words ≥ 4 chars (broad sweep).
  const wordRe = /\b([a-zA-Z][a-zA-Z0-9_.-]{3,})\b/g
  for (const m of utterance.matchAll(wordRe)) add(m[1])

  return out
}

function extractHostname(url: string): string {
  try { return new URL(url).hostname.toLowerCase() } catch { return '' }
}

/**
 * Returns true when the utterance appears to be targeting a remote host,
 * not the local machine.  We avoid false positives by only triggering when
 * the utterance contains a word that is NOT a known SSH server name
 * (those are handled by the candidate loop above).
 */
function hasRemoteIntent(lower: string, knownServers: ServerSummary[]): boolean {
  // Explicit remote keywords
  if (/\b(remote|vps|server|endpoint|cloud|production|staging|prod)\b/.test(lower)) return true

  // Preposition + any word pattern ("on X", "at X", "from X") where X isn't
  // a stopword — suggests the user named a specific host
  const prepRe = /\b(?:on|at|from)\s+([a-zA-Z0-9][a-zA-Z0-9_.:-]+)/gi
  for (const m of lower.matchAll(prepRe)) {
    const candidate = m[1].toLowerCase()
    const stopWords = new Set(['the', 'my', 'a', 'an', 'this', 'that', 'our', 'your', 'their'])
    if (!stopWords.has(candidate)) return true
  }

  return false
}

// ── Legacy helpers (kept for backwards compat with existing callers) ──────────

export async function resolveDockerEndpointByName(
  name: string,
  apiUrl: string,
  token: string,
  network: Network
): Promise<DockerEndpointSummary | null> {
  if (!name) return null
  const endpoints = await fetchDockerEndpoints(apiUrl, token, network)
  const lower = name.toLowerCase()
  return endpoints.find((e) => e.name.toLowerCase() === lower) ?? null
}

export async function findDockerEndpointInUtterance(
  utterance: string,
  apiUrl: string,
  token: string,
  network: Network
): Promise<DockerEndpointSummary | null> {
  if (!utterance) return null
  const endpoints = await fetchDockerEndpoints(apiUrl, token, network)
  const lowerU = utterance.toLowerCase()
  for (const ep of endpoints) {
    const escaped = ep.name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (new RegExp(`\\b${escaped}\\b`, 'i').test(lowerU)) return ep
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
  // Start polling fast (1s) to catch quick tasks early, then back off to 15s max.
  let interval = 1000
  let lastProgressMs = startMs

  while (Date.now() < deadline) {
    await sleep(interval)
    interval = Math.min(Math.round(interval * 2), 15_000)

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
