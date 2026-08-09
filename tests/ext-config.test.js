import test from 'node:test'
import assert from 'node:assert/strict'

// extension/config.js talks to chrome.storage.local; stub it before importing.
const store = {}
globalThis.chrome = {
  storage: {
    local: {
      get: async keys => Object.fromEntries(
        keys.filter(k => store[k] !== undefined).map(k => [k, store[k]]),
      ),
      set: async values => Object.assign(store, values),
    },
  },
}

const { loadSettings, saveSettings } = await import('../extension/config.js')

test('a fresh profile defaults to anthropic with no key', async () => {
  for (const k of Object.keys(store)) delete store[k]
  const settings = await loadSettings()
  assert.deepEqual(settings, { provider: 'anthropic', model: '', baseUrl: '', apiKey: '' })
  assert.equal(store.provider, undefined)
})

test('a pre-0.4.0 profile with only a key migrates to provider anthropic', async () => {
  for (const k of Object.keys(store)) delete store[k]
  store.apiKey = 'sk-ant-old'
  const settings = await loadSettings()
  assert.equal(settings.provider, 'anthropic')
  assert.equal(settings.apiKey, 'sk-ant-old')
  assert.equal(store.provider, 'anthropic', 'migration is written back once')
})

test('a stored provider is left alone', async () => {
  for (const k of Object.keys(store)) delete store[k]
  Object.assign(store, { provider: 'deepseek', model: 'deepseek-chat', apiKey: 'sk-d' })
  const settings = await loadSettings()
  assert.equal(settings.provider, 'deepseek')
  assert.equal(settings.model, 'deepseek-chat')
})

test('saveSettings round-trips every field', async () => {
  for (const k of Object.keys(store)) delete store[k]
  await saveSettings({ provider: 'custom', model: 'llama3', baseUrl: 'http://localhost:11434/v1', apiKey: 'x' })
  assert.deepEqual(await loadSettings(), {
    provider: 'custom',
    model: 'llama3',
    baseUrl: 'http://localhost:11434/v1',
    apiKey: 'x',
  })
})
