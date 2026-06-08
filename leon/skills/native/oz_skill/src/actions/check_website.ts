import type { ActionFunction } from '@sdk/types'
import { leon } from '@sdk/leon'
import { Network } from '@sdk/network'
import { Settings } from '@sdk/settings'

import {
  errorMessage,
  getOzConfig,
  getToken,
  launchAndWait,
  resolveServerByName,
} from '../lib/oz_client'

export const run: ActionFunction = async function (params) {
  const settings = new Settings()
  const network = new Network()

  const rawTarget = (params.action_arguments?.url as string) || (params.action_arguments?.domain as string) || ''
  const serverName = (params.action_arguments?.server as string) || ''
  const agentType = ((await settings.get('default_agent_type')) as string) || 'oz-local'

  // Extract bare IP or domain from the utterance if the LLM didn't parse one.
  let url = rawTarget
  if (!url) {
    const ipMatch = (params.utterance || '').match(/\b(\d{1,3}(?:\.\d{1,3}){3})\b/)
    const domainMatch = (params.utterance || '').match(/\bhttps?:\/\/\S+/)
    url = ipMatch ? ipMatch[1] : (domainMatch ? domainMatch[0] : params.utterance || '')
  }

  // Normalise bare IPs/hostnames to a pingable/curl-able form.
  const normalizedUrl = /^https?:\/\//i.test(url) ? url : url

  if (!url) {
    await leon.answer({ key: 'error', data: { message: 'No URL or IP provided.' } })
    return
  }

  try {
    const cfg = await getOzConfig(settings)
    const token = await getToken(cfg, network)

    let server = null
    let serverLabel = 'this machine'
    if (serverName) {
      server = await resolveServerByName(serverName, cfg.apiUrl, token, network)
      if (server) {
        serverLabel = `${server.name} (${server.host})`
      }
    }

    await leon.answer({ key: 'checking', data: { url, server: serverLabel } })

    const target = server
      ? `You have SSH access to ${server.name} (${server.host}). Run all commands on that server via SSH.
Connection: OZ_SSH_* env vars, key at /tmp/oz_ssh_key (already written by entrypoint).`
      : `Run all commands on the local machine.`

    const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(url.trim())
    const prompt = isIp
      ? `Check if the server at IP ${url} is reachable. ${target}

Run these checks:
1. Ping test: \`ping -c 3 -W 2 ${url} 2>&1 || echo "ping failed"\`
2. TCP port 80: \`nc -zv -w3 ${url} 80 2>&1 || echo "port 80 closed"\`
3. TCP port 443: \`nc -zv -w3 ${url} 443 2>&1 || echo "port 443 closed"\`
4. HTTP check: \`curl -o /dev/null -s -w "HTTP %{http_code} in %{time_total}s" --connect-timeout 5 http://${url} 2>&1 || echo "HTTP unreachable"\`

Give a concise verdict: is the server UP or DOWN, which ports are open, and response time. One short paragraph.`
      : `You are a website monitoring tool. ${target}

Check the status of: ${url}

Run these checks:
1. HTTP status: \`curl -o /dev/null -s -w "HTTP %{http_code} - %{time_total}s\\n" --connect-timeout 10 '${url}'\`
2. Response headers: \`curl -sI --connect-timeout 10 '${url}' | head -15\`
3. DNS: \`host '${url}' 2>/dev/null || nslookup '${url}' 2>/dev/null || echo "DNS tools not available"\`

Give a concise verdict: UP or DOWN, HTTP status code, response time, and any redirect. One short paragraph.`

    const { output, status, agentId } = await launchAndWait({
      apiUrl: cfg.apiUrl,
      token,
      network,
      agentType,
      prompt,
      serverId: server?.id ?? null,
      maxRuntime: 120,
      maxPollSeconds: 180,
    })

    await leon.answer({
      key: 'result',
      data: { url, server: serverLabel, logs: output, agent_id: String(agentId), status },
    })
  } catch (error) {
    await leon.answer({ key: 'error', data: { message: errorMessage(error) } })
  }
}
