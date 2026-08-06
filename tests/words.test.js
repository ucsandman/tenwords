import test from 'node:test'
import assert from 'node:assert/strict'
import { countWords, fixToTen, parseJson } from '../service/words.js'

test('countWords counts whitespace-separated tokens', () => {
  assert.equal(countWords('one two three'), 3)
  assert.equal(countWords('  spaced   out  '), 2)
  assert.equal(countWords('well-known fact'), 2)
  assert.equal(countWords(''), 0)
  assert.equal(countWords('one\ntwo\tthree four'), 4)
})

test('fixToTen truncates long summaries to 10 words', () => {
  const twelve = 'a b c d e f g h i j k l'
  assert.equal(fixToTen(twelve, 'irrelevant'), 'a b c d e f g h i j')
})

test('fixToTen pads short summaries from the original text', () => {
  const eight = 'a b c d e f g h'
  const original = 'ONE TWO THREE FOUR FIVE SIX'
  assert.equal(fixToTen(eight, original), 'a b c d e f g h ONE TWO')
})

test('fixToTen leaves exactly-10 summaries alone', () => {
  const ten = 'a b c d e f g h i j'
  assert.equal(fixToTen(ten, 'x y z'), ten)
})

test('fixToTen builds from original when summary is empty', () => {
  const original = 'w1 w2 w3 w4 w5 w6 w7 w8 w9 w10 w11 w12'
  assert.equal(fixToTen('', original), 'w1 w2 w3 w4 w5 w6 w7 w8 w9 w10')
})

test('parseJson extracts JSON from fenced or noisy output', () => {
  assert.deepEqual(parseJson('```json\n{"a":1}\n```'), { a: 1 })
  assert.deepEqual(parseJson('Sure! {"a":{"b":2}} hope that helps'), { a: { b: 2 } })
  assert.deepEqual(parseJson('{"a":1}'), { a: 1 })
})

test('parseJson throws on garbage', () => {
  assert.throws(() => parseJson('no json here'))
})
