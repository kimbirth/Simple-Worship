import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildReference,
  buildVerseParts,
  compressedVerseRange,
  matchingVerseIds,
  parseVerseReference,
  updateVerseSelection
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
  assert.equal(compressedVerseRange(rows), '2,6,11')
  assert.equal(buildReference('John', 3, 'KJV', rows), 'John 3:2,6,11 KJV')
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

const chapterRows = [
  { id: 101, verse: 1, text: 'First', display_verse: '1' },
  { id: 205, verse: 2, text: 'Second', display_verse: '2' },
  { id: 309, verse: 3, text: 'Third', display_verse: '3' },
  { id: 450, verse: 4, text: 'Fourth', display_verse: '4' }
]

test('selecting two verse endpoints includes every verse between them', () => {
  const firstClick = updateVerseSelection(chapterRows, new Set(), 101)
  const secondClick = updateVerseSelection(chapterRows, firstClick, 450)
  assert.deepEqual([...secondClick], [101, 205, 309, 450])

  const selectedRows = chapterRows.filter(row => secondClick.has(row.id))
  assert.equal(buildReference('John', 3, 'KJV', selectedRows), 'John 3:1-4 KJV')
  assert.deepEqual(buildVerseParts(selectedRows), [
    { number: '1', text: 'First' },
    { number: '2', text: 'Second' },
    { number: '3', text: 'Third' },
    { number: '4', text: 'Fourth' }
  ])
})

test('verse endpoint selection works in reverse chapter order', () => {
  const firstClick = updateVerseSelection(chapterRows, new Set(), 450)
  const secondClick = updateVerseSelection(chapterRows, firstClick, 101)
  assert.deepEqual([...secondClick], [101, 205, 309, 450])
})

test('clicking a selected verse still toggles it off', () => {
  const selected = new Set(chapterRows.map(row => row.id))
  assert.deepEqual(
    [...updateVerseSelection(chapterRows, selected, 450)],
    [101, 205, 309]
  )
})

test('an interior deselection keeps the cue and citation accurate', () => {
  const selected = new Set(chapterRows.map(row => row.id))
  const withoutSecond = updateVerseSelection(chapterRows, selected, 205)
  const selectedRows = chapterRows.filter(row => withoutSecond.has(row.id))
  assert.equal(buildReference('John', 3, 'KJV', selectedRows), 'John 3:1,3-4 KJV')
  assert.deepEqual(
    buildVerseParts(selectedRows).map(part => part.text),
    ['First', 'Third', 'Fourth']
  )
})

test('reference matching includes a merged verse row', () => {
  const mergedRows = [
    { id: 10, verse: 1, text: 'First', display_verse: '1' },
    { id: 20, verse: 2, text: 'Merged', display_verse: '2-6' },
    { id: 30, verse: 7, text: 'Seventh', display_verse: '7' }
  ]
  assert.deepEqual([...matchingVerseIds(mergedRows, new Set([4, 7]))], [20, 30])
})

test('an unknown verse id leaves the selection unchanged', () => {
  assert.deepEqual(
    [...updateVerseSelection(chapterRows, new Set([101]), 999)],
    [101]
  )
})
