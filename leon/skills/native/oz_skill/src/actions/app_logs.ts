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
  const logPath = (params.action_arguments?.path as string) || (params.action_arguments?.log_path as string) || ''
  const appName = (params.action_arguments?.app as string) || (params.action_arguments?.service as string) || ''
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
    await leon.answer({ key: 'fetching_logs', data: { server: serverLabel } })

    const target = server
      ? `You have SSH access to ${server.name} (${server.host}). Run all commands on that server via SSH.
Connection details in OZ_SSH_* env vars, key at /tmp/oz_ssh_key.`
      : `Run all commands on the local machine.`

    const grepClause = grep ? `| grep -i "${grep}"` : ''
    const linesFlag = lines

    const prompt = `You are a Linux systems administrator. ${target}

Retrieve application logs following this priority order:
${logPath
  ? `1. Tail the specified path: \`tail -n ${linesFlag} "${logPath}" ${grepClause} 2>&1\`
   - If it is a directory, list log files: \`ls -lt "${logPath}" | head -10\`
     then tail the most recent one.`
  : appName
  ? `1. Try journald: \`journalctl -u "${appName}" -n ${linesFlag} --no-pager ${grepClause} 2>/dev/null\`
   2. If no journal output, search for log files: \`find /var/log -name "*${appName}*" -type f 2>/dev/null | head -5\`
      then tail the most recent one.`
  : `1. Try journald: \`journalctl -n ${linesFlag} --no-pager ${grepClause} 2>/dev/null\`
   2. Check common locations: /var/log/syslog, /var/log/messages
   3. List log files available: \`ls /var/log/ | head -20\``}

After showing the logs, summarise:
- Total lines retrieved
- Whether any ERROR, CRITICAL, or FATAL entries were found (quote up to 3 examples if so)
- Any obvious recurring issues`

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
      key: 'logs_result',
      data: { server: serverLabel, logs: output, agent_id: String(agentId), status },
    })
  } catch (error) {
    await leon.answer({ key: 'error', data: { message: errorMessage(error) } })
  }
}
