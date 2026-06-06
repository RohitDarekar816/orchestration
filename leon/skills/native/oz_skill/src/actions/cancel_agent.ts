import type { ActionFunction } from '@sdk/types'
import { leon } from '@sdk/leon'
import { Network, NetworkError } from '@sdk/network'
import { Settings } from '@sdk/settings'

import { errorMessage, getOzConfig, getToken } from '../lib/oz_client'

export const run: ActionFunction = async function (params) {
  const settings = new Settings()
  const network = new Network()

  const agentId = params.action_arguments?.id as string | undefined
  if (!agentId) {
    await leon.answer({
      key: 'error',
      data: { message: 'Please specify an agent ID to cancel.' },
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

  await leon.answer({ key: 'cancelling' })

  try {
    const res = await network.request<Record<string, unknown>>({
      url: `${cfg.apiUrl}/agents/${agentId}/cancel`,
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
    })

    await leon.answer({
      key: 'cancelled',
      data: { agent_id: agentId },
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
