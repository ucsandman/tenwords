import test from 'node:test'
import assert from 'node:assert/strict'
import { summarizeBlocks } from '../service/summarizer.js'
import { countWords } from '../service/words.js'

const TEN = 'one two three four five six seven eight nine ten'
const TWELVE = TEN + ' eleven twelve'
const LONG_TEXT = 'orig1 orig2 orig3 orig4 orig5 orig6 orig7 orig8 orig9 orig10 orig11 orig12 orig13 orig14 orig15 orig16'
const BLOCKS = [
  { id: 'p0', text: LONG_TEXT },
  { id: 'p1', text: LONG_TEXT },
]

function fakeClient(...responses) {
  const calls = []
  return {
    calls,
    messages: {
      create: async (req) => {
        calls.push(req)
        const next = responses.shift()
        if (!next) throw new Error('fake client ran out of responses')
        return { content: [{ text: JSON.stringify(next) }] }
      },
    },
  }
}

test('happy path: returns tldr and per-block summaries in input order', async () => {
  const client = fakeClient({
    tldr: TEN,
    summaries: [
      { id: 'p1', text: TEN },
      { id: 'p0', text: TEN },
    ],
  })
  const out = await summarizeBlocks(BLOCKS, client)
  assert.equal(out.tldr, TEN)
  assert.deepEqual(out.summaries.map(s => s.id), ['p0', 'p1'])
  assert.ok(out.summaries.every(s => countWords(s.text) === 10))
  assert.equal(client.calls.length, 1)
})

test('accepts the words-array response shape', async () => {
  const client = fakeClient({
    tldr: TEN.split(' '),
    summaries: [
      { id: 'p0', words: TEN.split(' ') },
      { id: 'p1', words: TEN.split(' ') },
    ],
  })
  const out = await summarizeBlocks(BLOCKS, client)
  assert.equal(out.tldr, TEN)
  assert.ok(out.summaries.every(s => s.text === TEN))
  assert.equal(client.calls.length, 1)
})

test('retry prompt shows the rejected summary and its word count', async () => {
  const client = fakeClient(
    { tldr: TEN, summaries: [{ id: 'p0', text: TWELVE }, { id: 'p1', text: TEN }] },
    { summaries: [{ id: 'p0', words: TEN.split(' ') }] },
  )
  await summarizeBlocks(BLOCKS, client)
  const retryPrompt = client.calls[1].messages[0].content
  assert.match(retryPrompt, /12 words instead of 10/)
  assert.ok(retryPrompt.includes(TWELVE))
})

test('a 10-word summary ending on a connector gets retried', async () => {
  const ENDS_AND = 'one two three four five six seven eight nine and'
  const client = fakeClient(
    { tldr: TEN, summaries: [{ id: 'p0', text: ENDS_AND }, { id: 'p1', text: TEN }] },
    { summaries: [{ id: 'p0', words: TEN.split(' ') }] },
  )
  const out = await summarizeBlocks(BLOCKS, client)
  assert.equal(client.calls.length, 2)
  assert.match(client.calls[1].messages[0].content, /connector word/)
  assert.equal(out.summaries.find(s => s.id === 'p0').text, TEN)
})

test('offenders get one corrective retry call', async () => {
  const client = fakeClient(
    { tldr: TEN, summaries: [{ id: 'p0', text: TWELVE }, { id: 'p1', text: TEN }] },
    { summaries: [{ id: 'p0', text: TEN }] },
  )
  const out = await summarizeBlocks(BLOCKS, client)
  assert.equal(client.calls.length, 2)
  assert.ok(out.summaries.every(s => countWords(s.text) === 10))
})

test('still-wrong summaries after retry are fixed deterministically', async () => {
  const client = fakeClient(
    { tldr: TWELVE, summaries: [{ id: 'p0', text: TWELVE }, { id: 'p1', text: TEN }] },
    { tldr: TWELVE, summaries: [{ id: 'p0', text: 'too short' }] },
  )
  const out = await summarizeBlocks(BLOCKS, client)
  assert.equal(countWords(out.tldr), 10)
  assert.ok(out.summaries.every(s => countWords(s.text) === 10))
})

test('missing summaries fall back to first 10 words of original', async () => {
  const client = fakeClient(
    { tldr: TEN, summaries: [{ id: 'p0', text: TEN }] },
    { summaries: [] },
  )
  const out = await summarizeBlocks(BLOCKS, client)
  const p1 = out.summaries.find(s => s.id === 'p1')
  assert.equal(p1.text, 'orig1 orig2 orig3 orig4 orig5 orig6 orig7 orig8 orig9 orig10')
})

test('documents over 40 blocks run in parallel batches with a final tldr call', async () => {
  const blocks = Array.from({ length: 90 }, (_, i) => ({ id: `b${i}`, text: `${LONG_TEXT} block ${i}` }))
  const calls = []
  const client = {
    messages: {
      create: async (req) => {
        calls.push(req)
        const prompt = req.messages[0].content
        if (prompt.includes('ten-word summaries of one document')) {
          return { content: [{ text: JSON.stringify({ tldr: TEN.split(' ') }) }] }
        }
        const ids = [...prompt.matchAll(/"id":"(b\d+)"/g)].map(m => m[1])
        return { content: [{ text: JSON.stringify({ summaries: ids.map(id => ({ id, words: TEN.split(' ') })) }) }] }
      },
    },
  }
  const events = []
  const out = await summarizeBlocks(blocks, client, e => events.push(e))
  assert.equal(calls.length, 4)
  assert.ok(calls.slice(0, 3).every(c => !c.messages[0].content.includes('"tldr"')))
  assert.equal(out.summaries.length, 90)
  assert.deepEqual(out.summaries.map(s => s.id), blocks.map(b => b.id))
  assert.equal(out.tldr, TEN)
  assert.equal(events.filter(e => e.type === 'batch').length, 3)
  assert.equal(events.filter(e => e.type === 'tldr').length, 1)
})

test('single-batch documents emit batch and tldr progress events', async () => {
  const client = fakeClient({ tldr: TEN, summaries: [{ id: 'p0', text: TEN }, { id: 'p1', text: TEN }] })
  const events = []
  await summarizeBlocks(BLOCKS, client, e => events.push(e))
  assert.deepEqual(events.map(e => e.type), ['batch', 'tldr'])
})

test('rejects when model returns garbage twice', async () => {
  const client = {
    messages: { create: async () => ({ content: [{ text: 'not json at all' }] }) },
  }
  await assert.rejects(() => summarizeBlocks(BLOCKS, client))
})

test('rejects with a clear error when the response hit the token ceiling', async () => {
  const client = {
    messages: {
      create: async () => ({ stop_reason: 'max_tokens', content: [{ text: '{}' }] }),
    },
  }
  await assert.rejects(() => summarizeBlocks(BLOCKS, client), /too large/)
})
