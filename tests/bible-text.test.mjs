import test from 'node:test'
import assert from 'node:assert/strict'

import { cleanMergedVerseText } from '../src/main/bibleText.ts'

test('merged Bible rows remove leaked range markers', () => {
  assert.equal(cleanMergedVerseText('-6aMula kay Abraham', '2-6'), 'Mula kay Abraham')
  assert.equal(cleanMergedVerseText('b-11Mula naman kay Haring David', '6-11'), 'Mula naman kay Haring David')
  assert.equal(cleanMergedVerseText('-16At pagkatapos', '12-16'), 'At pagkatapos')
})

test('merged Bible cleanup preserves real verse text', () => {
  assert.equal(cleanMergedVerseText('-8Labindalawang libo', '5-8'), 'Labindalawang libo')
  assert.equal(cleanMergedVerseText('-10ang mga tao', '9-10'), 'ang mga tao')
  assert.equal(cleanMergedVerseText('Ordinary verse text', '9'), 'Ordinary verse text')
})
