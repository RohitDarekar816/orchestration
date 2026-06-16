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

import { formatDockerOutput } from './docker_logs'

export const run: ActionFunction = async function (params) {
  const settings = new Settings()
  const network = new Network()

  const nluServerHint = (params.action_arguments?.server as string) || ''

  try {
    const cfg = await getOzConfig(settings)
    const token = await getToken(cfg, network)
    const utterance = params.utterance || ''

    const target = await resolveDockerTarget(utterance, nluServerHint, cfg.apiUrl, token, network)

    // ── Docker API endpoint → Cloudflare Server Health Agent ─────────────────
    if (target.kind === 'endpoint') {
      const ep = target.endpoint
      await leon.answer({
        key: 'checking_health',
        data: { server: ep.name },
      })

      const { output, status, agentId } = await launchAndWait({
        apiUrl: cfg.apiUrl,
        token,
        network,
        agentType: 'cloudflare_server_health_agent',
        prompt: utterance || `Check full system health on ${ep.name}`,
        maxRuntime: 180,
        maxPollSeconds: 240,
      })

      await leon.answer({
        key: 'health_result',
        data: {
          server: ep.name,
          logs: formatDockerOutput(output, ep.name, 'health'),
          agent_id: String(agentId),
          status,
        },
      })
      return
    }

    // ── SSH server or local machine → oz-local agent ──────────────────────────
    const server = target.kind === 'ssh_server' ? target.server : null
    const serverLabel = server ? `${server.name} (${server.host})` : 'this machine'

    await leon.answer({ key: 'checking_health', data: { server: serverLabel } })

    const location = server
      ? `You have SSH access to ${server.name} (${server.host}). Run all commands on that server via SSH.
Connection: OZ_SSH_* env vars, key at /tmp/oz_ssh_key (already written by entrypoint).`
      : `Run all commands on the local machine.`

    const prompt = `You are a Linux systems administrator. ${location}

Check and report the system health in this order:
1. CPU and load: run \`top -bn1 | head -8\` and \`uptime\`
2. Memory: run \`free -h\`
3. Disk: run \`df -h --output=source,fstype,size,used,avail,pcent,target | grep -v tmpfs | grep -v devtmpfs\`
4. Top 5 processes by CPU: run \`ps aux --sort=-%cpu | head -6\`
5. Failed systemd services (if systemd available): run \`systemctl --failed --no-pager 2>/dev/null || echo "systemd not available"\`

Print each section with a clear header. Flag any obvious problems (disk > 80%, failed services, high load).`

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
      key: 'health_result',
      data: {
        server: serverLabel,
        logs: formatDockerOutput(output, serverLabel, 'health'),
        agent_id: String(agentId),
        status,
      },
    })
  } catch (error) {
    await leon.answer({ key: 'error', data: { message: errorMessage(error) } })
  }
}
