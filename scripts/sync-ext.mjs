// Copies the summarization core into the extension so BYOK mode runs the
// exact same enforcement code as the service. tests/ext-sync.test.js fails
// if these copies drift.
import { copyFileSync, mkdirSync } from 'node:fs'

const FILES = ['words.js', 'summarizer.js', 'providers.js']
mkdirSync(new URL('../extension/lib/', import.meta.url), { recursive: true })
for (const f of FILES) {
  copyFileSync(
    new URL(`../service/${f}`, import.meta.url),
    new URL(`../extension/lib/${f}`, import.meta.url),
  )
}
console.log(`synced ${FILES.join(', ')} -> extension/lib/`)
