import { app } from 'electron'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'fs'
import { basename, extname, join } from 'path'
import type { Database } from 'sql.js'
import { getSQLRuntime } from './db'
import { cleanMergedVerseText } from './bibleText'

export interface DbBibleBook {
  id: number
  book_order: number
  code: string
  name: string
  chapters: number
}

export interface DbBibleVerse {
  id: number
  verse: number
  text: string
  display_verse: string
}

export interface BiblePackageResult {
  installed: boolean
  name: string
  versions: string[]
}

const SWBIBLE_APPLICATION_ID = 0x53574249 // "SWBI"
const SWBIBLE_FORMAT_VERSION = 1
const MAX_PACKAGE_BYTES = 512 * 1024 * 1024
const REQUIRED_SCHEMA: Record<string, string[]> = {
  books: ['id', 'book_order', 'code', 'name', 'chapters'],
  verses: ['id', 'version', 'book_id', 'chapter', 'verse', 'text', 'display_verse'],
}

let bibleDb: Database | null = null

function scalar(database: Database, query: string): unknown {
  return database.exec(query)[0]?.values[0]?.[0]
}

function tableColumns(database: Database, table: string): Set<string> {
  const rows = database.exec(`PRAGMA table_info('${table}')`)[0]?.values ?? []
  return new Set(rows.map(row => String(row[1])))
}

function validateBiblePackage(database: Database): string[] {
  if (scalar(database, 'PRAGMA integrity_check') !== 'ok') {
    throw new Error('The Bible package failed its integrity check.')
  }
  if (Number(scalar(database, 'PRAGMA application_id') ?? 0) !== SWBIBLE_APPLICATION_ID) {
    throw new Error('This is not a SimpleWorship Bible package.')
  }
  if (Number(scalar(database, 'PRAGMA user_version') ?? 0) !== SWBIBLE_FORMAT_VERSION) {
    throw new Error('This Bible package uses an unsupported format version.')
  }

  for (const [table, requiredColumns] of Object.entries(REQUIRED_SCHEMA)) {
    const columns = tableColumns(database, table)
    if (!requiredColumns.every(column => columns.has(column))) {
      throw new Error(`The Bible package has an incompatible ${table} table.`)
    }
  }

  if (Number(scalar(database, 'SELECT COUNT(*) FROM books') ?? 0) < 1 ||
      Number(scalar(database, 'SELECT COUNT(*) FROM verses') ?? 0) < 1) {
    throw new Error('The Bible package contains no books or verses.')
  }

  const rows = database.exec(
    "SELECT DISTINCT TRIM(version) FROM verses WHERE TRIM(version) <> '' ORDER BY TRIM(version)"
  )[0]?.values ?? []
  const versions = rows.map(row => String(row[0]))
  if (versions.length < 1) throw new Error('The Bible package has no version identifier.')
  return versions
}

function installedBiblePath(): string {
  return join(app.getPath('userData'), 'bibles', 'active.swbible')
}

function candidateBiblePaths(): string[] {
  const basePath = app.isPackaged ? process.resourcesPath : join(__dirname, '../..')
  return [
    installedBiblePath(),
    // Optional local/development package. Official open-source builds do not
    // bundle copyrighted Bible text.
    join(basePath, 'RTPV05.swbible'),
  ]
}

/** Loads the first valid Bible package read-only. The app remains usable when
 *  no package is installed; the Bible tab then offers an import action. */
export async function initBibleDb(): Promise<boolean> {
  bibleDb?.close()
  bibleDb = null
  const runtime = getSQLRuntime()

  for (const path of candidateBiblePaths()) {
    if (!existsSync(path)) continue
    let database: Database | null = null
    try {
      database = new runtime.Database(readFileSync(path))
      validateBiblePackage(database)
      bibleDb = database
      return true
    } catch {
      database?.close()
    }
  }
  return false
}

/** Validates and installs a user-selected package into the per-user app-data
 *  directory. The source file is never changed. */
export async function installBiblePackage(sourcePath: string): Promise<BiblePackageResult> {
  if (extname(sourcePath).toLowerCase() !== '.swbible') {
    throw new Error('Select a file with the .swbible extension.')
  }
  if (!existsSync(sourcePath) || !statSync(sourcePath).isFile()) {
    throw new Error('The selected Bible package could not be found.')
  }
  if (statSync(sourcePath).size > MAX_PACKAGE_BYTES) {
    throw new Error('The selected Bible package exceeds the 512 MB safety limit.')
  }

  const bytes = readFileSync(sourcePath)
  const sqliteHeader = Buffer.from('SQLite format 3\0', 'binary')
  if (bytes.length < sqliteHeader.length || !bytes.subarray(0, sqliteHeader.length).equals(sqliteHeader)) {
    throw new Error('The selected file is not a SQLite Bible package.')
  }

  const runtime = getSQLRuntime()
  const validationDatabase = new runtime.Database(bytes)
  let versions: string[]
  try {
    versions = validateBiblePackage(validationDatabase)
  } finally {
    validationDatabase.close()
  }

  const destination = installedBiblePath()
  const directory = join(app.getPath('userData'), 'bibles')
  const temporary = `${destination}.tmp-${process.pid}-${Date.now()}`
  const previous = `${destination}.previous-${process.pid}-${Date.now()}`
  let previousMoved = false
  mkdirSync(directory, { recursive: true })
  try {
    writeFileSync(temporary, bytes, { flag: 'wx' })
    if (existsSync(destination)) {
      renameSync(destination, previous)
      previousMoved = true
    }
    renameSync(temporary, destination)
    if (previousMoved) {
      try { unlinkSync(previous) } catch {}
    }
  } catch (error) {
    try { if (existsSync(temporary)) unlinkSync(temporary) } catch {}
    try {
      if (previousMoved && !existsSync(destination) && existsSync(previous)) {
        renameSync(previous, destination)
      }
    } catch {}
    throw error
  }

  if (!await initBibleDb()) {
    throw new Error('The Bible package was copied but could not be loaded.')
  }
  return { installed: true, name: basename(sourcePath), versions }
}

export function getBibleBooks(): DbBibleBook[] {
  if (!bibleDb) return []
  const result = bibleDb.exec('SELECT id, book_order, code, name, chapters FROM books ORDER BY book_order ASC')
  if (!result.length) return []
  return result[0].values.map(row => ({
    id: Number(row[0]),
    book_order: Number(row[1]),
    code: String(row[2]),
    name: String(row[3]),
    chapters: Number(row[4]),
  }))
}

export function getBibleVersions(): string[] {
  if (!bibleDb) return []
  const result = bibleDb.exec('SELECT DISTINCT version FROM verses ORDER BY version ASC')
  if (!result.length) return []
  return result[0].values.map(row => String(row[0]))
}

export function getBibleVerses(bookId: number, chapter: number, version: string): DbBibleVerse[] {
  if (!bibleDb) return []
  const stmt = bibleDb.prepare(
    'SELECT id, verse, text, display_verse FROM verses WHERE book_id = ? AND chapter = ? AND version = ? ORDER BY verse ASC'
  )
  stmt.bind([bookId, chapter, version])
  const rows: DbBibleVerse[] = []
  while (stmt.step()) {
    const r = stmt.getAsObject() as Record<string, unknown>
    const displayVerse = String(r.display_verse ?? r.verse ?? '')
    rows.push({
      id: Number(r.id),
      verse: Number(r.verse),
      text: cleanMergedVerseText(String(r.text ?? ''), displayVerse),
      display_verse: displayVerse,
    })
  }
  stmt.free()
  return rows
}
