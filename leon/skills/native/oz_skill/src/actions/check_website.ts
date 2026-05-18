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

  const url = (params.action_arguments?.url as string) || (params.action_arguments?.domain as string) || params.utterance || ''
  const serverName = (params.action_arguments?.server as string) || ''
  const agentType = ((await settings.get('default_agent_type')) as string) || 'oz-local'

  if (!url) {
    await leon.answer({ key: 'error', data: { message: 'No URL provided.' } })
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

    const prompt = `You are a website monitoring tool. ${target}

Check the website status for the following URL: ${url}

Run these checks in order:
1. HTTP status: \`curl -o /dev/null -s -w "HTTP %{http_code} - %{time_total}s\\n" '${url}'\`
2. Response headers: \`curl -sI --connect-timeout 10 '${url}' | head -20\`
3. DNS resolution: \`host '${url}' 2>/dev/null || nslookup '${url}' 2>/dev/null || echo "DNS tools not available"\`

Report:
- Whether the site is UP or DOWN
- HTTP status code
- Response time
- Any redirect chain
- DNS resolution info

If the curl command fails entirely, report the site as DOWN with the error message.`

    const { output, status, agentId } = await launchAndWait({
      apiUrl: cfg.apiUrl,
      token,
      network,
      agentType,
      prompt,
      serverId: server?.id ?? null,
      maxRuntime: 120,
      maxPollSeconds: 180,
      onProgress: async (message) => {
        await leon.answer({ key: 'still_working', data: { message } })
      },
    })

    await leon.answer({
      key: 'result',
      data: { url, server: serverLabel, logs: output, agent_id: String(agentId), status },
    })
  } catch (error) {
    await leon.answer({ key: 'error', data: { message: errorMessage(error) } })
  }
}
