export function countWords(text) {
  return text.trim().split(/\s+/).filter(Boolean).length
}

export function fixToTen(summary, originalText) {
  const words = summary.trim().split(/\s+/).filter(Boolean)
  if (words.length >= 10) return words.slice(0, 10).join(' ')
  const pool = originalText.trim().split(/\s+/).filter(Boolean)
  return words.concat(pool.slice(0, 10 - words.length)).join(' ')
}

const CONNECTORS = new Set([
  'and', 'or', 'but', 'with', 'for', 'the', 'a', 'an', 'to', 'of', 'in',
  'on', 'at', 'by', 'from', 'as', 'while', 'plus', 'also', 'then',
])

export function endsOnConnector(text) {
  const words = text.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return false
  return CONNECTORS.has(words[words.length - 1].replace(/[.,;:!?]+$/, ''))
}

export function parseJson(text) {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) throw new Error('no JSON object in model output')
  return JSON.parse(text.slice(start, end + 1))
}
