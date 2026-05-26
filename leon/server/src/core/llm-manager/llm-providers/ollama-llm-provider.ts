import AISDKRemoteLLMProvider from '@/core/llm-manager/llm-providers/ai-sdk-remote-llm-provider'
import type { ResolvedLLMTarget } from '@/core/llm-manager/llm-routing'

export default class OllamaLLMProvider extends AISDKRemoteLLMProvider {
  constructor(target: ResolvedLLMTarget) {
    super({
      name: 'Ollama LLM Provider',
      providerName: 'ollama',
      apiKeyEnv: 'LEON_OLLAMA_API_KEY',
      model: target.model,
      baseURL: process.env['LEON_OLLAMA_BASE_URL'] || 'http://localhost:11434/v1',
      flavor: 'openai-compatible',
      requiresApiKey: false
    })
  }
}
