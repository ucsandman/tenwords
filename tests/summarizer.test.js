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

test('rejects when model returns garbage twice', async () => {
  const client = {
    messages: { create: async () => ({ content: [{ text: 'not json at all' }] }) },
  }
  await assert.rejects(() => summarizeBlocks(BLOCKS, client))
})
