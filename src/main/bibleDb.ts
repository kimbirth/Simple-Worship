import { app } from 'electron'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'fs'
import { basename, extname, join } from 'path'
import type { Database } from 'sql.js'
import { getSetting, getSQLRuntime, setSetting } from './db'
import { cleanMergedVerseText } from './bibleText'
import {
  biblePackageId,
  bibleTranslationId,
  installedBiblePackageName,
} from './bibleLibraryIdentity'

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

export interface BibleTranslationInfo {
  id: string
  packageId: string
  packageName: string
  version: string
}

export interface BundledBiblePackageInfo {
  id: string
  name: string
  versions: string[]
}

export interface BibleLibraryState {
  translations: BibleTranslationInfo[]
  activeTranslationId: string | null
  bundledCandidates: BundledBiblePackageInfo[]
  requiresImport: boolean
}

export interface BiblePackageResult {
  installed: boolean
  name: string
  versions: string[]
  activeTranslationId: string | null
}

interface InspectedBiblePackage {
  packageId: string
  name: string
  path: string
  versions: string[]
}

interface InstalledBibleTranslation extends BibleTranslationInfo {
  path: string
}

const SWBIBLE_APPLICATION_ID = 0x53574249 // "SWBI"
const SWBIBLE_FORMAT_VERSION = 1
const MAX_PACKAGE_BYTES = 512 * 1024 * 1024
const ACTIVE_TRANSLATION_SETTING = 'active_bible_translation_id'
const REQUIRED_SCHEMA: Record<string, string[]> = {
  books: ['id', 'book_order', 'code', 'name', 'chapters'],
  verses: ['id', 'version', 'book_id', 'chapter', 'verse', 'text', 'display_verse'],
}

let bibleDb: Database | null = null
let installedPackages: InspectedBiblePackage[] = []
let translations: InstalledBibleTranslation[] = []
let activeTranslationId: string | null = null

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

  const invalidVersionCount = Number(scalar(database, `
    SELECT COUNT(*) FROM verses
    WHERE typeof(version) <> 'text'
       OR TRIM(COALESCE(version, '')) = ''
       OR version <> TRIM(version)
  `) ?? 0)
  if (invalidVersionCount > 0) {
    throw new Error('The Bible package contains an invalid version identifier.')
  }

  const rows = database.exec(
    'SELECT DISTINCT version FROM verses ORDER BY version COLLATE NOCASE'
  )[0]?.values ?? []
  const versions = rows.map(row => String(row[0]))
  if (versions.length < 1) throw new Error('The Bible package has no version identifier.')
  return versions
}

function installedBibleDirectory(): string {
  return join(app.getPath('userData'), 'bibles')
}

function bundledBibleDirectory(): string {
  if (app.isPackaged) return join(process.resourcesPath, 'bibles')
  return join(__dirname, '../..', 'distribution-bibles')
}

function packageFiles(directory: string): string[] {
  if (!existsSync(directory)) return []
  try {
    return readdirSync(directory, { withFileTypes: true })
      .filter(entry => entry.isFile() && extname(entry.name).toLowerCase() === '.swbible')
      .map(entry => join(directory, entry.name))
      .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }))
  } catch {
    return []
  }
}

function readPackageBytes(path: string): Buffer {
  if (extname(path).toLowerCase() !== '.swbible') {
    throw new Error('Select a file with the .swbible extension.')
  }
  if (!existsSync(path)) {
    throw new Error('The selected Bible package could not be found.')
  }
  const fileStat = statSync(path)
  if (!fileStat.isFile()) {
    throw new Error('The selected Bible package could not be found.')
  }
  if (fileStat.size > MAX_PACKAGE_BYTES) {
    throw new Error('The selected Bible package exceeds the 512 MB safety limit.')
  }

  const bytes = readFileSync(path)
  if (bytes.length > MAX_PACKAGE_BYTES) {
    throw new Error('The selected Bible package exceeds the 512 MB safety limit.')
  }
  const sqliteHeader = Buffer.from('SQLite format 3\0', 'binary')
  if (bytes.length < sqliteHeader.length || !bytes.subarray(0, sqliteHeader.length).equals(sqliteHeader)) {
    throw new Error('The selected file is not a SQLite Bible package.')
  }
  return bytes
}

function inspectBiblePackage(
  path: string,
  bytes: Buffer = readPackageBytes(path),
): InspectedBiblePackage {
  const database = new (getSQLRuntime()).Database(bytes)
  let versions: string[]
  try {
    versions = validateBiblePackage(database)
  } finally {
    database.close()
  }
  return {
    packageId: biblePackageId(bytes),
    name: basename(path),
    path,
    versions,
  }
}

function translationForPackage(
  pkg: InspectedBiblePackage,
  version: string,
): InstalledBibleTranslation {
  return {
    id: bibleTranslationId(pkg.packageId, version),
    packageId: pkg.packageId,
    packageName: pkg.name,
    version,
    path: pkg.path,
  }
}

function scanBundledPackages(): InspectedBiblePackage[] {
  const seen = new Set<string>()
  const candidates: InspectedBiblePackage[] = []
  for (const path of packageFiles(bundledBibleDirectory())) {
    try {
      const candidate = inspectBiblePackage(path)
      if (seen.has(candidate.packageId)) continue
      seen.add(candidate.packageId)
      candidates.push(candidate)
    } catch {
      // Invalid distribution files are never offered to the renderer.
    }
  }
  return candidates
}

function activateTranslation(id: string, persist: boolean): boolean {
  const next = translations.find(translation => translation.id === id)
  if (!next) return false

  if (!bibleDb || translations.find(item => item.id === activeTranslationId)?.path !== next.path) {
    const nextDatabase = new (getSQLRuntime()).Database(readPackageBytes(next.path))
    try {
      validateBiblePackage(nextDatabase)
    } catch (error) {
      nextDatabase.close()
      throw error
    }
    bibleDb?.close()
    bibleDb = nextDatabase
  }

  activeTranslationId = next.id
  if (persist) setSetting(ACTIVE_TRANSLATION_SETTING, next.id)
  return true
}

/** Scans every installed package, then restores the previously selected
 *  translation. Bundled packages are intentionally not opened until the user
 *  imports one during first-run setup or from the Bible tab. */
export async function initBibleDb(): Promise<boolean> {
  bibleDb?.close()
  bibleDb = null
  activeTranslationId = null
  installedPackages = []
  translations = []

  const seen = new Set<string>()
  for (const path of packageFiles(installedBibleDirectory())) {
    try {
      const pkg = inspectBiblePackage(path)
      if (seen.has(pkg.packageId)) continue
      seen.add(pkg.packageId)
      installedPackages.push(pkg)
      translations.push(...pkg.versions.map(version => translationForPackage(pkg, version)))
    } catch {
      // Leave damaged or incompatible packages untouched so they can be
      // inspected/recovered, but never expose their contents in the app.
    }
  }

  translations.sort((left, right) =>
    left.version.localeCompare(right.version, undefined, { sensitivity: 'base' }) ||
    left.packageName.localeCompare(right.packageName, undefined, { sensitivity: 'base' }))

  if (!translations.length) {
    setSetting(ACTIVE_TRANSLATION_SETTING, '')
    return false
  }

  const saved = getSetting(ACTIVE_TRANSLATION_SETTING)
  const preferred = translations.some(translation => translation.id === saved)
    ? saved
    : translations[0].id
  activateTranslation(preferred, true)
  return true
}

export function getBibleLibraryState(): BibleLibraryState {
  const bundledCandidates = scanBundledPackages().map(candidate => ({
    id: candidate.packageId,
    name: candidate.name,
    versions: candidate.versions,
  }))
  return {
    translations: translations.map(({ path: _path, ...translation }) => translation),
    activeTranslationId,
    bundledCandidates,
    requiresImport: translations.length === 0,
  }
}

export function selectBibleTranslation(id: string): BibleLibraryState {
  if (typeof id !== 'string' || !activateTranslation(id, true)) {
    throw new Error('The selected Bible translation is no longer installed.')
  }
  return getBibleLibraryState()
}

/** Validates and installs a user-selected package into the per-user app-data
 *  library. Files are content-addressed, so imports never overwrite another
 *  Bible and importing the same bytes again is idempotent. */
export async function installBiblePackage(sourcePath: string): Promise<BiblePackageResult> {
  // Read once so validation, identity, and the installed copy always describe
  // exactly the same bytes even if the source lives in a synced folder.
  const sourceBytes = readPackageBytes(sourcePath)
  const inspected = inspectBiblePackage(sourcePath, sourceBytes)
  const existing = installedPackages.find(pkg => pkg.packageId === inspected.packageId)
  if (!existing) {
    const directory = installedBibleDirectory()
    const destination = join(directory, installedBiblePackageName(inspected))
    const temporary = `${destination}.tmp-${process.pid}-${Date.now()}`
    mkdirSync(directory, { recursive: true })
    try {
      writeFileSync(temporary, sourceBytes, { flag: 'wx' })
      if (!existsSync(destination)) renameSync(temporary, destination)
      else unlinkSync(temporary)
    } catch (error) {
      try { if (existsSync(temporary)) unlinkSync(temporary) } catch {}
      throw error
    }

    if (!await initBibleDb()) {
      try { if (existsSync(destination)) unlinkSync(destination) } catch {}
      await initBibleDb()
      throw new Error('The Bible package was copied but could not be loaded.')
    }
  }

  const installed = installedPackages.find(pkg => pkg.packageId === inspected.packageId)
  const firstTranslation = translations.find(item => item.packageId === inspected.packageId)
  if (!installed || !firstTranslation || !activateTranslation(firstTranslation.id, true)) {
    throw new Error('The Bible package was installed but could not be selected.')
  }
  return {
    installed: true,
    name: basename(sourcePath),
    versions: inspected.versions,
    activeTranslationId: firstTranslation.id,
  }
}

export async function installBundledBiblePackage(candidateId: string): Promise<BiblePackageResult> {
  const candidate = scanBundledPackages().find(item => item.packageId === candidateId)
  if (!candidate) throw new Error('The included Bible package is no longer available.')
  return installBiblePackage(candidate.path)
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

export function getBibleVerses(bookId: number, chapter: number): DbBibleVerse[] {
  if (!bibleDb || !activeTranslationId) return []
  const active = translations.find(translation => translation.id === activeTranslationId)
  if (!active) return []
  const stmt = bibleDb.prepare(
    'SELECT id, verse, text, display_verse FROM verses WHERE book_id = ? AND chapter = ? AND version = ? ORDER BY verse ASC'
  )
  stmt.bind([bookId, chapter, active.version])
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
