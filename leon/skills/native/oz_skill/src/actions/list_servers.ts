import type { ActionFunction } from '@sdk/types'
import { leon } from '@sdk/leon'
import { Network } from '@sdk/network'
import { Settings } from '@sdk/settings'

import { errorMessage, getOzConfig, getToken } from '../lib/oz_client'
import type { ServerSummary } from '../lib/oz_client'

export const run: ActionFunction = async function () {
  const settings = new Settings()
  const network = new Network()

  try {
    const cfg = await getOzConfig(settings)
    const token = await getToken(cfg, network)

    const res = await network.request<ServerSummary[]>({
      url: `${cfg.apiUrl}/servers`,
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    })

    const servers = Array.isArray(res.data) ? res.data : []

    if (servers.length === 0) {
      await leon.answer({ key: 'no_servers' })
      return
    }

    const rows = servers
      .map(
        (s) =>
          `<tr>
            <td><strong>${s.name}</strong></td>
            <td>${s.host}:${s.port}</td>
            <td>${s.username}</td>
            <td>${s.auth_type}</td>
            <td>${s.tags?.join(', ') || '-'}</td>
          </tr>`
      )
      .join('')

    const table = `<table>
      <thead><tr><th>Name</th><th>Host</th><th>User</th><th>Auth</th><th>Tags</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`

    await leon.answer({ key: 'servers_list', data: { servers: table, count: String(servers.length) } })
  } catch (error) {
    await leon.answer({ key: 'error', data: { message: errorMessage(error) } })
  }
}
