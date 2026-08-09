import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

for (const f of ['words.js', 'summarizer.js', 'providers.js']) {
  test(`extension/lib/${f} is in sync with service/${f} (fix: npm run sync-ext)`, () => {
    const lib = readFileSync(new URL(`../extension/lib/${f}`, import.meta.url), 'utf8')
    const src = readFileSync(new URL(`../service/${f}`, import.meta.url), 'utf8')
    assert.equal(lib, src)
  })
}
