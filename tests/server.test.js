import test from 'node:test'
import assert from 'node:assert/strict'
import { createApp } from '../service/server.js'

const TEN = 'one two three four five six seven eight nine ten'
const okClient = {
  messages: {
    create: async () => ({
      content: [{ text: JSON.stringify({ tldr: TEN, summaries: [{ id: 'p0', text: TEN }] }) }],
    }),
  },
}

function listen(app) {
  return new Promise(resolve => {
    const server = app.listen(0, () => resolve({ server, port: server.address().port }))
  })
}

test('POST /summarize returns tldr and summaries', async () => {
  const { server, port } = await listen(createApp(okClient))
  try {
    const res = await fetch(`http://localhost:${port}/summarize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocks: [{ id: 'p0', text: 'x '.repeat(20).trim() }] }),
    })
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.tldr, TEN)
    assert.equal(body.summaries[0].id, 'p0')
  } finally {
    server.close()
  }
})

test('POST /summarize rejects missing blocks with 400', async () => {
  const { server, port } = await listen(createApp(okClient))
  try {
    const res = await fetch(`http://localhost:${port}/summarize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    assert.equal(res.status, 400)
    assert.ok((await res.json()).error)
  } finally {
    server.close()
  }
})

test('POST /summarize surfaces upstream failure as 502 with error body', async () => {
  const badClient = { messages: { create: async () => { throw new Error('api down') } } }
  const { server, port } = await listen(createApp(badClient))
  try {
    const res = await fetch(`http://localhost:${port}/summarize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocks: [{ id: 'p0', text: 'hello world' }] }),
    })
    assert.equal(res.status, 502)
    assert.match((await res.json()).error, /api down/)
  } finally {
    server.close()
  }
})

test('GET / serves the webapp', async () => {
  const { server, port } = await listen(createApp(okClient))
  try {
    const res = await fetch(`http://localhost:${port}/`)
    assert.equal(res.status, 200)
    assert.match(await res.text(), /TenWords/)
  } finally {
    server.close()
  }
})
