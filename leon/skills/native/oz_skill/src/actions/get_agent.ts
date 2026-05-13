import type { ActionFunction } from '@sdk/types'
import { leon } from '@sdk/leon'
import { Network, NetworkError } from '@sdk/network'
import { Settings } from '@sdk/settings'

interface AgentDetail {
  id: number
  agent_type: string
  status: string
  prompt: string | null
  started_at: string | null
  finished_at: string | null
  created_at: string
  exit_code: number | null
}

export const run: ActionFunction = async function (params) {
  const settings = new Settings()
  const apiUrl = (await settings.get('oz_api_url')) || 'http://localhost:8000/api'
  const authToken = await settings.get('oz_auth_token')
  const email = await settings.get('oz_email')
  const password = await settings.get('oz_password')

  const agentId = params.action_arguments?.id as string | undefined
  if (!agentId) {
    await leon.answer({
      key: 'error',
      data: { message: 'Please specify an agent ID.' },
    })
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
        data: { message: 'Failed to authenticate with Oz.' },
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

  await leon.answer({ key: 'fetching' })

  try {
    const res = await network.request<AgentDetail>({
      url: `${apiUrl}/agents/${agentId}`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    })

    const agent = res.data
    if (!agent || !agent.id) {
      await leon.answer({ key: 'not_found', data: { agent_id: agentId } })
      return
    }

    const logsRes = await network.request<unknown[] | string>({
      url: `${apiUrl}/agents/${agentId}/logs`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    })

    let logsText = 'No logs available.'
    if (Array.isArray(logsRes.data)) {
      const contents = (logsRes.data as Array<Record<string, unknown>>)
        .map((l) => l.content as string)
        .filter(Boolean)
      if (contents.length > 0) {
        logsText = `<pre>${contents.join('\n')}</pre>`
      }
    } else if (typeof logsRes.data === 'string' && logsRes.data) {
      logsText = `<pre>${logsRes.data}</pre>`
    }

    await leon.answer({
      key: 'detail',
      data: {
        agent_id: String(agent.id),
        type: agent.agent_type,
        status: agent.status,
        created: agent.created_at ? new Date(agent.created_at).toLocaleString() : '-',
        logs_block: logsText,
      },
    })
  } catch (error) {
    let message = 'Unknown error'
    if (error instanceof NetworkError) {
      if (error.response.statusCode === 404) {
        await leon.answer({ key: 'not_found', data: { agent_id: agentId } })
        return
      }
      message = String(error.response.data)
    } else if (error instanceof Error) {
      message = error.message
    }
    await leon.answer({ key: 'error', data: { message } })
  }
}
