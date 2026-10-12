'use strict'

const { constants, copyFileSync, existsSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } = require('node:fs')
const { dirname, extname, join, resolve } = require('node:path')
const initSqlJs = require('sql.js')

const SWBIBLE_APPLICATION_ID = 0x53574249 // "SWBI"
const SWBIBLE_FORMAT_VERSION = 1
const MAX_INPUT_BYTES = 512 * 1024 * 1024

const REQUIRED_SCHEMA = {
  books: ['id', 'book_order', 'code', 'name', 'chapters'],
  verses: ['id', 'version', 'book_id', 'chapter', 'verse', 'text', 'display_verse'],
}

let sqlRuntimePromise

function loadSqlRuntime() {
  if (!sqlRuntimePromise) {
    const wasmPath = require.resolve('sql.js/dist/sql-wasm.wasm')
    sqlRuntimePromise = initSqlJs({ locateFile: () => wasmPath })
  }
  return sqlRuntimePromise
}

function scalar(database, query) {
  return database.exec(query)[0]?.values[0]?.[0]
}

function tableColumns(database, table) {
  const escaped = table.replace(/'/g, "''")
  const rows = database.exec(`PRAGMA table_info('${escaped}')`)[0]?.values ?? []
  return new Set(rows.map(row => String(row[1])))
}

function validateBibleSchema(database) {
  if (scalar(database, 'PRAGMA integrity_check') !== 'ok') {
    throw new Error('The input database failed SQLite integrity checking.')
  }

  const inputApplicationId = Number(scalar(database, 'PRAGMA application_id') ?? 0)
  if (inputApplicationId !== 0 && inputApplicationId !== SWBIBLE_APPLICATION_ID) {
    throw new Error('The input database belongs to a different application.')
  }

  for (const [table, requiredColumns] of Object.entries(REQUIRED_SCHEMA)) {
    const columns = tableColumns(database, table)
    const missing = requiredColumns.filter(column => !columns.has(column))
    if (missing.length > 0) {
      throw new Error(`The input database is missing ${table} column(s): ${missing.join(', ')}.`)
    }
  }

  const bookCount = Number(scalar(database, 'SELECT COUNT(*) FROM books') ?? 0)
  const verseCount = Number(scalar(database, 'SELECT COUNT(*) FROM verses') ?? 0)
  if (bookCount < 1 || verseCount < 1) {
    throw new Error('The input database does not contain Bible books and verses.')
  }

  const invalidBookCount = Number(scalar(database, `
    SELECT COUNT(*) FROM books
    WHERE typeof(id) <> 'integer' OR id < 1
       OR typeof(book_order) <> 'integer' OR book_order < 1
       OR typeof(chapters) <> 'integer' OR chapters < 1
       OR typeof(code) <> 'text'
       OR TRIM(COALESCE(code, '')) = ''
       OR typeof(name) <> 'text'
       OR TRIM(COALESCE(name, '')) = ''
  `) ?? 0)
  if (invalidBookCount > 0) {
    throw new Error(`The input database contains ${invalidBookCount} invalid Bible book record(s).`)
  }

  const duplicateBookCount = Number(scalar(database, `
    SELECT COUNT(*) FROM (
      SELECT id FROM books GROUP BY id HAVING COUNT(*) > 1
      UNION ALL
      SELECT book_order FROM books GROUP BY book_order HAVING COUNT(*) > 1
      UNION ALL
      SELECT code FROM books GROUP BY code HAVING COUNT(*) > 1
      UNION ALL
      SELECT name FROM books GROUP BY name HAVING COUNT(*) > 1
    )
  `) ?? 0)
  if (duplicateBookCount > 0) {
    throw new Error('The input database contains duplicate Bible book id, order, code, or name values.')
  }

  const invalidVerseCount = Number(scalar(database, `
    SELECT COUNT(*) FROM verses
    WHERE typeof(id) <> 'integer' OR id < 1
       OR typeof(book_id) <> 'integer' OR book_id < 1
       OR typeof(chapter) <> 'integer' OR chapter < 1
       OR typeof(verse) <> 'integer' OR verse < 1
       OR typeof(version) <> 'text'
       OR TRIM(COALESCE(version, '')) = ''
       OR version <> TRIM(version)
       OR typeof(text) <> 'text'
       OR TRIM(COALESCE(text, '')) = ''
  `) ?? 0)
  if (invalidVerseCount > 0) {
    throw new Error(`The input database contains ${invalidVerseCount} invalid Bible verse record(s).`)
  }

  const duplicateVerseCount = Number(scalar(database, `
    SELECT COUNT(*) FROM (
      SELECT id, NULL AS book_id, NULL AS chapter, NULL AS verse
      FROM verses
      GROUP BY id
      HAVING COUNT(*) > 1
      UNION ALL
      SELECT version, book_id, chapter, verse
      FROM verses
      GROUP BY version, book_id, chapter, verse
      HAVING COUNT(*) > 1
    )
  `) ?? 0)
  if (duplicateVerseCount > 0) {
    throw new Error('The input database contains duplicate Bible verse ids or references.')
  }

  const orphanedVerseCount = Number(scalar(database, `
    SELECT COUNT(*)
    FROM verses AS v
    LEFT JOIN books AS b ON b.id = v.book_id
    WHERE b.id IS NULL
  `) ?? 0)
  if (orphanedVerseCount > 0) {
    throw new Error(`The input database contains ${orphanedVerseCount} verse record(s) with no matching book.`)
  }

  const outOfRangeChapterCount = Number(scalar(database, `
    SELECT COUNT(*)
    FROM verses AS v
    JOIN books AS b ON b.id = v.book_id
    WHERE v.chapter > b.chapters
  `) ?? 0)
  if (outOfRangeChapterCount > 0) {
    throw new Error(`The input database contains ${outOfRangeChapterCount} verse record(s) outside the book chapter range.`)
  }

  const versionRows = database.exec(
    'SELECT DISTINCT TRIM(version) FROM verses WHERE TRIM(version) <> \'\' ORDER BY TRIM(version)'
  )[0]?.values ?? []
  const versions = versionRows.map(row => String(row[0]))
  if (versions.length < 1) throw new Error('The input database has no Bible version identifier.')

  return { bookCount, verseCount, versions }
}

function safeVersionFilename(version) {
  let safe = version
    .trim()
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(safe)) {
    safe = `Bible-${safe}`
  }
  return safe || 'Bible'
}

function defaultOutputPath(inputPath, versions) {
  if (versions.length !== 1) {
    throw new Error('Databases containing multiple Bible versions require an explicit output filename.')
  }
  const name = safeVersionFilename(versions[0])
  return join(dirname(inputPath), `${name}.swbible`)
}

function writeAtomically(outputPath, bytes, replaceExisting) {
  const temporaryPath = `${outputPath}.tmp-${process.pid}-${Date.now()}`
  const previousPath = `${outputPath}.previous-${process.pid}-${Date.now()}`
  let previousMoved = false
  try {
    writeFileSync(temporaryPath, bytes, { flag: 'wx' })
    if (!replaceExisting) {
      try {
        copyFileSync(temporaryPath, outputPath, constants.COPYFILE_EXCL)
      } catch (error) {
        if (error && error.code === 'EEXIST') {
          throw new Error(`Output already exists: ${outputPath}. Use --force to replace it.`)
        }
        throw error
      }
      try { unlinkSync(temporaryPath) } catch {}
      return
    }
    if (replaceExisting && existsSync(outputPath)) {
      renameSync(outputPath, previousPath)
      previousMoved = true
    }
    renameSync(temporaryPath, outputPath)
    if (previousMoved) {
      try { unlinkSync(previousPath) } catch {}
    }
  } catch (error) {
    try { if (existsSync(temporaryPath)) unlinkSync(temporaryPath) } catch {}
    try {
      if (previousMoved && !existsSync(outputPath) && existsSync(previousPath)) {
        renameSync(previousPath, outputPath)
      }
    } catch {}
    throw error
  }
}

async function convertBibleDatabase(input, requestedOutput, { force = false } = {}) {
  const inputPath = resolve(input)
  if (extname(inputPath).toLowerCase() !== '.db') {
    throw new Error('The input file must use the .db extension.')
  }
  if (!existsSync(inputPath) || !statSync(inputPath).isFile()) {
    throw new Error(`Input database not found: ${inputPath}`)
  }
  for (const suffix of ['-wal', '-journal']) {
    const journalPath = `${inputPath}${suffix}`
    if (existsSync(journalPath) && statSync(journalPath).size > 0) {
      throw new Error(`Refusing to convert while a non-empty SQLite journal file exists: ${journalPath}`)
    }
  }
  if (statSync(inputPath).size > MAX_INPUT_BYTES) {
    throw new Error('The input database is larger than the 512 MB safety limit.')
  }

  const inputBytes = readFileSync(inputPath)
  const sqliteHeader = Buffer.from('SQLite format 3\0', 'binary')
  if (inputBytes.length < sqliteHeader.length || !inputBytes.subarray(0, sqliteHeader.length).equals(sqliteHeader)) {
    throw new Error('The input file is not a SQLite 3 database.')
  }

  const SQL = await loadSqlRuntime()
  let database
  try {
    database = new SQL.Database(inputBytes)
    const summary = validateBibleSchema(database)
    const outputPath = resolve(requestedOutput || defaultOutputPath(inputPath, summary.versions))
    if (extname(outputPath).toLowerCase() !== '.swbible') {
      throw new Error('The output file must use the .swbible extension.')
    }
    if (existsSync(outputPath)) {
      if (!force) throw new Error(`Output already exists: ${outputPath}. Use --force to replace it.`)
    }

    database.run(`PRAGMA application_id = ${SWBIBLE_APPLICATION_ID}`)
    database.run(`PRAGMA user_version = ${SWBIBLE_FORMAT_VERSION}`)

    const outputBytes = Buffer.from(database.export())
    const verificationDatabase = new SQL.Database(outputBytes)
    try {
      const verified = validateBibleSchema(verificationDatabase)
      if (Number(scalar(verificationDatabase, 'PRAGMA application_id')) !== SWBIBLE_APPLICATION_ID) {
        throw new Error('The converted file is missing its SimpleWorship Bible identifier.')
      }
      if (Number(scalar(verificationDatabase, 'PRAGMA user_version')) !== SWBIBLE_FORMAT_VERSION) {
        throw new Error('The converted file has an unexpected format version.')
      }
      if (verified.bookCount !== summary.bookCount || verified.verseCount !== summary.verseCount) {
        throw new Error('The converted file did not preserve all Bible records.')
      }
    } finally {
      verificationDatabase.close()
    }

    writeAtomically(outputPath, outputBytes, force)
    return { inputPath, outputPath, ...summary, bytes: outputBytes.length }
  } catch (error) {
    if (error instanceof Error) throw error
    throw new Error(String(error))
  } finally {
    if (database) {
      try { database.close() } catch {}
    }
  }
}

function usage() {
  return [
    'Usage: npm run bible:convert -- <input.db> [output.swbible] [--force]',
    '',
    'If output is omitted, a single-version database is named after its version',
    '(for example RTPV05.swbible). Existing output is never replaced unless',
    '--force is provided.',
  ].join('\n')
}

async function main(argv) {
  const force = argv.includes('--force')
  const positional = argv.filter(argument => argument !== '--force')
  if (positional.length < 1 || positional.length > 2) {
    throw new Error(usage())
  }
  const result = await convertBibleDatabase(positional[0], positional[1], { force })
  process.stdout.write([
    `Created ${result.outputPath}`,
    `Versions: ${result.versions.join(', ')}`,
    `Books: ${result.bookCount}`,
    `Verses: ${result.verseCount}`,
    `Bytes: ${result.bytes}`,
  ].join('\n') + '\n')
}

module.exports = {
  SWBIBLE_APPLICATION_ID,
  SWBIBLE_FORMAT_VERSION,
  convertBibleDatabase,
  loadSqlRuntime,
  validateBibleSchema,
}

if (require.main === module) {
  main(process.argv.slice(2)).catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
