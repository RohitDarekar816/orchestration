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

  const prompt = (params.action_arguments?.prompt as string) || params.utterance
  if (!prompt) {
    await leon.answer({ key: 'no_prompt' })
    return
  }

  const serverName = (params.action_arguments?.server as string) || ''
  const agentType = ((await settings.get('default_agent_type')) as string) || 'oz-local'
  const maxRuntime = Number((await settings.get('default_max_runtime')) as string) || 300

  try {
    const cfg = await getOzConfig(settings)
    const token = await getToken(cfg, network)

    const server = serverName ? await resolveServerByName(serverName, cfg.apiUrl, token, network) : null
    if (serverName && !server) {
      await leon.answer({
        key: 'error',
        data: { message: `Server '${serverName}' not found in Oz. Register it at /api/servers first.` },
      })
      return
    }

    await leon.answer({ key: 'launching' })

    const { output, status, agentId } = await launchAndWait({
      apiUrl: cfg.apiUrl,
      token,
      network,
      agentType,
      prompt,
      serverId: server?.id ?? null,
      maxRuntime,
      maxPollSeconds: maxRuntime + 60,
      onProgress: async (message) => {
        await leon.answer({ key: 'still_working', data: { message } })
      },
    })

    await leon.answer({
      key: 'launched',
      data: { agent_id: String(agentId), status },
    })

    await leon.answer({
      key: 'result',
      data: { logs: output },
    })
  } catch (error) {
    await leon.answer({ key: 'error', data: { message: errorMessage(error) } })
  }
}
