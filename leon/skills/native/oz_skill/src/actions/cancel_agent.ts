import type { ActionFunction } from '@sdk/types'
import { leon } from '@sdk/leon'
import { Network, NetworkError } from '@sdk/network'
import { Settings } from '@sdk/settings'

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
      data: { message: 'Please specify an agent ID to cancel.' },
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

  await leon.answer({ key: 'cancelling' })

  try {
    const res = await network.request<Record<string, unknown>>({
      url: `${apiUrl}/agents/${agentId}/cancel`,
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
    })

    await leon.answer({
      key: 'cancelled',
      data: { agent_id: agentId },
    })
  } catch (error) {
    let message = 'Unknown error'
    let statusCode = 0
    if (error instanceof NetworkError) {
      statusCode = error.response.statusCode
      if (statusCode === 404) {
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
