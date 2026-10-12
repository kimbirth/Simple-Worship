import test from 'node:test'
import assert from 'node:assert/strict'

import { isMissingMediaPath } from '../src/renderer/src/utils/mediaHealth.ts'
import { mediaUrl } from '../src/renderer/src/utils/mediaUrl.ts'

test('mediaUrl preserves URLs already safe for a media element', () => {
  for (const value of ['https://example.test/a.mp4', 'HTTP://example.test/a.jpg', 'data:image/png;base64,AA==', 'blob:test']) {
    assert.equal(mediaUrl(value), value)
  }
  assert.equal(mediaUrl(''), '')
})

test('mediaUrl encodes a local path as one query-string value', () => {
  const path = 'C:\\Church Media\\Grace & Peace #1.mp4'
  const url = new URL(mediaUrl(path))

  assert.equal(url.origin, 'http://127.0.0.1:19742')
  assert.equal(url.pathname, '/file')
  assert.equal(url.searchParams.get('p'), path)
})

test('mediaUrl uses the loopback port supplied by the main process', () => {
  const previousWindow = globalThis.window
  globalThis.window = { location: { search: '?mediaPort=32123' } }
  try {
    const url = new URL(mediaUrl('C:\\Media\\loop.mp4'))
    assert.equal(url.port, '32123')
  } finally {
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
  }
})

test('isMissingMediaPath compares Windows paths without case or slash sensitivity', () => {
  const report = {
    checkedAt: '2026-09-29T00:00:00.000Z',
    issues: [{ kind: 'schedule', label: 'Opening', path: 'C:\\Media\\OPENING.MP4' }]
  }

  assert.equal(isMissingMediaPath(report, 'c:/media/opening.mp4'), true)
  assert.equal(isMissingMediaPath(report, 'c:/media/other.mp4'), false)
  assert.equal(isMissingMediaPath(report, ''), false)
})
