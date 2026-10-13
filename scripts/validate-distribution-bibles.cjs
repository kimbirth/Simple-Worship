'use strict'

const { existsSync, readFileSync, readdirSync, statSync } = require('node:fs')
const { extname, resolve } = require('node:path')
const {
  SWBIBLE_APPLICATION_ID,
  SWBIBLE_FORMAT_VERSION,
  loadSqlRuntime,
  validateBibleSchema,
} = require('./convert-bible.cjs')

const MAX_PACKAGE_BYTES = 512 * 1024 * 1024

function scalar(database, query) {
  return database.exec(query)[0]?.values[0]?.[0]
}

function distributionBibleFiles(directory) {
  if (!existsSync(directory) || !statSync(directory).isDirectory()) return []
  return readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isFile() && extname(entry.name).toLowerCase() === '.swbible')
    .map(entry => resolve(directory, entry.name))
    .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }))
}

async function inspectDistributionBible(path) {
  if (statSync(path).size > MAX_PACKAGE_BYTES) {
    throw new Error(`${path} exceeds the 512 MB package limit.`)
  }
  const bytes = readFileSync(path)
  const sqliteHeader = Buffer.from('SQLite format 3\0', 'binary')
  if (bytes.length < sqliteHeader.length || !bytes.subarray(0, sqliteHeader.length).equals(sqliteHeader)) {
    throw new Error(`${path} is not a SQLite Bible package.`)
  }

  const SQL = await loadSqlRuntime()
  const database = new SQL.Database(bytes)
  try {
    const summary = validateBibleSchema(database)
    if (Number(scalar(database, 'PRAGMA application_id')) !== SWBIBLE_APPLICATION_ID) {
      throw new Error(`${path} is missing the SimpleWorship Bible identifier.`)
    }
    if (Number(scalar(database, 'PRAGMA user_version')) !== SWBIBLE_FORMAT_VERSION) {
      throw new Error(`${path} uses an unsupported Bible package format.`)
    }
    return { path, ...summary, bytes: bytes.length }
  } finally {
    database.close()
  }
}

async function validateDistributionBibles(requestedDirectory = 'distribution-bibles') {
  const directory = resolve(requestedDirectory)
  const files = distributionBibleFiles(directory)
  if (!files.length) {
    throw new Error(`No .swbible files were found in ${directory}.`)
  }
  const packages = []
  for (const path of files) packages.push(await inspectDistributionBible(path))
  return { directory, packages }
}

module.exports = {
  distributionBibleFiles,
  inspectDistributionBible,
  validateDistributionBibles,
}

if (require.main === module) {
  validateDistributionBibles(process.argv[2])
    .then(result => {
      for (const pkg of result.packages) {
        process.stdout.write(
          `Validated ${pkg.path} (${pkg.versions.join(', ')}; ${pkg.bookCount} books; ${pkg.verseCount} verses)\n`,
        )
      }
    })
    .catch(error => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
      process.exitCode = 1
    })
}
