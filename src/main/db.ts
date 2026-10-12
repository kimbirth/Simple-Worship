import { app } from 'electron'
import { createHash } from 'crypto'
import { dirname, join } from 'path'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'fs'
import type { Database, SqlJsStatic } from 'sql.js'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const initSqlJs: (config?: object) => Promise<SqlJsStatic> = require('sql.js')

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DbSong {
  id: number
  title: string
  artist: string
  lyrics_raw: string
  bg_type: string
  bg_value: string
}

export interface DbMedia {
  id: number
  filename: string
  filepath: string
  type: string
}

export interface DbSetting {
  key: string
  value: string
}

export interface DatabaseStartupStatus {
  recoveredFromBackup: boolean
  recoveredBackup?: string
  corruptCopy?: string
  upgradedFrom?: string   // previous version, if this launch is the first run after an install/update
  upgradeBackup?: string  // path to the automatic backup taken right before the upgrade was detected
}

export interface BackupStatus {
  directory: string
  count: number
  latestAt: string | null
}

// ─── DB Singleton ─────────────────────────────────────────────────────────────

let db: Database | null = null
let dbPath: string = ''
let SQLRuntime: SqlJsStatic | null = null
let lastAutomaticBackupAt = 0

const AUTOMATIC_BACKUP_INTERVAL_MS = 30 * 60 * 1000
const AUTOMATIC_BACKUP_LIMIT = 12
const CURRENT_SCHEMA_VERSION = 1

const REQUIRED_SCHEMA: Record<string, readonly string[]> = {
  songs: ['id', 'title', 'artist', 'lyrics_raw', 'bg_type', 'bg_value'],
  media: ['id', 'filename', 'filepath', 'type'],
  settings: ['key', 'value'],
}

const MIGRATABLE_SCHEMA: Record<string, readonly string[]> = {
  songs: ['id', 'title'],
  media: ['id', 'filename', 'filepath'],
  settings: ['key'],
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
}

function getBackupDirectory(): string {
  const directory = join(app.getPath('userData'), 'backups')
  if (!existsSync(directory)) mkdirSync(directory, { recursive: true })
  return directory
}

function automaticBackupFiles(): string[] {
  const directory = getBackupDirectory()
  return readdirSync(directory)
    .filter(name => name.endsWith('.swb') || name.endsWith('.simpleworship-backup'))
    .map(name => join(directory, name))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
}

function fileFingerprint(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex')
}

function pruneAutomaticBackups(): void {
  const seen = new Set<string>()
  let retained = 0
  for (const file of automaticBackupFiles()) {
    try {
      const fingerprint = fileFingerprint(file)
      if (seen.has(fingerprint) || retained >= AUTOMATIC_BACKUP_LIMIT) {
        unlinkSync(file)
        continue
      }
      seen.add(fingerprint)
      retained += 1
    } catch {
      // A backup may disappear between listing and inspection. It should not
      // prevent normal application startup or writes.
    }
  }
}

function createAutomaticBackup(reason: 'automatic' | 'startup' | 'pre-restore' | 'upgrade'): string | null {
  if (!dbPath || !existsSync(dbPath)) return null
  const sourceFingerprint = fileFingerprint(dbPath)
  const duplicate = automaticBackupFiles().find(file => {
    try { return fileFingerprint(file) === sourceFingerprint } catch { return false }
  })
  if (duplicate) {
    lastAutomaticBackupAt = Date.now()
    pruneAutomaticBackups()
    return duplicate
  }
  const target = join(getBackupDirectory(), `${reason}-${timestamp()}.swb`)
  copyFileSync(dbPath, target)
  lastAutomaticBackupAt = Date.now()
  pruneAutomaticBackups()
  return target
}

function maybeCreateAutomaticBackup(): void {
  if (Date.now() - lastAutomaticBackupAt < AUTOMATIC_BACKUP_INTERVAL_MS) return
  createAutomaticBackup('automatic')
}

function userVersion(database: Database): number {
  const value = database.exec('PRAGMA user_version')[0]?.values[0]?.[0]
  return typeof value === 'number' ? value : Number(value) || 0
}

function tableColumns(database: Database, table: string): Set<string> {
  const escaped = table.replace(/'/g, "''")
  const rows = database.exec(`PRAGMA table_info('${escaped}')`)[0]?.values ?? []
  return new Set(rows.map(row => String(row[1])))
}

function schemaHasColumns(database: Database, schema: Record<string, readonly string[]>): boolean {
  for (const [table, requiredColumns] of Object.entries(schema)) {
    const columns = tableColumns(database, table)
    if (!requiredColumns.every(column => columns.has(column))) return false
  }
  return true
}

type SchemaRequirement = 'none' | 'migratable' | 'current'

function databaseIsHealthy(database: Database, schemaRequirement: SchemaRequirement = 'none'): boolean {
  try {
    const integrity = database.exec('PRAGMA integrity_check')
    if (integrity[0]?.values[0]?.[0] !== 'ok') return false
    if (schemaRequirement === 'none') return true
    if (userVersion(database) > CURRENT_SCHEMA_VERSION) return false
    return schemaHasColumns(
      database,
      schemaRequirement === 'current' ? REQUIRED_SCHEMA : MIGRATABLE_SCHEMA,
    )
  } catch {
    return false
  }
}

function openHealthyDatabase(
  buffer: Buffer,
  schemaRequirement: SchemaRequirement = 'none',
): Database | null {
  if (!SQLRuntime) return null
  let candidate: Database | null = null
  try {
    candidate = new SQLRuntime.Database(buffer)
    if (!databaseIsHealthy(candidate, schemaRequirement)) {
      candidate.close()
      return null
    }
    return candidate
  } catch {
    candidate?.close()
    return null
  }
}

function openMigratedDatabase(buffer: Buffer): Database | null {
  const candidate = openHealthyDatabase(buffer, 'migratable')
  if (!candidate) return null
  try {
    migrateDatabase(candidate)
    if (!databaseIsHealthy(candidate, 'current')) throw new Error('Database schema validation failed.')
    return candidate
  } catch {
    candidate.close()
    return null
  }
}

function migrateLegacyDatabase(targetPath: string): void {
  if (existsSync(targetPath)) return
  const appData = app.getPath('appData')
  const candidates = [
    join(dirname(targetPath), 'worship.db'),
    join(appData, 'WorshipPresenter', 'worship.db'),
    join(appData, 'worship-presenter', 'worship.db'),
  ]
  const source = candidates.find(candidate => candidate !== targetPath && existsSync(candidate))
  if (source) copyFileSync(source, targetPath)
}

export async function initDb(): Promise<DatabaseStartupStatus> {
  // sql.js needs the .wasm file - locate it in node_modules
  const sqlJsPath = require.resolve('sql.js')
  const wasmPath  = sqlJsPath.replace(/sql-wasm\.js$/, 'sql-wasm.wasm')
  SQLRuntime = await initSqlJs({ locateFile: () => wasmPath })

  const userDataPath = app.getPath('userData')
  if (!existsSync(userDataPath)) mkdirSync(userDataPath, { recursive: true })

  dbPath = join(userDataPath, 'simpleworship.db')
  migrateLegacyDatabase(dbPath)

  const status: DatabaseStartupStatus = { recoveredFromBackup: false }

  if (existsSync(dbPath)) {
    const fileBuffer = readFileSync(dbPath)
    db = openMigratedDatabase(fileBuffer)
    if (!db) {
      const corruptPath = join(userDataPath, `simpleworship-corrupt-${timestamp()}.db`)
      renameSync(dbPath, corruptPath)
      status.corruptCopy = corruptPath

      for (const backupPath of automaticBackupFiles()) {
        const recovered = openMigratedDatabase(readFileSync(backupPath))
        if (!recovered) continue
        db = recovered
        copyFileSync(backupPath, dbPath)
        status.recoveredFromBackup = true
        status.recoveredBackup = backupPath
        break
      }
    }
  } else {
    db = new SQLRuntime.Database()
  }

  if (!db) db = new SQLRuntime.Database()

  migrate()
  // First launch after an install/update: app.getVersion() differs from what
  // was recorded last time. Take a clearly-labeled backup immediately, before
  // anything else runs — a safety net on top of the fact that userData (this
  // whole folder) already isn't touched by the NSIS installer/uninstaller.
  const currentVersion = app.getVersion()
  const lastRunVersion = getSetting('last_run_version')
  if (lastRunVersion && lastRunVersion !== currentVersion) {
    status.upgradedFrom = lastRunVersion
    status.upgradeBackup = createAutomaticBackup('upgrade') ?? undefined
  }
  if (lastRunVersion !== currentVersion) setSetting('last_run_version', currentVersion)

  createAutomaticBackup('startup')
  return status
}

function getDb(): Database {
  if (!db) throw new Error('Database not initialized. Call initDb() first.')
  return db
}

/** Shared sql.js runtime, for other read-only databases (e.g. the bundled
 *  Bible database) to reuse instead of loading their own WASM instance. */
export function getSQLRuntime(): SqlJsStatic {
  if (!SQLRuntime) throw new Error('SQL runtime not initialized. Call initDb() first.')
  return SQLRuntime
}

/** Save database to disk — call after every write */
function persist(allowAutomaticBackup = true): void {
  if (!db || !dbPath) return
  if (allowAutomaticBackup) maybeCreateAutomaticBackup()
  const data = db.export()
  const tempPath = `${dbPath}.tmp`
  writeFileSync(tempPath, Buffer.from(data))
  renameSync(tempPath, dbPath)
}

// ─── Query Helpers ────────────────────────────────────────────────────────────

/** Run a SELECT and return all rows as plain objects */
function queryAll<T>(sql: string, params: (string | number | null)[] = []): T[] {
  const stmt = getDb().prepare(sql)
  stmt.bind(params)
  const rows: T[] = []
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as T)
  }
  stmt.free()
  return rows
}

/** Run a SELECT and return first row or undefined */
function queryOne<T>(sql: string, params: (string | number | null)[] = []): T | undefined {
  const rows = queryAll<T>(sql, params)
  return rows[0]
}

/** Run INSERT / UPDATE / DELETE — returns last insert rowid */
function run(sql: string, params: (string | number | null)[] = []): number {
  getDb().run(sql, params)
  persist()
  return (getDb().exec('SELECT last_insert_rowid()')[0]?.values[0]?.[0] as number) ?? 0
}

// ─── Migration ────────────────────────────────────────────────────────────────

function migrateDatabase(database: Database): void {
  const version = userVersion(database)
  if (version > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `Database version ${version} is newer than this SimpleWorship version supports.`,
    )
  }

  database.run('BEGIN TRANSACTION')
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS songs (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        title          TEXT    NOT NULL,
        artist         TEXT    NOT NULL DEFAULT '',
        lyrics_raw     TEXT    NOT NULL DEFAULT '',
        bg_type        TEXT    NOT NULL DEFAULT 'color',
        bg_value       TEXT    NOT NULL DEFAULT '#000000'
      );

      CREATE TABLE IF NOT EXISTS media (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        filename   TEXT NOT NULL,
        filepath   TEXT NOT NULL UNIQUE,
        type       TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL DEFAULT ''
      );
    `)

    const songColumns = tableColumns(database, 'songs')
    if (!songColumns.has('artist')) {
      database.run("ALTER TABLE songs ADD COLUMN artist TEXT NOT NULL DEFAULT ''")
    }
    if (!songColumns.has('lyrics_raw')) {
      database.run("ALTER TABLE songs ADD COLUMN lyrics_raw TEXT NOT NULL DEFAULT ''")
    }
    if (!songColumns.has('bg_type')) {
      database.run("ALTER TABLE songs ADD COLUMN bg_type TEXT NOT NULL DEFAULT 'color'")
    }
    if (!songColumns.has('bg_value')) {
      database.run("ALTER TABLE songs ADD COLUMN bg_value TEXT NOT NULL DEFAULT '#000000'")
    }

    const mediaColumns = tableColumns(database, 'media')
    if (!mediaColumns.has('type')) {
      database.run("ALTER TABLE media ADD COLUMN type TEXT NOT NULL DEFAULT 'video'")
    }

    const settingColumns = tableColumns(database, 'settings')
    if (!settingColumns.has('value')) {
      database.run("ALTER TABLE settings ADD COLUMN value TEXT NOT NULL DEFAULT ''")
    }

    database.run('CREATE UNIQUE INDEX IF NOT EXISTS media_filepath_unique ON media(filepath)')

    for (const [key, value] of [
      ['output_screen', ''],
      ['logo_media_id', ''],
      ['logo_path',     ''],
      ['logo_filename', ''],
      ['media_folder',  ''],
      ['fade_duration', '500'],
    ]) {
      database.run(
        'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
        [key, value],
      )
    }

    database.run(`PRAGMA user_version = ${CURRENT_SCHEMA_VERSION}`)
    database.run('COMMIT')
  } catch (error) {
    try { database.run('ROLLBACK') } catch {}
    throw error
  }
}

function migrate(): void {
  migrateDatabase(getDb())
  if (!databaseIsHealthy(getDb(), 'current')) {
    throw new Error('SimpleWorship database migration did not produce the expected schema.')
  }
  persist(false)
}

// ─── Songs ────────────────────────────────────────────────────────────────────

export function getAllSongs(): DbSong[] {
  return queryAll<DbSong>('SELECT id, title, artist, lyrics_raw, bg_type, bg_value FROM songs ORDER BY title')
}

export function searchSongs(query: string): DbSong[] {
  const q = `%${query}%`
  return queryAll<DbSong>(
    `SELECT id, title, artist, lyrics_raw, bg_type, bg_value
     FROM songs
     WHERE title LIKE ? OR artist LIKE ? OR lyrics_raw LIKE ?
     ORDER BY title`,
    [q, q, q]
  )
}

function getSongById(id: number): DbSong | undefined {
  return queryOne<DbSong>(
    'SELECT id, title, artist, lyrics_raw, bg_type, bg_value FROM songs WHERE id = ?',
    [id]
  )
}

export function insertSong(song: Omit<DbSong, 'id'>): DbSong {
  const id = run(
    `INSERT INTO songs
       (title, artist, lyrics_raw, bg_type, bg_value)
     VALUES (?, ?, ?, ?, ?)`,
    [
      song.title, song.artist, song.lyrics_raw, song.bg_type, song.bg_value,
    ]
  )
  return getSongById(id)!
}

export function updateSong(song: Partial<DbSong> & { id: number }): DbSong | undefined {
  const existing = getSongById(song.id)
  if (!existing) return undefined
  const m = { ...existing, ...song }
  run(
    `UPDATE songs SET
       title=?, artist=?, lyrics_raw=?, bg_type=?, bg_value=?
     WHERE id=?`,
    [
      m.title, m.artist, m.lyrics_raw, m.bg_type, m.bg_value,
      m.id,
    ]
  )
  return getSongById(song.id)
}

export function deleteSong(id: number): boolean {
  run('DELETE FROM songs WHERE id = ?', [id])
  return true
}

// ─── Media ────────────────────────────────────────────────────────────────────

export function getAllMedia(): DbMedia[] {
  return queryAll<DbMedia>('SELECT id, filename, filepath, type FROM media ORDER BY filename')
}

/** Replace an indexed folder in one transaction and persist only once. */
export function replaceAllMedia(items: Omit<DbMedia, 'id'>[], mediaFolder?: string): number {
  const database = getDb()
  database.run('BEGIN TRANSACTION')
  let statement: ReturnType<Database['prepare']> | null = null
  try {
    database.run('DELETE FROM media')
    statement = database.prepare(
      `INSERT INTO media (filename, filepath, type)
       VALUES (?, ?, ?)`
    )
    for (const item of items) {
      statement.run([item.filename, item.filepath, item.type])
    }
    statement.free()
    statement = null
    if (mediaFolder !== undefined) {
      database.run(
        'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        ['media_folder', mediaFolder],
      )
    }
    database.run('COMMIT')
    persist()
    return items.length
  } catch (error) {
    statement?.free()
    try { database.run('ROLLBACK') } catch {}
    throw error
  }
}

export function deleteMedia(id: number): boolean {
  run('DELETE FROM media WHERE id = ?', [id])
  return true
}

export function getMediaById(id: number): DbMedia | undefined {
  return queryOne<DbMedia>('SELECT id, filename, filepath, type FROM media WHERE id = ?', [id])
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export function getSetting(key: string): string {
  return queryOne<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key])?.value ?? ''
}

export function setSetting(key: string, value: string): void {
  getDb().run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value])
  persist()
}

export function getAllSettings(): Record<string, string> {
  const rows = queryAll<DbSetting>('SELECT key, value FROM settings')
  return Object.fromEntries(rows.map(r => [r.key, r.value]))
}

// ─── Backup / Recovery ────────────────────────────────────────────────────────

export function createDatabaseBackup(destination: string): string {
  if (!destination) throw new Error('A backup destination is required.')
  persist(false)
  const directory = dirname(destination)
  if (!existsSync(directory)) mkdirSync(directory, { recursive: true })
  copyFileSync(dbPath, destination)
  return destination
}

export function restoreDatabaseBackup(source: string): void {
  if (!SQLRuntime) throw new Error('Database runtime is not initialized.')
  const buffer = readFileSync(source)
  const candidate = openMigratedDatabase(buffer)
  if (!candidate) throw new Error('This is not a valid or supported SimpleWorship backup.')

  persist(false)
  createAutomaticBackup('pre-restore')
  const original = readFileSync(dbPath)
  const tempPath = `${dbPath}.restore`
  let replacedOnDisk = false

  try {
    writeFileSync(tempPath, Buffer.from(candidate.export()))
    renameSync(tempPath, dbPath)
    replacedOnDisk = true
    const previous = db
    previous?.close()
    db = candidate
  } catch (error) {
    if (db !== candidate) candidate.close()
    if (replacedOnDisk) writeFileSync(dbPath, original)
    try { if (existsSync(tempPath)) unlinkSync(tempPath) } catch {}
    throw error
  }
}

export function getBackupStatus(): BackupStatus {
  const files = automaticBackupFiles()
  return {
    directory: getBackupDirectory(),
    count: files.length,
    latestAt: files.length ? statSync(files[0]).mtime.toISOString() : null,
  }
}
