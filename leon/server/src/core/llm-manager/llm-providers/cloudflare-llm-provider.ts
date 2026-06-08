import AISDKRemoteLLMProvider from '@/core/llm-manager/llm-providers/ai-sdk-remote-llm-provider'
import type { ResolvedLLMTarget } from '@/core/llm-manager/llm-routing'

const ACCOUNT_ID = process.env['LEON_CLOUDFLARE_ACCOUNT_ID'] || ''

/**
 * @see https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/
 */
export default class CloudflareLLMProvider extends AISDKRemoteLLMProvider {
  constructor(target: ResolvedLLMTarget) {
    super({
      name: 'Cloudflare Workers AI LLM Provider',
      providerName: 'cloudflare',
      apiKeyEnv: 'LEON_CLOUDFLARE_API_TOKEN',
      model: target.model,
      baseURL: `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/v1`,
      flavor: 'openai-compatible'
    })
  }
}
