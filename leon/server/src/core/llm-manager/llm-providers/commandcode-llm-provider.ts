import AISDKRemoteLLMProvider from '@/core/llm-manager/llm-providers/ai-sdk-remote-llm-provider'
import type { ResolvedLLMTarget } from '@/core/llm-manager/llm-routing'

export default class CommandCodeLLMProvider extends AISDKRemoteLLMProvider {
  constructor(target: ResolvedLLMTarget) {
    super({
      name: 'Command Code LLM Provider',
      providerName: 'commandcode',
      apiKeyEnv: 'LEON_COMMANDCODE_API_KEY',
      model: target.model,
      baseURL: 'https://api.commandcode.ai/v1',
      flavor: 'openai-compatible'
    })
  }
}
