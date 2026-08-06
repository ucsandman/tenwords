import { Readability } from '@mozilla/readability'
import { JSDOM } from 'jsdom'
import mammoth from 'mammoth'
import { PDFParse } from 'pdf-parse'
import { countWords } from './words.js'

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

export async function extractUrl(url, fetchImpl = fetch) {
  const parsed = new URL(url)
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`unsupported protocol: ${parsed.protocol}`)
  }
  const host = parsed.hostname
  if (
    host === 'localhost' || host === '0.0.0.0' || host === '::1' || host === '[::1]' ||
    /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) || /^169\.254\./.test(host)
  ) {
    throw new Error('refusing to fetch local or private addresses')
  }
  const res = await fetchImpl(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (TenWords local reader)' },
    signal: AbortSignal.timeout(20000),
  })
  if (!res.ok) throw new Error(`fetch failed with status ${res.status}`)
  return toBlocks(paragraphsFromHtml(await res.text(), url))
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
