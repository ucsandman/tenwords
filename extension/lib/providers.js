// Provider registry and transport. Two dialects cover every preset:
// "anthropic" (POST {baseUrl}/messages, x-api-key) and "openai"
// (POST {baseUrl}/chat/completions, Bearer). summarizer.js shapes the request
// body and reads the response per dialect, so the exactly-ten-words
// enforcement wraps every provider identically.

export const PROVIDERS = {
  anthropic: {
    label: 'Anthropic',
    dialect: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-haiku-4-5-20251001',
    tokenParam: 'max_tokens',
    keyVar: 'ANTHROPIC_API_KEY',
  },
  openai: {
    label: 'OpenAI',
    dialect: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-5-mini',
    tokenParam: 'max_completion_tokens',
    keyVar: 'OPENAI_API_KEY',
  },
  deepseek: {
    label: 'DeepSeek',
    dialect: 'openai',
    baseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-chat',
    tokenParam: 'max_tokens',
    keyVar: 'DEEPSEEK_API_KEY',
  },
  kimi: {
    label: 'Kimi',
    dialect: 'openai',
    baseUrl: 'https://api.moonshot.ai/v1',
    defaultModel: 'kimi-k2-0905-preview',
    tokenParam: 'max_tokens',
    keyVar: 'MOONSHOT_API_KEY',
  },
  custom: {
    label: 'Custom',
    dialect: 'openai',
    baseUrl: '',
    defaultModel: '',
    tokenParam: 'max_tokens',
    keyVar: 'PROVIDER_API_KEY',
  },
}

export const DEFAULT_PROVIDER = 'anthropic'
export const PROVIDER_IDS = Object.keys(PROVIDERS)

// Turns loose settings (env vars or extension storage) into one config object.
// Throws with the exact field to fix rather than guessing a fallback.
export function resolveProvider({ provider, model, baseUrl, apiKey } = {}) {
  const id = (provider || DEFAULT_PROVIDER).trim().toLowerCase()
  const preset = PROVIDERS[id]
  if (!preset) {
    throw new Error(`unknown provider "${id}" — use one of: ${PROVIDER_IDS.join(', ')}`)
  }
  const url = (id === 'custom' ? (baseUrl || '') : preset.baseUrl).trim().replace(/\/+$/, '')
  if (!url) {
    throw new Error('provider "custom" needs a base URL (BASE_URL in .env, or the Base URL field in options)')
  }
  const name = (model || preset.defaultModel).trim()
  if (!name) {
    throw new Error('provider "custom" needs a model name (MODEL in .env, or the Model field in options)')
  }
  return {
    provider: id,
    label: preset.label,
    dialect: preset.dialect,
    keyVar: preset.keyVar,
    tokenParam: preset.tokenParam,
    baseUrl: url,
    model: name,
    apiKey: apiKey || '',
  }
}

export function authHeaders(config) {
  if (config.dialect === 'anthropic') {
    return {
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    }
  }
  return { authorization: `Bearer ${config.apiKey}` }
}

function endpoint(config) {
  return config.dialect === 'anthropic'
    ? `${config.baseUrl}/messages`
    : `${config.baseUrl}/chat/completions`
}

// The transport summarizer.js expects: messages.create(body) posts body to the
// provider and returns the parsed JSON response. keyHelp is appended to auth
// errors so each surface can say where to fix the key.
export function createClient(config, { fetch: fetchImpl, keyHelp = '' } = {}) {
  const send = fetchImpl || ((...args) => globalThis.fetch(...args))
  return {
    dialect: config.dialect,
    model: config.model,
    tokenParam: config.tokenParam,
    messages: {
      create: async body => {
        const res = await send(endpoint(config), {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...authHeaders(config) },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          if (res.status === 401 || res.status === 403) {
            throw new Error(`invalid ${config.label} API key${keyHelp}`)
          }
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error?.message || `${config.label} API error ${res.status}`)
        }
        return res.json()
      },
    },
  }
}
