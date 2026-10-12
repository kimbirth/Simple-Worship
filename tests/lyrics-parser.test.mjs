import test from 'node:test'
import assert from 'node:assert/strict'

import { parseLyrics, tagColor } from '../src/renderer/src/utils/lyricsParser.ts'

test('parseLyrics creates tagged blocks and trims lyric lines', () => {
  const result = parseLyrics([
    'ignored preamble',
    '[Verse 1]',
    '  First line  ',
    'Second line',
    '[Chorus]',
    'Sing together'
  ].join('\n'))

  assert.deepEqual(result, [
    { tag: 'Verse 1', lines: ['First line', 'Second line'] },
    { tag: 'Chorus', lines: ['Sing together'] }
  ])
})

test('parseLyrics ignores empty adjacent headings', () => {
  assert.deepEqual(parseLyrics('[Intro]\r\n[Verse]\r\nHello'), [
    { tag: 'Verse', lines: ['Hello'] }
  ])
})

test('parseLyrics makes multiple slides under one repeated heading', () => {
  assert.deepEqual(parseLyrics('[Verse]\nLine one\n\nLine two'), [
    { tag: 'Verse', lines: ['Line one'] },
    { tag: 'Verse', lines: ['Line two'] }
  ])
})

test('tagColor is case-insensitive and has a neutral fallback', () => {
  assert.equal(tagColor('VERSE 2'), '#4a9eff')
  assert.equal(tagColor('Pre-Chorus'), '#a29bfe')
  assert.equal(tagColor('Spoken'), '#b2bec3')
})
