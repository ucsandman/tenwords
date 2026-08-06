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

test('POST /extract accepts a txt file upload', async () => {
  const { server, port } = await listen(createApp(okClient))
  try {
    const LONG = 'w1 w2 w3 w4 w5 w6 w7 w8 w9 w10 w11 w12 w13 w14 w15 w16'
    const form = new FormData()
    form.append('file', new Blob([`${LONG}\n\nshort`], { type: 'text/plain' }), 'doc.txt')
    const res = await fetch(`http://localhost:${port}/extract`, { method: 'POST', body: form })
    assert.equal(res.status, 200)
    const { blocks } = await res.json()
    assert.equal(blocks.length, 1)
    assert.equal(blocks[0].id, 'p0')
  } finally {
    server.close()
  }
})

test('POST /extract with neither file nor url is 400', async () => {
  const { server, port } = await listen(createApp(okClient))
  try {
    const res = await fetch(`http://localhost:${port}/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    assert.equal(res.status, 400)
  } finally {
    server.close()
  }
})

test('POST /extract surfaces extraction failure as 422', async () => {
  const { server, port } = await listen(createApp(okClient))
  try {
    const form = new FormData()
    form.append('file', new Blob(['x'], { type: 'image/png' }), 'pic.png')
    const res = await fetch(`http://localhost:${port}/extract`, { method: 'POST', body: form })
    assert.equal(res.status, 422)
    assert.match((await res.json()).error, /unsupported/i)
  } finally {
    server.close()
  }
})

test('POST /extract with wrong multipart field name returns JSON error', async () => {
  const { server, port } = await listen(createApp(okClient))
  try {
    const form = new FormData()
    form.append('wrongfield', new Blob(['hello'], { type: 'text/plain' }), 'doc.txt')
    const res = await fetch(`http://localhost:${port}/extract`, { method: 'POST', body: form })
    assert.equal(res.status, 400)
    assert.match(res.headers.get('content-type'), /application\/json/)
    assert.ok((await res.json()).error)
  } finally {
    server.close()
  }
})
