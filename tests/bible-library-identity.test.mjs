import test from 'node:test'
import assert from 'node:assert/strict'

import {
  biblePackageId,
  bibleTranslationId,
  installedBiblePackageName,
  safeBiblePackageStem,
} from '../src/main/bibleLibraryIdentity.ts'

test('identical Bible bytes produce an idempotent package identity', () => {
  const first = biblePackageId(Buffer.from('same Bible package'))
  const second = biblePackageId(Buffer.from('same Bible package'))
  const different = biblePackageId(Buffer.from('different Bible package'))

  assert.equal(first, second)
  assert.notEqual(first, different)
})

test('translation IDs distinguish versions and packages without exposing paths', () => {
  const rtpvPackage = biblePackageId(Buffer.from('RTPV05 package'))
  const nivPackage = biblePackageId(Buffer.from('NIV package'))

  assert.notEqual(
    bibleTranslationId(rtpvPackage, 'RTPV05'),
    bibleTranslationId(nivPackage, 'NIV'),
  )
  assert.notEqual(
    bibleTranslationId(rtpvPackage, 'RTPV05'),
    bibleTranslationId(rtpvPackage, 'NIV'),
  )
  assert.match(bibleTranslationId(rtpvPackage, 'RTPV05'), /^[a-f0-9]{64}$/)
})

test('storage names remain separate for same-named packages with different bytes', () => {
  const first = installedBiblePackageName({
    packageId: biblePackageId(Buffer.from('first')),
    versions: ['NIV'],
  })
  const second = installedBiblePackageName({
    packageId: biblePackageId(Buffer.from('second')),
    versions: ['NIV'],
  })

  assert.notEqual(first, second)
  assert.match(first, /^NIV-[a-f0-9]{12}\.swbible$/)
})

test('storage names are safe on Windows', () => {
  assert.equal(safeBiblePackageStem('RTPV05'), 'RTPV05')
  assert.equal(safeBiblePackageStem('New International Version'), 'New-International-Version')
  assert.equal(safeBiblePackageStem('CON'), 'Bible-CON')
  assert.equal(safeBiblePackageStem('...'), 'Bible')
})
