import type { ActionFunction } from '@sdk/types'
import { leon } from '@sdk/leon'
import { Network } from '@sdk/network'
import { Settings } from '@sdk/settings'

import {
  errorMessage,
  getOzConfig,
  getToken,
  launchAndWait,
} from '../lib/oz_client'

import { formatProxmoxOutput } from './docker_logs'

export const run: ActionFunction = async function (params) {
  const settings = new Settings()
  const network = new Network()

  const utterance = params.utterance || ''
  const serverHint = (params.action_arguments?.server as string) || ''

  try {
    const cfg = await getOzConfig(settings)
    const token = await getToken(cfg, network)

    // Fetch registered Proxmox endpoints
    const res = await network.request<Array<{ id: number; name: string; api_url: string; default_node: string }>>({
      url: `${cfg.apiUrl}/proxmox-endpoints`,
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    })
    const endpoints = Array.isArray(res.data) ? res.data : []

    if (endpoints.length === 0) {
      await leon.answer({
        key: 'error',
        data: { message: 'No Proxmox endpoints registered. Add one in Settings → Proxmox Endpoints.' },
      })
      return
    }

    // Match endpoint by name hint or fall back to first registered
    const hint = (serverHint || utterance).toLowerCase()
    const ep =
      endpoints.find((e) => hint.includes(e.name.toLowerCase())) ??
      endpoints[0]

    await leon.answer({
      key: 'fetching_proxmox',
      data: { server: ep.name },
    })

    const { output, status, agentId } = await launchAndWait({
      apiUrl: cfg.apiUrl,
      token,
      network,
      agentType: 'cloudflare_proxmox_agent',
      prompt: utterance || `Show overall status of Proxmox cluster on ${ep.name}`,
      maxRuntime: 360,
      maxPollSeconds: 420,
    })

    await leon.answer({
      key: 'proxmox_result',
      data: {
        server: ep.name,
        logs: formatProxmoxOutput(output, ep.name),
        agent_id: String(agentId),
        status,
      },
    })
  } catch (error) {
    await leon.answer({ key: 'error', data: { message: errorMessage(error) } })
  }
}
