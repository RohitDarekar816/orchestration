import type { FastifyPluginAsync } from 'fastify'

import type { APIOptions } from '@/core/http-server/http-server'
import { CONFIG_STATE } from '@/core/config-states/config-state'
import { LogHelper } from '@/helpers/log-helper'

interface SwitchBody {
  target: string
}

export const switchModel: FastifyPluginAsync<APIOptions> = async (
  fastify,
  options
) => {
  fastify.route({
    method: 'POST',
    url: `/api/${options.apiVersion}/llm/switch`,
    handler: async (request, reply) => {
      LogHelper.title('POST /llm/switch')

      const { target } = request.body as SwitchBody

      if (!target || typeof target !== 'string') {
        return reply.status(400).send({
          success: false,
          status: 400,
          code: 'missing_target',
          message: 'The "target" field is required and must be a string.'
        })
      }

      const modelState = CONFIG_STATE.getModelState()

      try {
        await modelState.setUnifiedTarget(target)
      } catch (error) {
        LogHelper.error(`Failed to switch model: ${error}`)

        return reply.status(400).send({
          success: false,
          status: 400,
          code: 'invalid_target',
          message: error instanceof Error ? error.message : String(error)
        })
      }

      LogHelper.success(`Model switched to "${target}"`)

      reply.send({
        success: true,
        status: 200,
        code: 'model_switched',
        message: `Model switched to "${target}".`,
        target
      })
    }
  })
}
