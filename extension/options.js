import { DEFAULT_PROVIDER, PROVIDERS, PROVIDER_IDS, authHeaders, resolveProvider } from './lib/providers.js'
import { loadSettings, saveSettings } from './config.js'

const $ = id => document.getElementById(id)

let saved = { provider: DEFAULT_PROVIDER, model: '', baseUrl: '', apiKey: '' }

function setStatus(msg, isError = false) {
  $('status').textContent = msg
  $('status').className = isError ? 'error' : ''
}

function showProvider(id, { model = '', baseUrl = '' } = {}) {
  $('model').value = model || PROVIDERS[id].defaultModel
  $('baseUrl').value = baseUrl
  $('base-row').hidden = id !== 'custom'
  $('endpoint-hint').textContent = id === 'custom'
    ? 'Any OpenAI-compatible endpoint: Ollama, vLLM, OpenRouter, and the rest.'
    : `Calls ${PROVIDERS[id].baseUrl}`
}

function formConfig() {
  return resolveProvider({
    provider: $('provider').value,
    model: $('model').value.trim(),
    baseUrl: $('baseUrl').value.trim(),
    apiKey: $('key').value.trim() || saved.apiKey,
  })
}

// Custom endpoints are not in the manifest, so ask for that one origin.
// Called before any other await so the click still counts as a user gesture.
async function grantCustomOrigin(baseUrl) {
  let origin
  try {
    origin = new URL(baseUrl).origin
  } catch {
    setStatus('Base URL must be a full URL, like http://localhost:11434/v1', true)
    return false
  }
  if (await chrome.permissions.request({ origins: [`${origin}/*`] })) return true
  setStatus('Chrome did not grant access to that base URL, so nothing was saved.', true)
  return false
}

$('provider').addEventListener('change', () => showProvider($('provider').value))

$('save').addEventListener('click', async () => {
  let config
  try {
    config = formConfig()
  } catch (err) {
    return setStatus(err.message, true)
  }
  if (!config.apiKey) return setStatus('Paste a key first, or use Remove key.', true)
  if (config.provider === 'custom' && !(await grantCustomOrigin(config.baseUrl))) return
  saved = {
    provider: config.provider,
    model: config.model,
    // Only the custom preset has a base URL worth keeping.
    baseUrl: config.provider === 'custom' ? config.baseUrl : '',
    apiKey: config.apiKey,
  }
  await saveSettings(saved)
  $('key').value = ''
  setStatus(`Saved (key …${config.apiKey.slice(-4)}) — calling ${config.label} directly.`)
})

$('remove').addEventListener('click', async () => {
  await chrome.storage.local.remove('apiKey')
  saved = { ...saved, apiKey: '' }
  $('key').value = ''
  setStatus('Key removed — using the local service.')
})

$('verify').addEventListener('click', async () => {
  let config
  try {
    config = formConfig()
  } catch (err) {
    return setStatus(err.message, true)
  }
  if (!config.apiKey) return setStatus('No key to verify.', true)
  if (config.provider === 'custom' && !(await grantCustomOrigin(config.baseUrl))) return
  setStatus('Checking…')
  try {
    const res = await fetch(`${config.baseUrl}/models`, { headers: authHeaders(config) })
    if (res.ok) setStatus('Key works.')
    else if (res.status === 401 || res.status === 403) setStatus('Invalid key.', true)
    else setStatus(`${config.label} answered with status ${res.status}.`, true)
  } catch {
    setStatus(`Could not reach ${config.baseUrl}.`, true)
  }
})

async function init() {
  for (const id of PROVIDER_IDS) {
    const option = document.createElement('option')
    option.value = id
    option.textContent = PROVIDERS[id].label
    $('provider').append(option)
  }
  saved = await loadSettings()
  $('provider').value = saved.provider
  showProvider(saved.provider, saved)
  setStatus(saved.apiKey
    ? `Key saved (…${saved.apiKey.slice(-4)}) — calling ${PROVIDERS[saved.provider].label} directly.`
    : 'No key saved yet; condensing uses the local service.')
}

init()
