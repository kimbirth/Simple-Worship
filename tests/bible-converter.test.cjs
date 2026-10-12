'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')

const {
  SWBIBLE_APPLICATION_ID,
  SWBIBLE_FORMAT_VERSION,
  convertBibleDatabase,
  loadSqlRuntime,
} = require('../scripts/convert-bible.cjs')

function hashFile(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function makeTestDirectory() {
  return mkdtempSync(join(__dirname, '.tmp-bible-'))
}

async function writeFixture(path, { valid = true, versions = ['RTPV05'] } = {}) {
  const SQL = await loadSqlRuntime()
  const database = new SQL.Database()
  try {
    if (valid) {
      database.run(`
        CREATE TABLE books (
          id INTEGER PRIMARY KEY,
          book_order INTEGER NOT NULL,
          code TEXT NOT NULL,
          name TEXT NOT NULL,
          chapters INTEGER NOT NULL
        );
        CREATE TABLE verses (
          id INTEGER PRIMARY KEY,
          version TEXT NOT NULL,
          book_id INTEGER NOT NULL,
          chapter INTEGER NOT NULL,
          verse INTEGER NOT NULL,
          text TEXT NOT NULL,
          display_verse TEXT
        );
        INSERT INTO books VALUES (1, 1, 'GEN', 'Genesis', 1);
      `)
      const insert = database.prepare(
        'INSERT INTO verses VALUES (?, ?, 1, 1, 1, ?, \'1\')'
      )
      try {
        versions.forEach((version, index) => insert.run([index + 1, version, `Text ${version}`]))
      } finally {
        insert.free()
      }
    } else {
      database.run('CREATE TABLE unrelated (id INTEGER PRIMARY KEY)')
    }
    writeFileSync(path, Buffer.from(database.export()))
  } finally {
    database.close()
  }
}

test('converts a valid .db into a marked .swbible package without changing the source', async (context) => {
  const directory = makeTestDirectory()
  context.after(() => rmSync(directory, { recursive: true, force: true }))
  const input = join(directory, 'source.db')
  await writeFixture(input)
  const sourceHash = hashFile(input)

  const result = await convertBibleDatabase(input)
  assert.equal(result.outputPath, join(directory, 'RTPV05.swbible'))
  assert.equal(sourceHash, hashFile(input))
  assert.equal(result.bookCount, 1)
  assert.equal(result.verseCount, 1)

  const SQL = await loadSqlRuntime()
  const database = new SQL.Database(readFileSync(result.outputPath))
  try {
    assert.equal(database.exec('PRAGMA integrity_check')[0].values[0][0], 'ok')
    assert.equal(database.exec('PRAGMA application_id')[0].values[0][0], SWBIBLE_APPLICATION_ID)
    assert.equal(database.exec('PRAGMA user_version')[0].values[0][0], SWBIBLE_FORMAT_VERSION)
    assert.equal(database.exec('SELECT text FROM verses')[0].values[0][0], 'Text RTPV05')
  } finally {
    database.close()
  }
})

test('rejects a database with the wrong schema without creating output', async (context) => {
  const directory = makeTestDirectory()
  context.after(() => rmSync(directory, { recursive: true, force: true }))
  const input = join(directory, 'wrong.db')
  const output = join(directory, 'wrong.swbible')
  await writeFixture(input, { valid: false })

  await assert.rejects(
    convertBibleDatabase(input, output),
    /missing books column/i
  )
  assert.equal(existsSync(output), false)
})

test('requires an explicit output name for a multi-version database', async (context) => {
  const directory = makeTestDirectory()
  context.after(() => rmSync(directory, { recursive: true, force: true }))
  const input = join(directory, 'multiple.db')
  await writeFixture(input, { versions: ['ONE', 'TWO'] })

  await assert.rejects(
    convertBibleDatabase(input),
    /multiple Bible versions require an explicit output filename/i
  )
})

test('does not overwrite an existing package unless --force behavior is requested', async (context) => {
  const directory = makeTestDirectory()
  context.after(() => rmSync(directory, { recursive: true, force: true }))
  const input = join(directory, 'source.db')
  const output = join(directory, 'custom.swbible')
  await writeFixture(input)
  writeFileSync(output, 'keep me')

  await assert.rejects(convertBibleDatabase(input, output), /Output already exists/)
  assert.equal(readFileSync(output, 'utf8'), 'keep me')

  await convertBibleDatabase(input, output, { force: true })
  assert.notEqual(readFileSync(output, 'utf8'), 'keep me')
})

test('rejects conversion while a non-empty SQLite journal file is present', async (context) => {
  const directory = makeTestDirectory()
  context.after(() => rmSync(directory, { recursive: true, force: true }))
  const input = join(directory, 'source.db')
  await writeFixture(input)
  writeFileSync(`${input}-wal`, 'pending changes')

  await assert.rejects(convertBibleDatabase(input), /non-empty SQLite journal file exists/i)
})

test('rejects a non-SQLite file before attempting conversion', async (context) => {
  const directory = makeTestDirectory()
  context.after(() => rmSync(directory, { recursive: true, force: true }))
  const input = join(directory, 'not-sqlite.db')
  writeFileSync(input, 'this is not a database')

  await assert.rejects(convertBibleDatabase(input), /not a SQLite 3 database/i)
})

test('rejects a database marked for another application', async (context) => {
  const directory = makeTestDirectory()
  context.after(() => rmSync(directory, { recursive: true, force: true }))
  const input = join(directory, 'foreign.db')
  await writeFixture(input)

  const SQL = await loadSqlRuntime()
  const database = new SQL.Database(readFileSync(input))
  try {
    database.run('PRAGMA application_id = 12345')
    writeFileSync(input, Buffer.from(database.export()))
  } finally {
    database.close()
  }

  await assert.rejects(convertBibleDatabase(input), /belongs to a different application/i)
})

test('rejects malformed record types and whitespace-padded version names', async (context) => {
  const directory = makeTestDirectory()
  context.after(() => rmSync(directory, { recursive: true, force: true }))
  const malformedInput = join(directory, 'malformed.db')
  const paddedInput = join(directory, 'padded.db')

  const SQL = await loadSqlRuntime()
  const malformed = new SQL.Database()
  try {
    malformed.run(`
      CREATE TABLE books (id, book_order, code, name, chapters);
      CREATE TABLE verses (id, version, book_id, chapter, verse, text, display_verse);
      INSERT INTO books VALUES (1, NULL, 'GEN', 'Genesis', 1);
      INSERT INTO verses VALUES (NULL, 'RTPV05', 1, NULL, 1, 'Text', '1');
    `)
    writeFileSync(malformedInput, Buffer.from(malformed.export()))
  } finally {
    malformed.close()
  }
  await writeFixture(paddedInput, { versions: [' RTPV05 '] })

  await assert.rejects(convertBibleDatabase(malformedInput), /invalid Bible book record/i)
  await assert.rejects(convertBibleDatabase(paddedInput), /invalid Bible verse record/i)
})
