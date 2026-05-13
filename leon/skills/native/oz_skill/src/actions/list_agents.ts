import type { ActionFunction } from '@sdk/types'
import { leon } from '@sdk/leon'
import { Network, NetworkError } from '@sdk/network'
import { Settings } from '@sdk/settings'

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
  const apiUrl = (await settings.get('oz_api_url')) || 'http://localhost:8000/api'
  const authToken = await settings.get('oz_auth_token')
  const email = await settings.get('oz_email')
  const password = await settings.get('oz_password')

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
    await leon.answer({ key: 'listing' })
    await leon.answer({
      key: 'error',
      data: { message: 'Oz API credentials not configured.' },
    })
    return
  }

  await leon.answer({ key: 'listing' })

  try {
    const res = await network.request<AgentSummary[]>({
      url: `${apiUrl}/agents?limit=10`,
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
    let message = 'Unknown error'
    if (error instanceof NetworkError) {
      message = String(error.response.data)
    } else if (error instanceof Error) {
      message = error.message
    }
    await leon.answer({ key: 'error', data: { message } })
  }
}
