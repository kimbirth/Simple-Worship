import test from 'node:test'
import assert from 'node:assert/strict'

import { EMPTY_OVERLAYS, resolvedOverlay } from '../src/renderer/src/types/index.ts'

test('resolvedOverlay returns none when every independent layer is off', () => {
  assert.equal(resolvedOverlay(EMPTY_OVERLAYS), 'none')
})

test('resolvedOverlay applies the documented safety priority', () => {
  assert.equal(resolvedOverlay({ black: false, clear: true, logo: false }), 'clear')
  assert.equal(resolvedOverlay({ black: false, clear: true, logo: true }), 'logo')
  assert.equal(resolvedOverlay({ black: true, clear: true, logo: true }), 'black')
})
