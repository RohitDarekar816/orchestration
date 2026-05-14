import type { ActionFunction } from '@sdk/types'
import { leon } from '@sdk/leon'

export const run: ActionFunction = async function () {
  await leon.answer({ key: 'greeting' })
}
