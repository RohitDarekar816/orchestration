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

  const serverName = (params.action_arguments?.server as string) || params.utterance || ''
  const agentType = ((await settings.get('default_agent_type')) as string) || 'oz-local'

  try {
    const cfg = await getOzConfig(settings)
    const token = await getToken(cfg, network)

    const server = serverName ? await resolveServerByName(serverName, cfg.apiUrl, token, network) : null
    const serverLabel = server ? `${server.name} (${server.host})` : 'this machine'

    await leon.answer({ key: 'checking_health', data: { server: serverLabel } })

    const target = server
      ? `You have SSH access to ${server.name} (${server.host}). Run all commands on that server via SSH.
Connection: OZ_SSH_* env vars, key at /tmp/oz_ssh_key (already written by entrypoint).`
      : `Run all commands on the local machine.`

    const prompt = `You are a Linux systems administrator. ${target}

Check and report the system health in this order:
1. CPU and load: run \`top -bn1 | head -8\` and \`uptime\`
2. Memory: run \`free -h\`
3. Disk: run \`df -h --output=source,fstype,size,used,avail,pcent,target | grep -v tmpfs | grep -v devtmpfs\`
4. Top 5 processes by CPU: run \`ps aux --sort=-%cpu | head -6\`
5. Failed systemd services (if systemd available): run \`systemctl --failed --no-pager 2>/dev/null || echo "systemd not available"\`
6. Docker container status (if Docker available): run \`docker ps --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}" 2>/dev/null || echo "Docker not available"\`

Print each section with a clear header. Flag any obvious problems (disk > 80%, failed services, high load).`

    const { output, status, agentId } = await launchAndWait({
      apiUrl: cfg.apiUrl,
      token,
      network,
      agentType,
      prompt,
      serverId: server?.id ?? null,
      maxRuntime: 300,
      maxPollSeconds: 360,
      onProgress: async (message) => {
        await leon.answer({ key: 'still_working', data: { message } })
      },
    })

    await leon.answer({
      key: 'health_result',
      data: { server: serverLabel, logs: output, agent_id: String(agentId), status },
    })
  } catch (error) {
    await leon.answer({ key: 'error', data: { message: errorMessage(error) } })
  }
}
