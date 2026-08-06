import { Readability } from '@mozilla/readability'
import { JSDOM } from 'jsdom'
import mammoth from 'mammoth'
import { PDFParse } from 'pdf-parse'
import { isIP } from 'node:net'
import { lookup } from 'node:dns/promises'
import { countWords } from './words.js'

const MAX_REDIRECTS = 3

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

export function isPrivateHost(host) {
  let h = host.toLowerCase()
  if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1)
  if (h.startsWith('::ffff:')) h = h.slice(7)
  return (
    h === 'localhost' || h === '0.0.0.0' || h === '::1' || h === '::' ||
    /^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h) || /^169\.254\./.test(h) ||
    h.startsWith('fc') || h.startsWith('fd') ||
    h.startsWith('fe8') || h.startsWith('fe9') || h.startsWith('fea') || h.startsWith('feb')
  )
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
      if (redirects >= MAX_REDIRECTS) throw new Error('too many redirects')
      currentUrl = new URL(res.headers.get('location'), currentUrl).toString()
      continue
    }
    if (!res.ok) throw new Error(`fetch failed with status ${res.status}`)
    return toBlocks(paragraphsFromHtml(await res.text(), currentUrl))
  }
}

export async function extractFile(buffer, filename) {
  const ext = filename.toLowerCase().split('.').pop()
  if (ext === 'txt') return toBlocks(paragraphsFromText(buffer.toString('utf8')))
  if (ext === 'pdf') {
    const result = await new PDFParse({ data: buffer }).getText()
    return toBlocks(paragraphsFromText(result.text))
  }
  if (ext === 'docx') {
    const { value } = await mammoth.extractRawText({ buffer })
    return toBlocks(paragraphsFromText(value))
  }
  throw new Error(`unsupported file type: .${ext} (use pdf, docx, or txt)`)
}
