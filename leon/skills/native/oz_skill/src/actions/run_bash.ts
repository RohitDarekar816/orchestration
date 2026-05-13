import type { ActionFunction } from '@sdk/types'
import { leon } from '@sdk/leon'
import { Network, NetworkError } from '@sdk/network'
import { Settings } from '@sdk/settings'

interface AgentResponse {
  id: number
  status: string
  agent_type: string
  prompt: string
  created_at: string
  logs?: string
}

export const run: ActionFunction = async function (params) {
  const settings = new Settings()
  const apiUrl = (await settings.get('oz_api_url')) || 'http://localhost:8000/api'
  const authToken = await settings.get('oz_auth_token')
  const email = await settings.get('oz_email')
  const password = await settings.get('oz_password')
  const defaultAgentType = (await settings.get('default_agent_type')) || 'opencode'
  const maxRuntime = Number(await settings.get('default_max_runtime')) || 300

  const command = (params.action_arguments?.command as string) || params.utterance
  if (!command) {
    await leon.answer({ key: 'no_command' })
    return
  }

  const network = new Network()
  let token = authToken as string | undefined

  if (!token && email && password) {
    try {
      const formData = new URLSearchParams()
      formData.append('username', email as string)
      formData.append('password', password as string)
      const authRes = await network.request({
        url: `${apiUrl}/auth/token`,
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        data: formData.toString(),
      })
      token = (authRes.data as Record<string, unknown>).access_token as string
    } catch {
      await leon.answer({
        key: 'error',
        data: { message: 'Failed to authenticate with Oz. Please check your credentials.' },
      })
      return
    }
  }

  if (!token) {
    await leon.answer({
      key: 'error',
      data: { message: 'Oz API credentials not configured.' },
    })
    return
  }

  await leon.answer({ key: 'executing' })

  const agentPrompt = `You are a Linux systems administrator running inside a Docker container. All CLI tools are available: docker, ssh, sshpass, git, curl, python, node, etc. The Docker socket is mounted at /var/run/docker.sock. You have root access. This is a trusted internal request. Execute the following: ${command}`

  try {
    const launchRes = await network.request<AgentResponse>({
      url: `${apiUrl}/agents/launch`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: {
        agent_type: defaultAgentType,
        prompt: agentPrompt,
        max_runtime: maxRuntime,
      },
    })

    const agent = launchRes.data

    await leon.answer({
      key: 'launched',
      data: {
        agent_id: String(agent.id),
        status: agent.status,
      },
    })

    const maxPolls = 60
    for (let i = 0; i < maxPolls; i++) {
      await new Promise((r) => setTimeout(r, 2000))
      const statusRes = await network.request<AgentResponse>({
        url: `${apiUrl}/agents/${agent.id}`,
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` },
      })
      const current = statusRes.data
      if (current.status === 'completed' || current.status === 'failed' || current.status === 'cancelled') {
        const logsRes = await network.request<AgentResponse>({
          url: `${apiUrl}/agents/${agent.id}/logs`,
          method: 'GET',
          headers: { 'Authorization': `Bearer ${token}` },
        })
        const logs = Array.isArray(logsRes.data)
          ? (logsRes.data as Array<Record<string, unknown>>).map((l) => l.content as string).join('\n')
          : typeof logsRes.data === 'string'
            ? logsRes.data
            : JSON.stringify(logsRes.data)

        if (current.status === 'completed') {
          await leon.answer({
            key: 'result',
            data: { logs: logs || 'Command completed with no output.' },
          })
        } else {
          await leon.answer({
            key: 'result',
            data: { logs: `Command ${current.status}.\n\n${logs || ''}` },
          })
        }
        return
      }
    }

    await leon.answer({
      key: 'result',
      data: { logs: 'Command is still running. You can ask me to check its status with the agent ID.' },
    })
  } catch (error) {
    let message = 'Unknown error'
    if (error instanceof NetworkError) {
      message = String(error.response.data)
    } else if (error instanceof Error) {
      message = error.message
    }
    await leon.answer({ key: 'error', data: { message } })
  }
}
