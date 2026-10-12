import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildReference,
  buildVerseParts,
  compressedVerseRange,
  parseVerseReference
} from '../src/renderer/src/utils/verseFormat.ts'

const john = { id: 43, book_order: 43, code: 'JHN', name: 'John', chapters: 21 }
const rows = [
  { id: 1, verse: 2, text: ' Second ', display_verse: '2' },
  { id: 2, verse: 6, text: 'Sixth', display_verse: '6' },
  { id: 3, verse: 11, text: 'Eleventh', display_verse: '11' }
]

test('verse references parse lists and ranges', () => {
  const parsed = parseVerseReference('John 3:2,6,9-11', [john])
  assert.equal(parsed?.book, john)
  assert.equal(parsed?.chapter, 3)
  assert.deepEqual([...parsed.verseNumbers ?? []], [2, 6, 9, 10, 11])
  assert.equal(parseVerseReference('John 99:1', [john]), null)
})

test('verse display helpers preserve parts and produce a compact citation', () => {
  assert.equal(compressedVerseRange(rows), '2-11')
  assert.equal(buildReference('John', 3, 'KJV', rows), 'John 3:2-11 KJV')
  assert.deepEqual(buildVerseParts(rows), [
    { number: '2', text: 'Second' },
    { number: '6', text: 'Sixth' },
    { number: '11', text: 'Eleventh' }
  ])
})

test('a single selected verse omits its inline number but keeps its citation', () => {
  assert.deepEqual(buildVerseParts([rows[1]]), [
    { number: '', text: 'Sixth' }
  ])
  assert.equal(buildReference('John', 3, 'KJV', [rows[1]]), 'John 3:6 KJV')
})
