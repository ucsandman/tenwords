import test from 'node:test'
import assert from 'node:assert/strict'
import { PROVIDERS, PROVIDER_IDS, authHeaders, createClient, resolveProvider } from '../service/providers.js'
import { MODEL, summarizeBlocks } from '../service/summarizer.js'
import { countWords } from '../service/words.js'

const TEN = 'one two three four five six seven eight nine ten'
const TWELVE = TEN + ' eleven twelve'
const LONG_TEXT = 'orig1 orig2 orig3 orig4 orig5 orig6 orig7 orig8 orig9 orig10 orig11 orig12 orig13 orig14 orig15 orig16'
const BLOCKS = [
  { id: 'p0', text: LONG_TEXT },
  { id: 'p1', text: LONG_TEXT },
]

test('registry covers the five presets with two dialects', () => {
  assert.deepEqual(PROVIDER_IDS, ['anthropic', 'openai', 'deepseek', 'kimi', 'custom'])
  for (const id of PROVIDER_IDS) {
    const p = PROVIDERS[id]
    assert.ok(['anthropic', 'openai'].includes(p.dialect), `${id} dialect`)
    assert.ok(p.keyVar && p.label && p.tokenParam, `${id} fields`)
  }
  assert.equal(PROVIDERS.anthropic.defaultModel, MODEL)
  assert.equal(PROVIDERS.openai.baseUrl, 'https://api.openai.com/v1')
  assert.equal(PROVIDERS.deepseek.baseUrl, 'https://api.deepseek.com')
  assert.equal(PROVIDERS.kimi.baseUrl, 'https://api.moonshot.ai/v1')
  assert.equal(PROVIDERS.custom.dialect, 'openai')
})

test('resolveProvider defaults to anthropic with its model and key var', () => {
  const config = resolveProvider()
  assert.equal(config.provider, 'anthropic')
  assert.equal(config.dialect, 'anthropic')
  assert.equal(config.model, MODEL)
  assert.equal(config.keyVar, 'ANTHROPIC_API_KEY')
  assert.equal(config.tokenParam, 'max_tokens')
})

test('resolveProvider fills preset defaults and honours a model override', () => {
  assert.equal(resolveProvider({ provider: 'deepseek' }).model, 'deepseek-chat')
  assert.equal(resolveProvider({ provider: 'kimi' }).keyVar, 'MOONSHOT_API_KEY')
  assert.equal(resolveProvider({ provider: 'openai' }).tokenParam, 'max_completion_tokens')
  assert.equal(resolveProvider({ provider: 'openai', model: 'gpt-5' }).model, 'gpt-5')
})

test('resolveProvider rejects an unknown provider by name', () => {
  assert.throws(() => resolveProvider({ provider: 'llamaz' }), /unknown provider "llamaz"/)
})

test('custom needs a base URL and a model, and the URL loses trailing slashes', () => {
  assert.throws(() => resolveProvider({ provider: 'custom', model: 'm' }), /base URL/)
  assert.throws(() => resolveProvider({ provider: 'custom', baseUrl: 'http://x/v1' }), /model name/)
  const config = resolveProvider({ provider: 'custom', baseUrl: 'http://localhost:11434/v1/', model: 'llama3' })
  assert.equal(config.baseUrl, 'http://localhost:11434/v1')
  assert.equal(config.dialect, 'openai')
})

test('a base URL is ignored for presets that are not custom', () => {
  const config = resolveProvider({ provider: 'openai', baseUrl: 'http://evil.test' })
  assert.equal(config.baseUrl, 'https://api.openai.com/v1')
})

test('auth headers follow the dialect', () => {
  const anthropic = authHeaders(resolveProvider({ apiKey: 'k1' }))
  assert.equal(anthropic['x-api-key'], 'k1')
  assert.equal(anthropic['anthropic-version'], '2023-06-01')
  const openai = authHeaders(resolveProvider({ provider: 'openai', apiKey: 'k2' }))
  assert.equal(openai.authorization, 'Bearer k2')
  assert.equal(openai['x-api-key'], undefined)
})

function recordingFetch(response) {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) })
    return response
  }
  return { calls, fetchImpl }
}

const okResponse = payload => ({ ok: true, status: 200, json: async () => payload })

test('the openai dialect posts to /chat/completions with a bearer token', async () => {
  const { calls, fetchImpl } = recordingFetch(okResponse({ choices: [{ message: { content: '{}' } }] }))
  const client = createClient(resolveProvider({ provider: 'deepseek', apiKey: 'sk-d' }), { fetch: fetchImpl })
  await client.messages.create({ model: 'deepseek-chat', messages: [] })
  assert.equal(calls[0].url, 'https://api.deepseek.com/chat/completions')
  assert.equal(calls[0].init.headers.authorization, 'Bearer sk-d')
  assert.equal(calls[0].init.headers['content-type'], 'application/json')
})

test('the anthropic dialect posts to /messages with the api key header', async () => {
  const { calls, fetchImpl } = recordingFetch(okResponse({ content: [{ text: '{}' }] }))
  const client = createClient(resolveProvider({ apiKey: 'sk-a' }), { fetch: fetchImpl })
  await client.messages.create({ model: MODEL, messages: [] })
  assert.equal(calls[0].url, 'https://api.anthropic.com/v1/messages')
  assert.equal(calls[0].init.headers['x-api-key'], 'sk-a')
})

test('a 401 names the provider and where to fix the key', async () => {
  const fetchImpl = async () => ({ ok: false, status: 401, json: async () => ({}) })
  const client = createClient(resolveProvider({ provider: 'openai', apiKey: 'bad' }), {
    fetch: fetchImpl,
    keyHelp: ' — update it in TenWords options',
  })
  await assert.rejects(() => client.messages.create({}), /invalid OpenAI API key — update it in TenWords options/)
})

test('other API errors surface the provider message', async () => {
  const fetchImpl = async () => ({ ok: false, status: 429, json: async () => ({ error: { message: 'rate limited' } }) })
  const client = createClient(resolveProvider({ provider: 'kimi', apiKey: 'k' }), { fetch: fetchImpl })
  await assert.rejects(() => client.messages.create({}), /rate limited/)
})

test('an error body without a message falls back to provider and status', async () => {
  const fetchImpl = async () => ({ ok: false, status: 500, json: async () => { throw new Error('not json') } })
  const client = createClient(resolveProvider({ provider: 'kimi', apiKey: 'k' }), { fetch: fetchImpl })
  await assert.rejects(() => client.messages.create({}), /Kimi API error 500/)
})

// Enforcement must behave the same whichever dialect answers.
function fakeOpenAiClient(config, ...responses) {
  const calls = []
  return {
    calls,
    dialect: config.dialect,
    model: config.model,
    tokenParam: config.tokenParam,
    messages: {
      create: async req => {
        calls.push(req)
        const next = responses.shift()
        if (!next) throw new Error('fake client ran out of responses')
        return { choices: [{ message: { content: JSON.stringify(next) } }] }
      },
    },
  }
}

test('openai dialect: the request uses the provider model and token param', async () => {
  const config = resolveProvider({ provider: 'openai', apiKey: 'k' })
  const client = fakeOpenAiClient(config, {
    tldr: TEN,
    summaries: [{ id: 'p0', words: TEN.split(' ') }, { id: 'p1', words: TEN.split(' ') }],
  })
  await summarizeBlocks(BLOCKS, client)
  assert.equal(client.calls[0].model, 'gpt-5-mini')
  assert.equal(client.calls[0].max_completion_tokens, 16384)
  assert.equal(client.calls[0].max_tokens, undefined)
})

test('openai dialect: deepseek keeps max_tokens', async () => {
  const config = resolveProvider({ provider: 'deepseek', apiKey: 'k' })
  const client = fakeOpenAiClient(config, {
    tldr: TEN,
    summaries: [{ id: 'p0', words: TEN.split(' ') }, { id: 'p1', words: TEN.split(' ') }],
  })
  await summarizeBlocks(BLOCKS, client)
  assert.equal(client.calls[0].model, 'deepseek-chat')
  assert.equal(client.calls[0].max_tokens, 16384)
  assert.equal(client.calls[0].max_completion_tokens, undefined)
})

test('openai dialect: offenders get the same retry and deterministic fix', async () => {
  const config = resolveProvider({ provider: 'kimi', apiKey: 'k' })
  const client = fakeOpenAiClient(
    config,
    { tldr: TWELVE, summaries: [{ id: 'p0', text: TWELVE }, { id: 'p1', text: TEN }] },
    { tldr: TWELVE, summaries: [{ id: 'p0', text: 'too short' }] },
  )
  const out = await summarizeBlocks(BLOCKS, client)
  assert.equal(client.calls.length, 2)
  assert.match(client.calls[1].messages[0].content, /12 words instead of 10/)
  assert.equal(countWords(out.tldr), 10)
  assert.ok(out.summaries.every(s => countWords(s.text) === 10))
})

test('openai dialect: a length finish_reason is a clear too-large error', async () => {
  const client = {
    dialect: 'openai',
    model: 'gpt-5-mini',
    tokenParam: 'max_completion_tokens',
    messages: {
      create: async () => ({ choices: [{ finish_reason: 'length', message: { content: '{}' } }] }),
    },
  }
  await assert.rejects(() => summarizeBlocks(BLOCKS, client), /too large/)
})
