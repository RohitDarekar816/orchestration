import type { ActionFunction } from '@sdk/types'
import { leon } from '@sdk/leon'
import { Network, NetworkError } from '@sdk/network'
import { Settings } from '@sdk/settings'

import { errorMessage, getOzConfig, getToken } from '../lib/oz_client'

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
  const network = new Network()

  const agentId = params.action_arguments?.id as string | undefined
  if (!agentId) {
    await leon.answer({
      key: 'error',
      data: { message: 'Please specify an agent ID.' },
    })
    return
  }

  let cfg: { apiUrl: string }
  let token: string
  try {
    cfg = await getOzConfig(settings)
    token = await getToken(cfg, network)
  } catch {
    await leon.answer({
      key: 'error',
      data: { message: 'Failed to authenticate with Oz.' },
    })
    return
  }

  await leon.answer({ key: 'fetching' })

  try {
    const res = await network.request<AgentDetail>({
      url: `${cfg.apiUrl}/agents/${agentId}`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    })

    const agent = res.data
    if (!agent || !agent.id) {
      await leon.answer({ key: 'not_found', data: { agent_id: agentId } })
      return
    }

    const logsRes = await network.request<unknown[] | string>({
      url: `${cfg.apiUrl}/agents/${agentId}/logs`,
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
    if (error instanceof NetworkError) {
      const code: number = (error as NetworkError & { response?: { statusCode?: number } }).response?.statusCode ?? 0
      if (code === 404) {
        await leon.answer({ key: 'not_found', data: { agent_id: agentId } })
        return
      }
    }
    await leon.answer({ key: 'error', data: { message: errorMessage(error) } })
  }
}
