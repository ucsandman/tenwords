import { DEFAULT_PROVIDER } from './lib/providers.js'

const KEYS = ['provider', 'model', 'baseUrl', 'apiKey']

// Before 0.4.0 the only stored setting was apiKey, and it always meant
// Anthropic. Stamp that provider in once so existing users keep working.
export async function loadSettings() {
  const stored = await chrome.storage.local.get(KEYS)
  if (stored.apiKey && !stored.provider) {
    stored.provider = DEFAULT_PROVIDER
    await chrome.storage.local.set({ provider: DEFAULT_PROVIDER })
  }
  return {
    provider: stored.provider || DEFAULT_PROVIDER,
    model: stored.model || '',
    baseUrl: stored.baseUrl || '',
    apiKey: stored.apiKey || '',
  }
}

export async function saveSettings({ provider, model, baseUrl, apiKey }) {
  await chrome.storage.local.set({ provider, model, baseUrl, apiKey })
}
