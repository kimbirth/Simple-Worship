import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { startMediaServer, stopMediaServer } from '../src/main/mediaServer.ts'

test('media server restricts files and implements video byte ranges', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'simpleworship-media-'))
  const allowedPath = join(directory, 'loop.mp4')
  const deniedPath = join(directory, 'private.mp4')
  const contents = Buffer.from('0123456789')
  await Promise.all([
    writeFile(allowedPath, contents),
    writeFile(deniedPath, Buffer.from('private')),
  ])

  try {
    const port = await startMediaServer(path => path === allowedPath)
    const url = `http://127.0.0.1:${port}/file?p=${encodeURIComponent(allowedPath)}`

    const full = await fetch(url)
    assert.equal(full.status, 200)
    assert.equal(full.headers.get('content-type'), 'video/mp4')
    assert.deepEqual(Buffer.from(await full.arrayBuffer()), contents)

    const partial = await fetch(url, { headers: { Range: 'bytes=2-5' } })
    assert.equal(partial.status, 206)
    assert.equal(partial.headers.get('content-range'), 'bytes 2-5/10')
    assert.equal(await partial.text(), '2345')

    const invalid = await fetch(url, { headers: { Range: 'bytes=20-' } })
    assert.equal(invalid.status, 416)
    assert.equal(invalid.headers.get('content-range'), 'bytes */10')

    const deniedUrl = `http://127.0.0.1:${port}/file?p=${encodeURIComponent(deniedPath)}`
    assert.equal((await fetch(deniedUrl)).status, 403)

    const head = await fetch(url, { method: 'HEAD' })
    assert.equal(head.status, 200)
    assert.equal(head.headers.get('content-length'), String(contents.length))
  } finally {
    stopMediaServer()
    await rm(directory, { recursive: true, force: true })
  }
})
