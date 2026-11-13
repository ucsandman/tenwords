import test from 'node:test'
import assert from 'node:assert/strict'
import { extractUrl } from '../service/extract.js'

const lookup = async () => [{ address:'93.184.216.34', family:4 }]
const LIMIT = 5 * 1024 * 1024
const text = 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen'
const html = `<html><body><article><p>${text}</p></article></body></html>`
const extract = response => extractUrl('https://example.com/article', async () => response, lookup)

test('normal streamed HTML remains extractable', async () => {
 const blocks = await extract(new Response(html, {headers:{'content-type':'text/html; charset=utf-8'}}))
 assert.equal(blocks[0].text, text)
})
test('rejects declared oversized response and cancels its body without consuming it', async () => {
 let cancelled = false
 const response = new Response(new ReadableStream({cancel(){cancelled=true}}), {headers:{'content-length':String(LIMIT+1)}})
 await assert.rejects(extract(response), /5 MiB/)
 assert.equal(cancelled,true)
})
test('enforces decoded byte limit even without content-length and cancels early', async () => {
 let chunks = 0, cancelled = false
 const response = new Response(new ReadableStream({
  pull(controller){chunks++;controller.enqueue(new Uint8Array(1024*1024));if(chunks===20) controller.close()},
  cancel(){cancelled=true},
 }))
 await assert.rejects(extract(response), /5 MiB/)
 assert.equal(cancelled,true)
 assert.ok(chunks < 20)
})
test('does not trust an understated content-length', async () => {
 const response = new Response('x'.repeat(LIMIT+1), {headers:{'content-length':'1','content-type':'text/html'}})
 await assert.rejects(extract(response), /5 MiB/)
})
test('rejects non-HTML responses before parsing them', async () => {
 let cancelled=false
 const response = new Response(new ReadableStream({cancel(){cancelled=true}}), {headers:{'content-type':'application/pdf'}})
 await assert.rejects(extract(response), /HTML/)
 assert.equal(cancelled,true)
})
test('relative redirects release old response bodies', async () => {
 let cancelled=false,calls=0
 const redirect = new Response(new ReadableStream({cancel(){cancelled=true}}), {status:302,headers:{location:'/final'}})
 const blocks = await extractUrl('https://example.com/start', async url=>{
  calls++; if(calls===1)return redirect
  assert.equal(url,'https://example.com/final');return new Response(html, {headers:{'content-type':'text/html'}})
 },lookup)
 assert.equal(cancelled,true);assert.equal(blocks.length,1)
})
test('missing redirect location is an explicit error', async () => {
 await assert.rejects(extract(new Response('',{status:302})), /redirect.*location/i)
})
test('UTF-8 text split between chunks is decoded without corruption', async () => {
 const unicodeHtml = html.replace('one', 'café')
 const bytes = new TextEncoder().encode(unicodeHtml)
 const split = bytes.indexOf(0xc3) + 1
 const response = new Response(new ReadableStream({start(controller){
  controller.enqueue(bytes.slice(0,split));controller.enqueue(bytes.slice(split));controller.close()
 }}), {headers:{'content-type':'application/xhtml+xml'}})
 const blocks = await extract(response)
 assert.equal(blocks[0].text, text.replace('one','café'))
})
test('HTTP error bodies are cancelled before reporting failure', async () => {
 let cancelled = false
 const response = new Response(new ReadableStream({cancel(){cancelled=true}}), {status:503})
 await assert.rejects(extract(response), /503/)
 assert.equal(cancelled,true)
})
test('stream read failures preserve the original failure', async () => {
 const response = new Response(new ReadableStream({start(controller){controller.error(new Error('stream interrupted'))}}))
 await assert.rejects(extract(response), /stream interrupted/)
})
