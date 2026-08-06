import { countWords, endsOnConnector, fixToTen, parseJson } from './words.js'

export const MODEL = 'claude-haiku-4-5-20251001'

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

export async function summarizeBlocks(blocks, client) {
  const prompt = `You compress verbose text into plain language.

Below are text blocks from one document. For EACH block, write a 10-word summary, given as a JSON array of its 10 words. Also write "tldr": a 10-word summary of the whole document, in the same array form.

${RULES}

JSON shape: {"tldr": ["word1", ..., "word10"], "summaries": [{"id": "...", "words": ["word1", ..., "word10"]}]}

Blocks:
${JSON.stringify(blocks)}`

  const first = await call(client, prompt)
  let tldr = textOf(first.tldr)
  const byId = new Map(
    (Array.isArray(first.summaries) ? first.summaries : [])
      .filter(s => s && typeof s.id === 'string')
      .map(s => [s.id, textOf(s.words ?? s.text)]),
  )

  const isBad = t => countWords(t) !== 10 || endsOnConnector(t)
  const offenders = blocks.filter(b => isBad(byId.get(b.id) ?? ''))
  const tldrWrong = isBad(tldr)

  if (offenders.length > 0 || tldrWrong) {
    const redo = offenders.map(b => {
      const rejected = byId.get(b.id) ?? ''
      return {
        id: b.id,
        block: b.text,
        rejected,
        reason: countWords(rejected) !== 10
          ? `${countWords(rejected)} words instead of 10`
          : 'ends on a connector word, so the sentence is incomplete',
      }
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

  const allOriginal = blocks.map(b => b.text).join(' ')
  if (countWords(tldr) !== 10) tldr = fixToTen(tldr, allOriginal)

  const summaries = blocks.map(b => {
    let text = byId.get(b.id) ?? ''
    if (countWords(text) !== 10) text = fixToTen(text, b.text)
    return { id: b.id, text }
  })

  return { tldr, summaries }
}
