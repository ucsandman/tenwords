import { countWords, fixToTen, parseJson } from './words.js'

export const MODEL = 'claude-haiku-4-5-20251001'

const RULES = `Rules:
- EXACTLY 10 words per summary. Count them. Not 9, not 11.
- Use plain, everyday vocabulary. No jargon, no fancy words.
- Keep the main point. Drop filler, hedging, and repetition.
- A word is anything separated by spaces; hyphenated words count as one.
- Respond with ONLY the JSON object, no other text.`

function firstText(response) {
  return response.content?.[0]?.text ?? ''
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

Below are text blocks from one document. For EACH block, write a summary of EXACTLY 10 words. Also write "tldr": EXACTLY 10 words summarizing the whole document.

${RULES}

JSON shape: {"tldr": "...", "summaries": [{"id": "...", "text": "..."}]}

Blocks:
${JSON.stringify(blocks)}`

  const first = await call(client, prompt)
  let tldr = typeof first.tldr === 'string' ? first.tldr : ''
  const byId = new Map(
    (Array.isArray(first.summaries) ? first.summaries : [])
      .filter(s => s && typeof s.id === 'string' && typeof s.text === 'string')
      .map(s => [s.id, s.text]),
  )

  const offenders = blocks.filter(b => countWords(byId.get(b.id) ?? '') !== 10)
  const tldrWrong = countWords(tldr) !== 10

  if (offenders.length > 0 || tldrWrong) {
    const retryPrompt = `These summaries had the wrong word count. Rewrite EACH to EXACTLY 10 words.

${RULES}

JSON shape: {${tldrWrong ? '"tldr": "...", ' : ''}"summaries": [{"id": "...", "text": "..."}]}
${tldrWrong ? '\nAlso rewrite "tldr" (a 10-word summary of the whole document).\n' : ''}
Blocks to redo:
${JSON.stringify(offenders)}`
    try {
      const retry = await call(client, retryPrompt)
      for (const s of Array.isArray(retry.summaries) ? retry.summaries : []) {
        if (s && typeof s.id === 'string' && typeof s.text === 'string') byId.set(s.id, s.text)
      }
      if (tldrWrong && typeof retry.tldr === 'string') tldr = retry.tldr
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
