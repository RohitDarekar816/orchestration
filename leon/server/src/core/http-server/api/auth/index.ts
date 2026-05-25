import axios from 'axios'
import type { FastifyPluginAsync } from 'fastify'

import type { APIOptions } from '@/core/http-server/http-server'
import { OZ_API_URL } from '@/constants'
import { LogHelper } from '@/helpers/log-helper'

export const authPlugin: FastifyPluginAsync<APIOptions> = async (
  fastify,
  options
) => {
  fastify.route({
    method: 'POST',
    url: `/api/${options.apiVersion}/auth/login`,
    handler: async (_request, reply) => {
      if (!OZ_API_URL) {
        reply.statusCode = 503
        return reply.send({ success: false, message: 'Oz API not configured' })
      }
      try {
        const body = _request.body as Record<string, string>
        const email = body['email'] || ''
        const password = body['password'] || ''
        const formData = new URLSearchParams()
        formData.append('username', email)
        formData.append('password', password)
        const res = await axios.post(`${OZ_API_URL}/auth/token`, formData, {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        })
        return reply.send(res.data)
      } catch (e: unknown) {
        const status = axios.isAxiosError(e) ? e.response?.status || 401 : 500
        const detail = axios.isAxiosError(e)
          ? e.response?.data?.detail || 'Login failed'
          : 'Login failed'
        reply.statusCode = status
        LogHelper.error(`Auth login proxy error: ${detail}`)
        return reply.send({ success: false, message: detail })
      }
    }
  })

  fastify.route({
    method: 'POST',
    url: `/api/${options.apiVersion}/auth/register`,
    handler: async (_request, reply) => {
      if (!OZ_API_URL) {
        reply.statusCode = 503
        return reply.send({ success: false, message: 'Oz API not configured' })
      }
      try {
        const body = _request.body as Record<string, string>
        const res = await axios.post(`${OZ_API_URL}/auth/register`, body, {
          headers: { 'Content-Type': 'application/json' }
        })
        return reply.send(res.data)
      } catch (e: unknown) {
        const status = axios.isAxiosError(e) ? e.response?.status || 400 : 500
        const detail = axios.isAxiosError(e)
          ? e.response?.data?.detail || 'Registration failed'
          : 'Registration failed'
        reply.statusCode = status
        LogHelper.error(`Auth register proxy error: ${detail}`)
        return reply.send({ success: false, message: detail })
      }
    }
  })

  fastify.route({
    method: 'GET',
    url: `/api/${options.apiVersion}/auth/me`,
    handler: async (_request, reply) => {
      if (!OZ_API_URL) {
        reply.statusCode = 503
        return reply.send({ success: false, message: 'Oz API not configured' })
      }
      try {
        const authHeader = _request.headers['authorization']
        if (!authHeader) {
          reply.statusCode = 401
          return reply.send({ success: false, message: 'Missing token' })
        }
        const res = await axios.get(`${OZ_API_URL}/auth/me`, {
          headers: { Authorization: authHeader }
        })
        return reply.send(res.data)
      } catch (e: unknown) {
        const status = axios.isAxiosError(e) ? e.response?.status || 401 : 500
        const detail = axios.isAxiosError(e)
          ? e.response?.data?.detail || 'Invalid token'
          : 'Invalid token'
        reply.statusCode = status
        return reply.send({ success: false, message: detail })
      }
    }
  })
}
