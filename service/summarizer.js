import { countWords, endsOnConnector, fixToTen, parseJson } from './words.js'

export const MODEL = 'claude-haiku-4-5-20251001'
export const BATCH_SIZE = 40
const CONCURRENCY = 4

const RULES = `Rules:
- Each "words" array has EXACTLY 10 items — one word per item. Not 9, not 11.
- The 10 words must read as one complete, natural sentence that stands alone — never a sentence that trails off or gets cut short.
- Never end on a connector word ("and", "with", "the", "to"); the last word must complete the thought.
- Use plain, everyday vocabulary. No jargon, no fancy words.
- Keep the main point. Drop filler, hedging, and repetition.
- A hyphenated word is one item.
- Respond with ONLY the JSON object, no other text.`

function firstText(response) {
  return response.content?.[0]?.text ?? ''
}

function textOf(value) {
  if (Array.isArray(value)) return value.filter(w => typeof w === 'string').join(' ').trim()
  return typeof value === 'string' ? value : ''
}

const isBad = t => countWords(t) !== 10 || endsOnConnector(t)

function rejectionReason(text) {
  return countWords(text) !== 10
    ? `${countWords(text)} words instead of 10`
    : 'ends on a connector word, so the sentence is incomplete'
}

async function call(client, prompt) {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 16384,
    messages: [{ role: 'user', content: prompt }],
  })
  if (response.stop_reason === 'max_tokens') {
    throw new Error('document too large for one batch — try a shorter page')
  }
  return parseJson(firstText(response))
}

async function summarizeBatch(blocks, client, withTldr) {
  const tldrAsk = withTldr
    ? ' Also write "tldr": a 10-word summary of the whole document, in the same array form.'
    : ''
  const tldrShape = withTldr ? '"tldr": ["word1", ..., "word10"], ' : ''
  const prompt = `You compress verbose text into plain language.

Below are text blocks from one document. For EACH block, write a 10-word summary, given as a JSON array of its 10 words.${tldrAsk}

${RULES}

JSON shape: {${tldrShape}"summaries": [{"id": "...", "words": ["word1", ..., "word10"]}]}

Blocks:
${JSON.stringify(blocks)}`

  const first = await call(client, prompt)
  let tldr = textOf(first.tldr)
  const byId = new Map(
    (Array.isArray(first.summaries) ? first.summaries : [])
      .filter(s => s && typeof s.id === 'string')
      .map(s => [s.id, textOf(s.words ?? s.text)]),
  )

  const offenders = blocks.filter(b => isBad(byId.get(b.id) ?? ''))
  const tldrWrong = withTldr && isBad(tldr)

  if (offenders.length > 0 || tldrWrong) {
    const redo = offenders.map(b => {
      const rejected = byId.get(b.id) ?? ''
      return { id: b.id, block: b.text, rejected, reason: rejectionReason(rejected) }
    })
    const retryPrompt = `These summaries were rejected ("rejected" is the bad summary, "reason" says why). Rewrite EACH as a complete standalone sentence of EXACTLY 10 words.

${RULES}

JSON shape: {${tldrWrong ? '"tldr": ["word1", ..., "word10"], ' : ''}"summaries": [{"id": "...", "words": ["word1", ..., "word10"]}]}
${tldrWrong ? '\nAlso rewrite "tldr" (a 10-word summary of the whole document).\n' : ''}
Blocks to redo:
${JSON.stringify(redo)}`
    try {
      const retry = await call(client, retryPrompt)
      for (const s of Array.isArray(retry.summaries) ? retry.summaries : []) {
        if (s && typeof s.id === 'string') {
          const text = textOf(s.words ?? s.text)
          if (text) byId.set(s.id, text)
        }
      }
      if (tldrWrong) {
        const retried = textOf(retry.tldr)
        if (retried) tldr = retried
      }
    } catch {
      // fall through to deterministic fix below
    }
  }

  if (withTldr && countWords(tldr) !== 10) {
    tldr = fixToTen(tldr, blocks.map(b => b.text).join(' '))
  }

  const summaries = blocks.map(b => {
    let text = byId.get(b.id) ?? ''
    if (countWords(text) !== 10) text = fixToTen(text, b.text)
    return { id: b.id, text }
  })

  return { tldr: withTldr ? tldr : null, summaries }
}

async function tldrFromSummaries(summaries, client) {
  const allText = summaries.map(s => s.text).join(' ')
  const prompt = `Below are ten-word summaries of one document's paragraphs, in order. Write "tldr": a 10-word summary of the whole document, as a JSON array of its 10 words.

${RULES}

JSON shape: {"tldr": ["word1", ..., "word10"]}

Summaries:
${JSON.stringify(summaries.map(s => s.text))}`
  let tldr = ''
  try {
    tldr = textOf((await call(client, prompt)).tldr)
    if (isBad(tldr)) {
      const retryPrompt = `This tldr was rejected (${rejectionReason(tldr)}): ${JSON.stringify(tldr)}
Rewrite it as a complete standalone sentence of EXACTLY 10 words covering the whole document.

${RULES}

JSON shape: {"tldr": ["word1", ..., "word10"]}

Summaries:
${JSON.stringify(summaries.map(s => s.text))}`
      const retried = textOf((await call(client, retryPrompt)).tldr)
      if (retried) tldr = retried
    }
  } catch {
    // fall through to deterministic fix below
  }
  if (countWords(tldr) !== 10) tldr = fixToTen(tldr, allText)
  return tldr
}

async function pool(items, limit, worker) {
  const results = new Array(items.length)
  let next = 0
  async function lane() {
    while (next < items.length) {
      const i = next++
      results[i] = await worker(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane))
  return results
}

export async function summarizeBlocks(blocks, client, onProgress = () => {}) {
  const batches = []
  for (let i = 0; i < blocks.length; i += BATCH_SIZE) {
    batches.push(blocks.slice(i, i + BATCH_SIZE))
  }

  if (batches.length === 1) {
    const { tldr, summaries } = await summarizeBatch(blocks, client, true)
    onProgress({ type: 'batch', summaries })
    onProgress({ type: 'tldr', tldr })
    return { tldr, summaries }
  }

  const results = await pool(batches, CONCURRENCY, async batch => {
    const { summaries } = await summarizeBatch(batch, client, false)
    onProgress({ type: 'batch', summaries })
    return summaries
  })
  const summaries = results.flat()
  const tldr = await tldrFromSummaries(summaries, client)
  onProgress({ type: 'tldr', tldr })
  return { tldr, summaries }
}
