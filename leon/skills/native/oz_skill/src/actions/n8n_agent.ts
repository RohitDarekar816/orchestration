import type { ActionFunction } from '@sdk/types'
import { leon } from '@sdk/leon'
import { Network } from '@sdk/network'
import { Settings } from '@sdk/settings'
import { createHash } from 'node:crypto'

import { errorMessage, getOzConfig, getToken } from '../lib/oz_client'

export const run: ActionFunction = async function (params) {
  const settings = new Settings()
  const network = new Network()

  const agentName = (params.action_arguments?.agent_name as string) || ''
  const task = (params.action_arguments?.task as string) || params.utterance
  const confirmed = params.action_arguments?.confirmed === true

  const utterances = params.context?.utterances || []
  const allUtterances = [...utterances, params.utterance]
  const firstUtterance = allUtterances.length > 0 ? allUtterances[0] : params.utterance
  const meaningful = allUtterances.filter(
    (u) => !/^(yes|no|ok|cancel|stop|sure|yep|nope|nah|yeah|y)$/i.test(u.trim())
  )
  const lastQuestion = meaningful.length > 0 ? meaningful[meaningful.length - 1] : params.utterance
  const sessionId = createHash('sha256').update(firstUtterance).digest('hex').slice(0, 16)
  const userQuestion = lastQuestion

  try {
    const cfg = await getOzConfig(settings)
    const token = await getToken(cfg, network)

    const res = await network.request<Array<{ id: number; name: string; description: string; webhook_url: string; keywords: string }>>({
      url: `${cfg.apiUrl}/n8n-agents`,
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    })
    const agents = Array.isArray(res.data) ? res.data : []

    if (agents.length === 0) {
      await leon.answer({
        key: 'n8n_no_agents',
      })
      return
    }

    const matched = agentName
      ? agents.find((a) => a.name.toLowerCase() === agentName.toLowerCase())
      : agents[0]

    if (!matched) {
      const names = agents.map((a) => a.name).join(', ')
      await leon.answer({
        key: 'n8n_ask_which',
        data: { names },
      })
      return
    }

    if (!confirmed) {
      await leon.answer({
        key: 'n8n_ask_confirm',
        data: { agent_name: matched.name, description: matched.description },
      })
      return
    }

    await leon.answer({
      key: 'n8n_working',
      data: { agent_name: matched.name },
    })

    const callRes = await network.request<{ status: number; body: string }>({
      url: `${cfg.apiUrl}/n8n-agents/call`,
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: {
        agent_id: matched.id,
        session_id: sessionId,
        user_question: userQuestion,
        payload: { task, agent_name: matched.name },
      },
    })

    await leon.answer({
      key: 'n8n_result',
      data: { agent_name: matched.name, result: callRes.data.body || '(no response from n8n)' },
    })
  } catch (error) {
    await leon.answer({ key: 'error', data: { message: errorMessage(error) } })
  }
}
