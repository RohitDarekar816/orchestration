import type { ActionFunction } from '@sdk/types'
import { leon } from '@sdk/leon'
import { Network, NetworkError } from '@sdk/network'
import { Settings } from '@sdk/settings'

import { errorMessage, getOzConfig, getToken } from '../lib/oz_client'

interface AgentSummary {
  id: number
  agent_type: string
  status: string
  started_at: string | null
  finished_at: string | null
  created_at: string
}

export const run: ActionFunction = async function () {
  const settings = new Settings()
  const network = new Network()

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

  await leon.answer({ key: 'listing' })

  try {
    const res = await network.request<AgentSummary[]>({
      url: `${cfg.apiUrl}/agents?limit=10`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    })

    const agents = res.data
    if (!agents || agents.length === 0) {
      await leon.answer({ key: 'empty' })
      return
    }

    const list = agents
      .map(
        (a) =>
          `<tr><td>#${a.id}</td><td>${a.agent_type}</td><td><strong>${a.status}</strong></td><td>${a.created_at ? new Date(a.created_at).toLocaleString() : '-'}</td></tr>`
      )
      .join('')

    await leon.answer({
      key: 'list',
      data: {
        agents: `<table><thead><tr><th>ID</th><th>Type</th><th>Status</th><th>Created</th></tr></thead><tbody>${list}</tbody></table>`,
      },
    })
  } catch (error) {
    await leon.answer({ key: 'error', data: { message: errorMessage(error) } })
  }
}
