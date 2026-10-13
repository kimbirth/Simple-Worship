'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { mkdtempSync, mkdirSync, rmSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')

const {
  convertBibleDatabase,
  loadSqlRuntime,
} = require('../scripts/convert-bible.cjs')
const {
  validateDistributionBibles,
} = require('../scripts/validate-distribution-bibles.cjs')

function temporaryDirectory() {
  return mkdtempSync(join(__dirname, '.tmp-distribution-bibles-'))
}

async function writeBibleDatabase(path) {
  const SQL = await loadSqlRuntime()
  const database = new SQL.Database()
  try {
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
      INSERT INTO verses VALUES (1, 'TEST', 1, 1, 1, 'In the beginning', '1');
    `)
    writeFileSync(path, Buffer.from(database.export()))
  } finally {
    database.close()
  }
}

test('licensed distribution validation accepts marked .swbible packages', async context => {
  const root = temporaryDirectory()
  context.after(() => rmSync(root, { recursive: true, force: true }))
  const input = join(root, 'source.db')
  const directory = join(root, 'distribution-bibles')
  const output = join(directory, 'TEST.swbible')
  mkdirSync(directory)
  await writeBibleDatabase(input)
  await convertBibleDatabase(input, output)

  const result = await validateDistributionBibles(directory)
  assert.equal(result.packages.length, 1)
  assert.deepEqual(result.packages[0].versions, ['TEST'])
})

test('licensed distribution validation rejects an unmarked renamed database', async context => {
  const root = temporaryDirectory()
  context.after(() => rmSync(root, { recursive: true, force: true }))
  const directory = join(root, 'distribution-bibles')
  mkdirSync(directory)
  await writeBibleDatabase(join(directory, 'unmarked.swbible'))

  await assert.rejects(
    validateDistributionBibles(directory),
    /missing the SimpleWorship Bible identifier/i,
  )
})

test('licensed distribution validation requires at least one package', async context => {
  const directory = temporaryDirectory()
  context.after(() => rmSync(directory, { recursive: true, force: true }))
  await assert.rejects(validateDistributionBibles(directory), /No \.swbible files were found/)
})
