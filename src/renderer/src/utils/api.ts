/**
 * Typed wrapper around window.api (the IPC bridge exposed by preload).
 * Use this everywhere in the renderer instead of casting window.api.
 *
 * All methods return Promises — they are IPC invoke calls to the main process.
 */

import type {
  BackupStatus,
  BibleBook,
  BibleInstallResult,
  BibleLibraryState,
  BibleVerseRow,
  Cue,
  MediaItem,
  MediaReference,
  MediaValidationReport,
  Song,
} from '../types'

// Helper — safely access window.api (may not exist in tests/storybook)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api = (): any => (window as any).api ?? {}

// ─── Songs ────────────────────────────────────────────────────────────────────

export const SongsAPI = {
  getAll:  async (): Promise<Song[]>          => api().songs?.getAll() ?? [],
  search:  async (q: string): Promise<Song[]> => api().songs?.search(q) ?? [],
  insert:  async (song: Omit<Song, 'id'>): Promise<Song> =>
    api().songs?.insert(song),

  update: async (song: Partial<Song> & { id: number }): Promise<Song | null> => {
    return await api().songs?.update(song) ?? null
  },

  delete: async (id: number): Promise<boolean> => api().songs?.delete(id) ?? false,
}

// ─── Bible ────────────────────────────────────────────────────────────────────

const emptyBibleLibrary = (): BibleLibraryState => ({
  translations: [],
  activeTranslationId: null,
  bundledCandidates: [],
  requiresImport: true,
})

function announceBibleChange(state?: BibleLibraryState) {
  window.dispatchEvent(new CustomEvent('simpleworship:bible-changed', { detail: state }))
}

export const BibleAPI = {
  getLibrary: async (): Promise<BibleLibraryState> =>
    await api().bible?.getLibrary() ?? emptyBibleLibrary(),
  selectTranslation: async (translationId: string): Promise<BibleLibraryState> =>
    await api().bible?.selectTranslation(translationId) ?? emptyBibleLibrary(),
  getBooks:  async (): Promise<BibleBook[]> => api().bible?.getBooks() ?? [],
  getVerses: async (bookId: number, chapter: number): Promise<BibleVerseRow[]> =>
    api().bible?.getVerses(bookId, chapter) ?? [],
  installPackage: async (): Promise<BibleInstallResult> => {
    const result = await api().bible?.installPackage() ?? { installed: false, canceled: true }
    if (result.installed) announceBibleChange()
    return result
  },
  installBundled: async (candidateId: string): Promise<BibleInstallResult> => {
    const result = await api().bible?.installBundled(candidateId) ?? { installed: false, canceled: false }
    if (result.installed) announceBibleChange()
    return result
  },
}

// ─── Media ────────────────────────────────────────────────────────────────────

let mediaItemsCache: MediaItem[] | null = null
let mediaItemsRequest: Promise<MediaItem[]> | null = null

function invalidateMediaItems() {
  mediaItemsCache = null
  mediaItemsRequest = null
}

export const MediaAPI = {
  getAll: async (): Promise<MediaItem[]> => {
    if (mediaItemsCache) return mediaItemsCache
    if (mediaItemsRequest) return mediaItemsRequest

    const request = Promise.resolve(api().media?.getAll() ?? [])
      .then((items: MediaItem[]) => {
        mediaItemsCache = items
        return items
      })
      .finally(() => {
        if (mediaItemsRequest === request) mediaItemsRequest = null
      })
    mediaItemsRequest = request
    return request
  },
  delete:       async (id: number)              => {
    const result = await api().media?.delete(id)
    invalidateMediaItems()
    window.dispatchEvent(new Event('simpleworship:media-changed'))
    return result
  },
  selectFolder: async (): Promise<string|null>  => api().media?.selectFolder() ?? null,
  indexFolder:  async (path: string)            => {
    const result = await api().media?.indexFolder(path) ?? { success: false }
    if (result.success) {
      invalidateMediaItems()
      window.dispatchEvent(new Event('simpleworship:media-changed'))
    }
    return result
  },
  validate:     async (extras: MediaReference[] = []): Promise<MediaValidationReport> =>
    api().media?.validate(extras) ?? { checkedAt: new Date().toISOString(), issues: [] },
}

// ─── Named schedules ──────────────────────────────────────────────────────────

export const ScheduleAPI = {
  save: async (schedule: Cue[]): Promise<{ path: string; name: string } | null> =>
    api().schedule?.save(schedule) ?? null,
  open: async (): Promise<{ path: string; name: string; schedule: Cue[] } | null> =>
    api().schedule?.open() ?? null,
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export const SettingsAPI = {
  getAll: async (): Promise<Record<string, string>>        => api().settings?.getAll()      ?? {},
  get:    async (key: string): Promise<string>             => api().settings?.get(key)       ?? '',
  set:    async (key: string, value: string): Promise<void> => api().settings?.set(key, value),
}

// ─── Data backup / recovery ───────────────────────────────────────────────────

export const BackupAPI = {
  getStatus: async (): Promise<BackupStatus> =>
    api().backup?.getStatus() ?? { directory: '', count: 0, latestAt: null },
  create: async (schedule: Cue[]): Promise<{ path: string; name: string } | null> =>
    api().backup?.create(schedule) ?? null,
  restore: async (): Promise<{ restored: boolean; name: string } | null> =>
    api().backup?.restore() ?? null,
}

// ─── Screens ──────────────────────────────────────────────────────────────────

export const ScreensAPI = {
  getAll:    async () => api().screens?.getAll()             ?? [],
  setScreen: async (id: number) => api().output?.setScreen(id),
  toggle:    async (visible: boolean) => api().output?.toggle(visible),
}
