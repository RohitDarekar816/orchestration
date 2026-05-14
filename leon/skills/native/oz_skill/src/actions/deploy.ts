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
  const projectPath = (params.action_arguments?.path as string) || (params.action_arguments?.project as string) || ''
  const branch = (params.action_arguments?.branch as string) || 'main'
  const serviceName = (params.action_arguments?.service as string) || ''
  const agentType = ((await settings.get('default_agent_type')) as string) || 'oz-local'

  if (!projectPath) {
    await leon.answer({ key: 'no_path' })
    return
  }

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
    await leon.answer({ key: 'deploying', data: { server: serverLabel, path: projectPath } })

    const target = server
      ? `You have SSH access to ${server.name} (${server.host}).
Run all deployment commands on that server via SSH.
Connection details in OZ_SSH_* env vars, key at /tmp/oz_ssh_key.`
      : `Run all deployment commands on the local machine.`

    const serviceRestart = serviceName
      ? `5. Restart the service named '${serviceName}':
   - Try systemd: \`systemctl restart ${serviceName} && systemctl status ${serviceName} --no-pager\`
   - If not found, try Docker Compose: \`docker compose restart ${serviceName} 2>/dev/null\`
   - If not found, try Docker: \`docker restart ${serviceName} 2>/dev/null\``
      : `5. Detect and restart the appropriate service:
   - If docker-compose.yml or compose.yml exists: \`docker compose up -d --build 2>&1 | tail -20\`
   - Else if a Procfile exists, check its process names
   - Else list running processes related to the project: \`ps aux | grep -v grep | grep -i "${projectPath.split('/').pop()}"\``

    const prompt = `You are a Linux systems administrator performing a deployment. ${target}

Deploy the project at: ${projectPath}
Branch: ${branch}

Execute each step and report the result. Stop immediately and report if a step fails critically.

1. Navigate to project directory:
   \`cd ${projectPath} && pwd\`

2. Pull latest changes:
   \`git fetch origin && git checkout ${branch} && git pull origin ${branch}\`
   Report the git log output: \`git log --oneline -5\`

3. Install dependencies (run whichever applies):
   - Node.js: \`[ -f package.json ] && npm ci --production 2>&1 | tail -5\`
   - Python: \`[ -f requirements.txt ] && pip install -r requirements.txt -q 2>&1 | tail -5\`
   - Python Poetry: \`[ -f pyproject.toml ] && poetry install --no-dev 2>&1 | tail -5\`

4. Run build step (if applicable):
   \`[ -f package.json ] && npm run build 2>&1 | tail -10 || echo "No build step"\`

${serviceRestart}

6. Verify deployment:
   \`sleep 3 && echo "=== Final health check ===" && (systemctl is-active ${serviceName || 'unknown'} 2>/dev/null || docker compose ps 2>/dev/null || echo "Service check done")\`

Print a clear DEPLOYMENT SUMMARY at the end: succeeded or failed, what changed, any warnings.`

    const { output, status, agentId } = await launchAndWait({
      apiUrl: cfg.apiUrl,
      token,
      network,
      agentType,
      prompt,
      serverId: server?.id ?? null,
      maxRuntime: 600,
      maxPollSeconds: 720,
      onProgress: async (message) => {
        await leon.answer({ key: 'still_working', data: { message } })
      },
    })

    await leon.answer({
      key: 'deploy_result',
      data: { server: serverLabel, path: projectPath, logs: output, agent_id: String(agentId), status },
    })
  } catch (error) {
    await leon.answer({ key: 'error', data: { message: errorMessage(error) } })
  }
}
