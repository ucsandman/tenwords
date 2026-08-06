import test from 'node:test'
import assert from 'node:assert/strict'
import { toBlocks, paragraphsFromHtml, paragraphsFromText, extractUrl, extractFile } from '../service/extract.js'

const LONG = 'w1 w2 w3 w4 w5 w6 w7 w8 w9 w10 w11 w12 w13 w14 w15 w16'

test('toBlocks keeps only paragraphs with 16+ words and assigns ordered ids', () => {
  const blocks = toBlocks(['short one', LONG, '   ', LONG + ' extra'])
  assert.deepEqual(blocks.map(b => b.id), ['p0', 'p1'])
  assert.equal(blocks[0].text, LONG)
})

test('paragraphsFromText splits on blank lines', () => {
  assert.deepEqual(
    paragraphsFromText('para one line\n\npara two line\r\n\r\npara three'),
    ['para one line', 'para two line', 'para three'],
  )
})

test('paragraphsFromHtml pulls article paragraphs, not nav junk', () => {
  const html = `<html><head><title>T</title></head><body>
    <nav><p>menu menu menu</p></nav>
    <article><h1>Headline</h1><p>${LONG}</p><p>${LONG} more words here</p></article>
  </body></html>`
  const paras = paragraphsFromHtml(html, 'https://example.com/a')
  assert.equal(paras.length >= 2, true)
  assert.ok(paras[0].startsWith('w1 w2'))
})

test('extractUrl fetches and returns blocks', async () => {
  const html = `<html><body><article><p>${LONG}</p></article></body></html>`
  const fakeFetch = async () => ({ ok: true, text: async () => html })
  const blocks = await extractUrl('https://example.com/x', fakeFetch)
  assert.equal(blocks.length, 1)
  assert.equal(blocks[0].id, 'p0')
})

test('extractUrl throws on http error', async () => {
  const fakeFetch = async () => ({ ok: false, status: 404, text: async () => '' })
  await assert.rejects(() => extractUrl('https://example.com/x', fakeFetch), /404/)
})

test('extractFile handles txt buffers', async () => {
  const blocks = await extractFile(Buffer.from(`${LONG}\n\nshort`, 'utf8'), 'notes.txt')
  assert.equal(blocks.length, 1)
})

test('extractFile rejects unknown extensions', async () => {
  await assert.rejects(() => extractFile(Buffer.from('x'), 'image.png'), /unsupported/i)
})
