import { app, BrowserWindow, ipcMain, screen, shell, dialog } from 'electron'
import { basename, join, extname, isAbsolute, relative, resolve } from 'path'
import { MEDIA_SERVER_PORT, startMediaServer, stopMediaServer } from './mediaServer'
import { readFile, readdir, stat, writeFile } from 'fs/promises'
import {
  initDb,
  getAllSongs, searchSongs,
  insertSong, updateSong, deleteSong,
  getAllMedia, getMediaById, deleteMedia, replaceAllMedia,
  getAllSettings, getSetting, setSetting,
  createDatabaseBackup, restoreDatabaseBackup, getBackupStatus,
} from './db'
import {
  initBibleDb,
  installBiblePackage,
  getBibleBooks,
  getBibleVersions,
  getBibleVerses,
} from './bibleDb'

// ─── Register local:// BEFORE app is ready (required by Electron) ─────────────
// Disable throttling so canvases keep rendering when window loses focus
app.commandLine.appendSwitch('disable-background-timer-throttling')
app.commandLine.appendSwitch('disable-renderer-backgrounding')
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
// Native Window Occlusion (Windows) suspends compositing/painting for a
// window the OS considers fully covered — separate from the throttling
// switches above, and it's what actually freezes the output background
// when the window loses focus or gets covered by another window.
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')
app.setName('SimpleWorship')
app.setAppUserModelId('church.simpleworship.app')
const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) app.quit()

// ─── Window References ────────────────────────────────────────────────────────
let operatorWindow: BrowserWindow | null = null
let outputWindow:   BrowserWindow | null = null
let lastScene: unknown = null
let lastFadeDuration = 500
let lastLogoPath = ''
let lastDefaultBg: { type: string; value: string } | null = null
let activeMediaPort = MEDIA_SERVER_PORT
const openedScheduleMediaFiles = new Set<string>()
const persistedScheduleMediaFiles = new Set<string>()
const validatedExtraMediaFiles = new Set<string>()
const sceneMediaFiles = new Set<string>()
let pendingMediaFolder = ''

const VIDEO_EXT = new Set(['.mp4','.mov','.webm','.mkv','.avi'])
const IMAGE_EXT = new Set(['.jpg','.jpeg','.png','.gif','.webp','.bmp'])
const MEDIA_EXT = new Set([...VIDEO_EXT, ...IMAGE_EXT])

function mediaPathKey(filePath: string): string | null {
  if (!filePath || !isAbsolute(filePath) || !MEDIA_EXT.has(extname(filePath).toLowerCase())) return null
  const normalized = resolve(filePath)
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

function replaceMediaPathSet(target: Set<string>, paths: Iterable<string>): void {
  target.clear()
  for (const filePath of paths) {
    const key = mediaPathKey(filePath)
    if (key) target.add(key)
  }
}

function cueMediaPath(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null
  const cue = value as {
    type?: unknown
    media?: { filepath?: unknown }
    song?: { bg_type?: unknown; bg_value?: unknown }
    bg_type?: unknown
    bg_value?: unknown
  }
  if (cue.type === 'video') {
    return typeof cue.media?.filepath === 'string' ? cue.media.filepath : null
  }
  if (cue.type === 'song') {
    return (cue.song?.bg_type === 'image' || cue.song?.bg_type === 'video') &&
      typeof cue.song?.bg_value === 'string' ? cue.song.bg_value : null
  }
  if (cue.type === 'background' || cue.type === 'verse') {
    return (cue.bg_type === 'image' || cue.bg_type === 'video') &&
      typeof cue.bg_value === 'string' ? cue.bg_value : null
  }
  return null
}

function scheduleMediaPaths(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const paths: string[] = []
  for (const cue of value.slice(0, 2000)) {
    const filePath = cueMediaPath(cue)
    if (filePath) paths.push(filePath)
  }
  return paths
}

function sceneMediaPaths(value: unknown): string[] {
  if (!value || typeof value !== 'object') return []
  const scene = value as { cue?: unknown }
  const filePath = cueMediaPath(scene.cue)
  return filePath ? [filePath] : []
}

function loadPersistedScheduleMediaPaths(): void {
  try {
    replaceMediaPathSet(
      persistedScheduleMediaFiles,
      scheduleMediaPaths(JSON.parse(getSetting('current_schedule') || '[]')),
    )
  } catch {
    persistedScheduleMediaFiles.clear()
  }
}

function samePath(a: string, b: string): boolean {
  const left = resolve(a)
  const right = resolve(b)
  return process.platform === 'win32'
    ? left.toLowerCase() === right.toLowerCase()
    : left === right
}

function isInsideFolder(folder: string, candidate: string): boolean {
  if (!isAbsolute(folder) || !isAbsolute(candidate)) return false
  const rel = relative(resolve(folder), resolve(candidate))
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

function isAllowedMediaPath(filePath: string): boolean {
  const key = mediaPathKey(filePath)
  if (!key) return false
  if (
    openedScheduleMediaFiles.has(key) || persistedScheduleMediaFiles.has(key) ||
    validatedExtraMediaFiles.has(key) ||
    sceneMediaFiles.has(key)
  ) return true
  const folder = getSetting('media_folder')
  if (folder && isInsideFolder(folder, filePath)) return true
  if (getAllMedia().some(item => samePath(item.filepath, filePath))) return true
  if (getAllSongs().some(song => ['image', 'video'].includes(song.bg_type) && samePath(song.bg_value, filePath))) return true
  const configuredLogo = getSetting('logo_path')
  const defaultBgType = getSetting('default_bg_type')
  const defaultBgValue = getSetting('default_bg_value')
  return Boolean(
    (configuredLogo && samePath(configuredLogo, filePath)) ||
    (lastLogoPath && samePath(lastLogoPath, filePath)) ||
    (['image', 'video'].includes(defaultBgType) && defaultBgValue && samePath(defaultBgValue, filePath)) ||
    (lastDefaultBg && ['image', 'video'].includes(lastDefaultBg.type) && samePath(lastDefaultBg.value, filePath)),
  )
}

function ensureExtension(filePath: string, extension: string): string {
  return filePath.toLowerCase().endsWith(extension.toLowerCase()) ? filePath : `${filePath}${extension}`
}

function appIconPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'logo.png')
    : join(__dirname, '../../logo.png')
}

function developmentRendererUrl(page?: string): string {
  const url = new URL(process.env['ELECTRON_RENDERER_URL']!)
  if (page) url.pathname = `${url.pathname.replace(/\/+$/, '')}/${page}`
  url.searchParams.set('mediaPort', String(activeMediaPort))
  return url.toString()
}

function rendererFileQuery(): Record<string, string> {
  return { mediaPort: String(activeMediaPort) }
}

// ─── Create Operator Window ───────────────────────────────────────────────────
function createOperatorWindow(): void {
  operatorWindow = new BrowserWindow({
    width: 1400, height: 900, minWidth: 1100, minHeight: 600,
    show: false,
    icon: appIconPath(),
    backgroundColor: '#0f0f0f',
    frame: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    operatorWindow.loadURL(developmentRendererUrl())
  } else {
    operatorWindow.loadFile(join(__dirname, '../renderer/index.html'), { query: rendererFileQuery() })
  }

  operatorWindow.once('ready-to-show', () => {
    operatorWindow?.maximize()
    operatorWindow?.show()
    operatorWindow?.focus()
  })

  operatorWindow.on('closed', () => { operatorWindow = null; outputWindow?.close() })
}

// ─── Create Output Window ─────────────────────────────────────────────────────
function createOutputWindow(displayId?: number): void {
  const displays      = screen.getAllDisplays()
  const hasSecond     = displays.length > 1
  const targetDisplay = displayId !== undefined
    ? (displays.find(d => d.id === displayId) ?? displays[displays.length - 1])
    : (hasSecond ? displays[displays.length - 1] : displays[0])

  const { x, y, width, height } = targetDisplay.bounds

  const window = new BrowserWindow({
    x, y,
    width,
    height,
    fullscreen: true,
    frame: false,
    alwaysOnTop: hasSecond,
    backgroundColor: '#000000',
    skipTaskbar: hasSecond,
    icon: appIconPath(),
    title: 'SimpleWorship — Output',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/output.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      backgroundThrottling: false,
    }
  })
  outputWindow = window
  let outputClosing = false

  window.setBackgroundColor('#000000')
  window.setFullScreen(true)
  if (hasSecond) window.setAlwaysOnTop(true, 'screen-saver')
  // Wait for the page to actually paint its first frame (already black,
  // via backgroundColor + output.css) before revealing the window at all —
  // otherwise Chromium can show a stray white/gray frame on window creation
  // regardless of what content is about to display. "ready-to-show" can
  // fire slightly before that frame is actually flushed to the window's
  // surface on Windows, so give the compositor one extra tick before
  // calling show() — closes the gap that lets DWM's default gray backdrop
  // show through for a frame.
  window.once('ready-to-show', () => {
    if (window.isDestroyed()) return
    setTimeout(() => {
      if (!window.isDestroyed()) window.show()
    }, 60)
  })
  window.on('minimize', () => {
    if (!hasSecond || window.isDestroyed()) return
    window.restore()
    window.setFullScreen(true)
    window.setAlwaysOnTop(true, 'screen-saver')
  })
  window.on('leave-full-screen', () => {
    if (!outputClosing && !window.isDestroyed()) window.setFullScreen(true)
  })
  window.on('close', () => { outputClosing = true })

  if (process.env['ELECTRON_RENDERER_URL']) {
    window.loadURL(developmentRendererUrl('output.html'))
  } else {
    window.loadFile(join(__dirname, '../renderer/output.html'), { query: rendererFileQuery() })
  }

  window.webContents.on('did-finish-load', () => {
    if (lastScene) window.webContents.send('scene:update', lastScene)
    window.webContents.send('scene:fade-duration', lastFadeDuration)
    if (lastLogoPath) window.webContents.send('scene:logo', lastLogoPath)
    if (lastDefaultBg) window.webContents.send('scene:default-bg', lastDefaultBg)
    operatorWindow?.webContents.send('output:ready')
  })

  window.on('closed', () => {
    if (outputWindow === window) {
      outputWindow = null
      operatorWindow?.webContents.send('output:closed')
      if (operatorWindow && !operatorWindow.isDestroyed()) {
        if (operatorWindow.isMinimized()) operatorWindow.restore()
        operatorWindow.show()
        operatorWindow.focus()
      }
    }
  })
}

// ─── IPC: Window controls ─────────────────────────────────────────────────────
ipcMain.on('window:minimize', () => operatorWindow?.minimize())
ipcMain.on('window:maximize', () => {
  if (operatorWindow?.isMaximized()) operatorWindow.unmaximize()
  else operatorWindow?.maximize()
})
ipcMain.on('window:close', () => operatorWindow?.close())

// ─── IPC: Screens ─────────────────────────────────────────────────────────────
ipcMain.handle('screens:get-all', () =>
  screen.getAllDisplays().map(d => ({
    id: d.id, label: `Display ${d.id}`,
    bounds: d.bounds, isPrimary: d.id === screen.getPrimaryDisplay().id
  }))
)

// ─── IPC: Output window ───────────────────────────────────────────────────────
ipcMain.handle('output:set-screen', (_e, displayId: number) => {
  const previous = outputWindow
  outputWindow = null
  previous?.destroy()
  createOutputWindow(displayId)
  return true
})

ipcMain.handle('output:toggle', (_e, visible: boolean) => {
  if (visible && !outputWindow)  createOutputWindow()
  else if (!visible && outputWindow) outputWindow.close()
  return true
})

const HOTKEY_COMMANDS = new Set(['next', 'previous', 'black', 'clear', 'logo', 'close-output'])
ipcMain.on('hotkey:trigger', (event, command: string) => {
  if (event.sender !== outputWindow?.webContents || !HOTKEY_COMMANDS.has(command)) return
  if (command === 'close-output') {
    outputWindow.close()
    return
  }
  operatorWindow?.webContents.send('hotkey:trigger', command)
})

// ─── IPC: Scene / compositor ──────────────────────────────────────────────────
ipcMain.on('scene:push-to-output', (event, sceneState) => {
  if (event.sender !== operatorWindow?.webContents) return
  const allowedPaths = sceneMediaPaths(sceneState).filter(isAllowedMediaPath)
  replaceMediaPathSet(sceneMediaFiles, allowedPaths)
  lastScene = sceneState
  outputWindow?.webContents.send('scene:update', sceneState)
})
ipcMain.on('scene:push-fade-duration', (event, ms: number) => {
  if (event.sender !== operatorWindow?.webContents) return
  lastFadeDuration = Math.max(0, Math.min(5000, Number(ms) || 0))
  outputWindow?.webContents.send('scene:fade-duration', lastFadeDuration)
})
ipcMain.on('scene:push-logo', (event, path: string) => {
  if (event.sender !== operatorWindow?.webContents) return
  lastLogoPath = typeof path === 'string' && (!path || isAllowedMediaPath(path)) ? path : ''
  outputWindow?.webContents.send('scene:logo', lastLogoPath)
})
ipcMain.on('scene:push-default-bg', (event, bg: { type?: unknown; value?: unknown } | null) => {
  if (event.sender !== operatorWindow?.webContents) return
  const type = bg?.type
  const value = bg?.value
  const valid = type === 'color' ||
    ((type === 'image' || type === 'video') && typeof value === 'string' && isAllowedMediaPath(value))
  lastDefaultBg = valid ? { type, value: typeof value === 'string' ? value : '' } : null
  outputWindow?.webContents.send('scene:default-bg', lastDefaultBg)
})
ipcMain.on('output:request-state', (event) => {
  if (event.sender !== outputWindow?.webContents) return
  if (lastScene) event.sender.send('scene:update', lastScene)
  event.sender.send('scene:fade-duration', lastFadeDuration)
  if (lastLogoPath) event.sender.send('scene:logo', lastLogoPath)
  if (lastDefaultBg) event.sender.send('scene:default-bg', lastDefaultBg)
})

// ─── IPC: Songs ───────────────────────────────────────────────────────────────
ipcMain.handle('songs:get-all',   ()        => getAllSongs())
ipcMain.handle('songs:search',    (_e, q)   => searchSongs(q))
ipcMain.handle('songs:insert',    (_e, s)   => insertSong(s))
ipcMain.handle('songs:update',    (_e, s)   => updateSong(s))
ipcMain.handle('songs:delete',    (_e, id)  => deleteSong(id))

ipcMain.handle('bible:get-books',    ()                                       => getBibleBooks())
ipcMain.handle('bible:get-versions', ()                                       => getBibleVersions())
ipcMain.handle('bible:get-verses',   (_e, bookId: number, chapter: number, version: string) =>
  getBibleVerses(bookId, chapter, version))
ipcMain.handle('bible:install-package', async () => {
  if (!operatorWindow || operatorWindow.isDestroyed()) {
    return { installed: false, canceled: true }
  }
  const result = await dialog.showOpenDialog(operatorWindow, {
    title: 'Install a SimpleWorship Bible package',
    properties: ['openFile'],
    filters: [{ name: 'SimpleWorship Bible', extensions: ['swbible'] }],
  })
  if (result.canceled || !result.filePaths.length) {
    return { installed: false, canceled: true }
  }
  try {
    return { ...(await installBiblePackage(result.filePaths[0])), canceled: false }
  } catch (error) {
    return {
      installed: false,
      canceled: false,
      error: error instanceof Error ? error.message : 'The Bible package could not be installed.',
    }
  }
})

// ─── IPC: Media ───────────────────────────────────────────────────────────────
ipcMain.handle('media:get-all',  () => getAllMedia())
ipcMain.handle('media:delete',   (_e, id)   => deleteMedia(id))

ipcMain.handle('media:select-folder', async () => {
  const result = await dialog.showOpenDialog(operatorWindow!, {
    properties: ['openDirectory'], title: 'Select Media Folder'
  })
  if (result.canceled || !result.filePaths.length) return null
  const folder = resolve(result.filePaths[0])
  // The folder and its replacement index are committed atomically after a
  // successful enumeration by media:index-folder.
  pendingMediaFolder = folder
  return folder
})

ipcMain.handle('media:index-folder', async (_e, folderPath: string) => {
  try {
    if (typeof folderPath !== 'string' || !isAbsolute(folderPath)) {
      throw new Error('A valid media folder is required.')
    }
    const normalizedFolder = resolve(folderPath)
    const configuredFolder = getSetting('media_folder')
    const isSelectedFolder = pendingMediaFolder && samePath(pendingMediaFolder, normalizedFolder)
    const isConfiguredFolder = configuredFolder && samePath(configuredFolder, normalizedFolder)
    if (!isSelectedFolder && !isConfiguredFolder) {
      throw new Error('Select this media folder before indexing it.')
    }

    const files: { filename: string; filepath: string; type: 'video'|'image' }[] = []
    const entries = await readdir(normalizedFolder, { withFileTypes: true })

    // A media folder is intentionally flat: ignore directories and index only
    // image/video files located directly inside the selected folder.
    for (const entry of entries) {
      if (!entry.isFile()) continue
      const fullPath = join(normalizedFolder, entry.name)
      const ext = extname(entry.name).toLowerCase()
      if (VIDEO_EXT.has(ext)) files.push({ filename: entry.name, filepath: fullPath, type: 'video' })
      else if (IMAGE_EXT.has(ext)) files.push({ filename: entry.name, filepath: fullPath, type: 'image' })
    }

    // A single transaction/database export replaces thousands of per-file
    // writes and commits the selected folder only after enumeration succeeds.
    const count = replaceAllMedia(files, normalizedFolder)
    if (pendingMediaFolder && samePath(pendingMediaFolder, normalizedFolder)) pendingMediaFolder = ''
    return { success: true, count }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

interface ExtraMediaReference {
  kind: 'schedule' | 'live' | 'preview'
  label: string
  path: string
}

interface MissingMediaIssue {
  kind: 'library' | 'song-background' | 'default-background' | 'logo' | ExtraMediaReference['kind']
  label: string
  path: string
}

ipcMain.handle('media:validate', async (_e, rawExtras: unknown) => {
  const issues: MissingMediaIssue[] = []
  const candidates: MissingMediaIssue[] = []
  const seen = new Set<string>()
  const validExtraPaths: string[] = []
  const addCandidate = (issue: MissingMediaIssue) => {
    const key = `${issue.kind}:${resolve(issue.path).toLowerCase()}`
    if (seen.has(key)) return
    seen.add(key)
    candidates.push(issue)
  }

  for (const item of getAllMedia()) {
    addCandidate({ kind: 'library', label: item.filename, path: item.filepath })
  }

  for (const song of getAllSongs()) {
    if (['image', 'video'].includes(song.bg_type) && song.bg_value) {
      addCandidate({ kind: 'song-background', label: song.title, path: song.bg_value })
    }
  }

  const defaultBgType = getSetting('default_bg_type')
  const defaultBgValue = getSetting('default_bg_value')
  if (['image', 'video'].includes(defaultBgType) && defaultBgValue) {
    addCandidate({ kind: 'default-background', label: 'Default background', path: defaultBgValue })
  }

  const logoPath = getSetting('logo_path')
  const logoFilename = getSetting('logo_filename')
  const logoId = Number(getSetting('logo_media_id'))
  if (logoPath) {
    addCandidate({ kind: 'logo', label: logoFilename || basename(logoPath), path: logoPath })
  } else if (logoId) {
    const logo = getMediaById(logoId)
    if (logo) addCandidate({ kind: 'logo', label: logo.filename, path: logo.filepath })
    else issues.push({
      kind: 'logo',
      label: logoFilename || 'Selected logo',
      path: 'The saved logo is no longer available in the media library',
    })
  }

  const extras = Array.isArray(rawExtras) ? rawExtras.slice(0, 2000) : []
  for (const value of extras) {
    if (!value || typeof value !== 'object') continue
    const item = value as Partial<ExtraMediaReference>
    if (!['schedule', 'live', 'preview'].includes(String(item.kind))) continue
    if (typeof item.path !== 'string' || !item.path) continue
    addCandidate({
      kind: item.kind as ExtraMediaReference['kind'],
      label: typeof item.label === 'string' && item.label ? item.label : 'Referenced media',
      path: item.path,
    })
  }

  // Check in small asynchronous batches so a large or network-based media
  // folder cannot block the Electron main process or exhaust file handles.
  for (let index = 0; index < candidates.length; index += 64) {
    const batch = candidates.slice(index, index + 64)
    const results = await Promise.all(batch.map(async issue => {
      try {
        const fileStat = await stat(issue.path)
        if (!fileStat.isFile()) throw new Error('Not a regular file')
        if (['schedule', 'live', 'preview'].includes(issue.kind)) validExtraPaths.push(issue.path)
        return null
      } catch {
        return issue
      }
    }))
    for (const issue of results) if (issue) issues.push(issue)
  }

  // Validation is the capability hand-off for schedule/live/preview paths
  // outside the selected media library.
  replaceMediaPathSet(validatedExtraMediaFiles, validExtraPaths)

  return { checkedAt: new Date().toISOString(), issues }
})

// ─── IPC: Named schedules ─────────────────────────────────────────────────────
ipcMain.handle('schedule:save', async (_e, rawSchedule: unknown) => {
  const schedule = Array.isArray(rawSchedule)
    ? rawSchedule.filter(value => value && typeof value === 'object' && ['song', 'video', 'background', 'verse'].includes(String(value.type)))
    : []
  const date = new Date().toISOString().slice(0, 10)
  const result = await dialog.showSaveDialog(operatorWindow!, {
    title: 'Save Schedule',
    defaultPath: join(app.getPath('documents'), `SimpleWorship-Service-${date}.sws`),
    filters: [{ name: 'SimpleWorship Service', extensions: ['sws'] }],
  })
  if (result.canceled || !result.filePath) return null
  const filePath = ensureExtension(result.filePath, '.sws')
  await writeFile(filePath, JSON.stringify({
    format: 'simpleworship-schedule',
    version: 1,
    savedAt: new Date().toISOString(),
    schedule,
  }, null, 2), 'utf8')
  return { path: filePath, name: basename(filePath) }
})

ipcMain.handle('schedule:open', async () => {
  const result = await dialog.showOpenDialog(operatorWindow!, {
    title: 'Open Schedule',
    properties: ['openFile'],
    filters: [
      { name: 'SimpleWorship Service', extensions: ['sws', 'simpleworship-schedule', 'json'] },
    ],
  })
  if (result.canceled || !result.filePaths.length) return null
  const filePath = result.filePaths[0]
  const parsed = JSON.parse(await readFile(filePath, 'utf8')) as unknown
  const values = Array.isArray(parsed)
    ? parsed
    : (parsed && typeof parsed === 'object' && Array.isArray((parsed as { schedule?: unknown }).schedule)
        ? (parsed as { schedule: unknown[] }).schedule
        : null)
  if (!values) throw new Error('The selected file is not a valid SimpleWorship schedule.')
  const schedule = values.filter(value =>
    value && typeof value === 'object' && ['song', 'video', 'background', 'verse'].includes(String(value.type))
  )
  replaceMediaPathSet(openedScheduleMediaFiles, scheduleMediaPaths(schedule))
  return { path: filePath, name: basename(filePath), schedule }
})

// ─── IPC: Settings ────────────────────────────────────────────────────────────
ipcMain.handle('settings:get-all', () => getAllSettings())
ipcMain.handle('settings:get',     (_e, key)        => getSetting(key))
ipcMain.handle('settings:set',     (_e, key, value) => {
  setSetting(key, value)
  if (key === 'current_schedule') {
    try {
      replaceMediaPathSet(persistedScheduleMediaFiles, scheduleMediaPaths(JSON.parse(value || '[]')))
    } catch {
      persistedScheduleMediaFiles.clear()
    }
  }
  return true
})

// ─── IPC: Data backup / recovery ──────────────────────────────────────────────
ipcMain.handle('backup:get-status', () => getBackupStatus())

ipcMain.handle('backup:create', async (_e, rawSchedule: unknown) => {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-')
  const result = await dialog.showSaveDialog(operatorWindow!, {
    title: 'Create Data Backup',
    defaultPath: join(app.getPath('documents'), `SimpleWorship-backup-${stamp}.swb`),
    filters: [{ name: 'SimpleWorship Backup', extensions: ['swb'] }],
  })
  if (result.canceled || !result.filePath) return null
  if (Array.isArray(rawSchedule)) {
    const schedule = rawSchedule.filter(value =>
      value && typeof value === 'object' && ['song', 'video', 'background', 'verse'].includes(String(value.type))
    )
    setSetting('current_schedule', JSON.stringify(schedule))
  }
  const filePath = ensureExtension(result.filePath, '.swb')
  createDatabaseBackup(filePath)
  return { path: filePath, name: basename(filePath) }
})

ipcMain.handle('backup:restore', async () => {
  const selected = await dialog.showOpenDialog(operatorWindow!, {
    title: 'Restore Data Backup',
    properties: ['openFile'],
    filters: [
      { name: 'SimpleWorship Backup', extensions: ['swb', 'simpleworship-backup', 'db'] },
    ],
  })
  if (selected.canceled || !selected.filePaths.length) return null

  const confirmation = await dialog.showMessageBox(operatorWindow!, {
    type: 'warning',
    title: 'Restore SimpleWorship Data',
    message: 'Restore this backup?',
    detail: 'Current songs, schedule, settings, and the media index will be replaced. A safety backup is created first.',
    buttons: ['Cancel', 'Restore'],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  })
  if (confirmation.response !== 1) return null

  restoreDatabaseBackup(selected.filePaths[0])
  loadPersistedScheduleMediaPaths()
  openedScheduleMediaFiles.clear()
  validatedExtraMediaFiles.clear()
  sceneMediaFiles.clear()
  lastScene = null
  lastLogoPath = ''
  lastDefaultBg = null
  outputWindow?.close()
  return { restored: true, name: basename(selected.filePaths[0]) }
})

// ─── App Lifecycle ────────────────────────────────────────────────────────────
if (hasSingleInstanceLock) app.whenReady().then(async () => {
  const databaseStatus = await initDb()
  loadPersistedScheduleMediaPaths()
  await initBibleDb()
  activeMediaPort = await startMediaServer(isAllowedMediaPath)
  createOperatorWindow()

  if (databaseStatus.corruptCopy) {
    const recovered = databaseStatus.recoveredFromBackup
    void dialog.showMessageBox({
      type: recovered ? 'info' : 'warning',
      title: 'SimpleWorship Data Recovery',
      message: recovered ? 'The database was recovered from an automatic backup.' : 'The damaged database could not be recovered.',
      detail: recovered
        ? `Recovered from ${basename(databaseStatus.recoveredBackup ?? '')}. The damaged file was preserved as ${basename(databaseStatus.corruptCopy)}.`
        : `SimpleWorship started with a new database. The damaged file was preserved as ${basename(databaseStatus.corruptCopy)}.`,
    })
  } else if (databaseStatus.upgradedFrom) {
    void dialog.showMessageBox({
      type: 'info',
      title: 'SimpleWorship Updated',
      message: `Updated from v${databaseStatus.upgradedFrom} to v${app.getVersion()}.`,
      detail: 'Your songs, schedule, media library, and settings were kept as-is.'
        + (databaseStatus.upgradeBackup ? ` A backup was also saved automatically (${basename(databaseStatus.upgradeBackup)}), just in case.` : ''),
    })
  }

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      try {
        activeMediaPort = await startMediaServer(isAllowedMediaPath)
        createOperatorWindow()
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        dialog.showErrorBox('SimpleWorship could not reopen', message)
      }
    }
  })
}).catch(error => {
  const message = error instanceof Error ? error.message : String(error)
  dialog.showErrorBox('SimpleWorship could not start', message)
  app.quit()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    stopMediaServer()
    app.quit()
  }
})

app.on('before-quit', stopMediaServer)

app.on('second-instance', () => {
  if (!operatorWindow || operatorWindow.isDestroyed()) return
  if (operatorWindow.isMinimized()) operatorWindow.restore()
  operatorWindow.show()
  operatorWindow.focus()
})

app.on('web-contents-created', (_e, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    try {
      const protocol = new URL(url).protocol
      if (protocol === 'https:' || protocol === 'http:' || protocol === 'mailto:') {
        void shell.openExternal(url)
      }
    } catch {}
    return { action: 'deny' }
  })
})
