import { Readability } from '@mozilla/readability'
import { JSDOM } from 'jsdom'
import mammoth from 'mammoth'
import { PDFParse } from 'pdf-parse'
import { isIP } from 'node:net'
import { lookup } from 'node:dns/promises'
import { countWords } from './words.js'

const MAX_REDIRECTS = 3
const MAX_HTML_BYTES = 5 * 1024 * 1024

export function toBlocks(paragraphs) {
  return paragraphs
    .map(p => p.trim())
    .filter(p => countWords(p) >= 16)
    .map((text, i) => ({ id: `p${i}`, text }))
}

export function paragraphsFromHtml(html, url) {
  const dom = new JSDOM(html, { url })
  const article = new Readability(dom.window.document).parse()
  if (!article?.content) throw new Error('could not extract an article from this page')
  const articleDom = new JSDOM(article.content)
  return [...articleDom.window.document.querySelectorAll('p')].map(p => p.textContent)
}

export function paragraphsFromText(text) {
  return text.split(/\r?\n\s*\r?\n/).map(p => p.replace(/\s+/g, ' ').trim()).filter(Boolean)
}

const PAGE_MARKER = /^\s*--\s*\d+\s+of\s+\d+\s*--\s*$/

export function paragraphsFromPdfText(text) {
  const lines = text.split('\n')
  const paragraphs = []
  let current = []
  for (const rawLine of lines) {
    if (PAGE_MARKER.test(rawLine)) continue
    if (rawLine.trim() === '') {
      if (current.length) {
        paragraphs.push(current.join(' '))
        current = []
      }
      continue
    }
    const line = rawLine.trim()
    if (current.length > 0 && /[.?!:]\s*$/.test(current[current.length - 1])) {
      paragraphs.push(current.join(' '))
      current = [line]
    } else {
      current.push(line)
    }
  }
  if (current.length) paragraphs.push(current.join(' '))
  return paragraphs.map(p => p.replace(/\s+/g, ' ').trim()).filter(Boolean)
}

function isIPv4Private(h) {
  return (
    /^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h) || /^169\.254\./.test(h)
  )
}

export function isPrivateHost(host) {
  let h = host.toLowerCase()
  if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1)
  if (h === 'localhost' || h === '0.0.0.0') return true

  const kind = isIP(h)
  if (kind === 6) {
    if (h === '::1' || h === '::') return true
    if (h.startsWith('::ffff:')) {
      const mapped = h.slice(7)
      if (isIP(mapped) === 4) return isIPv4Private(mapped)
    }
    return (
      h.startsWith('fc') || h.startsWith('fd') ||
      h.startsWith('fe8') || h.startsWith('fe9') || h.startsWith('fea') || h.startsWith('feb')
    )
  }
  if (kind === 4) return isIPv4Private(h)
  return false
}

export async function assertPublicHost(host, lookupImpl = lookup) {
  if (isPrivateHost(host)) {
    throw new Error('refusing to fetch local or private addresses')
  }
  if (!isIP(host)) {
    const addrs = await lookupImpl(host, { all: true })
    if (addrs.some(a => isPrivateHost(a.address))) {
      throw new Error('refusing to fetch local or private addresses')
    }
  }
}

async function cancelBody(res) {
  await res.body?.cancel().catch(() => {})
}

async function readHtml(res) {
  const contentType = res.headers.get('content-type')?.split(';')[0].trim().toLowerCase()
  if (contentType && !['text/html', 'application/xhtml+xml'].includes(contentType)) {
    await cancelBody(res)
    throw new Error('URL must return HTML; download documents and use file upload instead')
  }
  const tooLarge = () => new Error('page exceeds the 5 MiB HTML limit; paste a shorter excerpt instead')
  const declaredLength = Number(res.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_HTML_BYTES) {
    await cancelBody(res)
    throw tooLarge()
  }
  if (!res.body) return ''
  const reader = res.body.getReader()
  const chunks = []
  let bytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > MAX_HTML_BYTES) throw tooLarge()
      chunks.push(value)
    }
    return Buffer.concat(chunks, bytes).toString('utf8')
  } catch (error) {
    await reader.cancel().catch(() => {})
    throw error
  } finally {
    reader.releaseLock()
  }
}

export async function extractUrl(url, fetchImpl = fetch, lookupImpl = undefined) {
  let currentUrl = url
  for (let redirects = 0; ; redirects++) {
    const parsed = new URL(currentUrl)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`unsupported protocol: ${parsed.protocol}`)
    }
    await assertPublicHost(parsed.hostname, lookupImpl)
    const res = await fetchImpl(currentUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (TenWords local reader)' },
      signal: AbortSignal.timeout(20000),
      redirect: 'manual',
    })
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      await cancelBody(res)
      if (redirects >= MAX_REDIRECTS) throw new Error('too many redirects')
      const location = res.headers.get('location')
      if (!location?.trim()) throw new Error('redirect missing location header')
      currentUrl = new URL(location, currentUrl).toString()
      continue
    }
    if (!res.ok) {
      await cancelBody(res)
      throw new Error(`fetch failed with status ${res.status}`)
    }
    return toBlocks(paragraphsFromHtml(await readHtml(res), currentUrl))
  }
}

export async function extractFile(buffer, filename) {
  const ext = filename.toLowerCase().split('.').pop()
  if (ext === 'txt') return toBlocks(paragraphsFromText(buffer.toString('utf8')))
  if (ext === 'pdf') {
    const parser = new PDFParse({ data: buffer })
    try {
      const result = await parser.getText()
      return toBlocks(paragraphsFromPdfText(result.text))
    } finally {
      await parser.destroy()
    }
  }
  if (ext === 'docx') {
    const { value } = await mammoth.extractRawText({ buffer })
    return toBlocks(paragraphsFromText(value))
  }
  throw new Error(`unsupported file type: .${ext} (use pdf, docx, or txt)`)
}
