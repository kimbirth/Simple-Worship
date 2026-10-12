import test from 'node:test'
import assert from 'node:assert/strict'

import { FALLBACK_BG, resolveBackground } from '../src/renderer/src/utils/background.ts'

test('default backgrounds use the configured app background or black fallback', () => {
  assert.deepEqual(resolveBackground('default', '', null), FALLBACK_BG)
  assert.deepEqual(resolveBackground('default', '', { type: 'image', value: 'C:\\Media\\default.jpg' }), {
    type: 'image',
    value: 'C:\\Media\\default.jpg'
  })
})

test('explicit backgrounds do not inherit the app default', () => {
  assert.deepEqual(resolveBackground('color', '#123456', { type: 'video', value: 'default.mp4' }), {
    type: 'color',
    value: '#123456'
  })
})
