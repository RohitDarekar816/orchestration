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

  const serverName = (params.action_arguments?.server as string) || ''
  const container = (params.action_arguments?.container as string) || (params.action_arguments?.name as string) || ''
  const lines = Number(params.action_arguments?.lines) || 100
  const grep = (params.action_arguments?.grep as string) || (params.action_arguments?.filter as string) || ''
  const agentType = ((await settings.get('default_agent_type')) as string) || 'oz-local'

  try {
    const cfg = await getOzConfig(settings)
    const token = await getToken(cfg, network)

    const server = serverName ? await resolveServerByName(serverName, cfg.apiUrl, token, network) : null
    if (serverName && !server) {
      await leon.answer({
        key: 'error',
        data: { message: `Server '${serverName}' not found. Register it at /api/servers first.` },
      })
      return
    }

    const serverLabel = server ? `${server.name} (${server.host})` : 'this machine'
    await leon.answer({ key: 'fetching_docker_logs', data: { server: serverLabel, container: container || 'all' } })

    const target = server
      ? `You have SSH access to ${server.name} (${server.host}) and Docker access via the socket.
Run Docker commands on that server via SSH.
Connection details in OZ_SSH_* env vars, key at /tmp/oz_ssh_key.`
      : `You have direct Docker access via /var/run/docker.sock on this machine.`

    const grepClause = grep ? `| grep -i "${grep}"` : ''

    const prompt = container
      ? `You are a Linux systems administrator. ${target}

1. Check container status:
   \`docker inspect ${container} --format "Name: {{.Name}} | Status: {{.State.Status}} | Started: {{.State.StartedAt}} | Error: {{.State.Error}}" 2>&1\`

2. Get the last ${lines} log lines:
   \`docker logs --tail ${lines} --timestamps ${container} 2>&1 ${grepClause}\`

3. If the container is not running or restarting, check why:
   \`docker inspect ${container} --format "ExitCode: {{.State.ExitCode}} | OOMKilled: {{.State.OOMKilled}}" 2>&1\`

Summarise: is the container healthy? Any errors or crash-loops visible?`
      : `You are a Linux systems administrator. ${target}

1. List all containers and their status:
   \`docker ps -a --format "table {{.Names}}\\t{{.Image}}\\t{{.Status}}\\t{{.Ports}}" 2>&1\`

2. Show last ${lines} lines from any containers that are stopped or restarting:
   For each unhealthy container, run: \`docker logs --tail 20 <container_name> 2>&1\`

Summarise overall Docker health: running vs stopped containers, any crash-loops.`

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
      key: 'docker_logs_result',
      data: { server: serverLabel, container: container || 'all', logs: output, agent_id: String(agentId), status },
    })
  } catch (error) {
    await leon.answer({ key: 'error', data: { message: errorMessage(error) } })
  }
}
