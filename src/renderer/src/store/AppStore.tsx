import React, { createContext, useContext, useReducer, useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { EMPTY_OVERLAYS } from '../types'
import type { Cue, SceneState, OverlayKind, Song, SongCue } from '../types'
import { parseLyrics } from '../utils/lyricsParser'
import type { ResolvedBg } from '../utils/background'

const initialScene: SceneState = { cue: null, blockIndex: 0, overlays: { ...EMPTY_OVERLAYS } }

const SCHEDULE_STORAGE_KEY = 'simpleworship:schedule:v1'
const LEGACY_SCHEDULE_STORAGE_KEY = 'worship-presenter:schedule:v1'
const SCHEDULE_PENDING_KEY = 'simpleworship:schedule-pending:v1'
export const RESTORE_IN_PROGRESS_KEY = 'simpleworship:restore-in-progress:v1'

function parseSavedSchedule(value: string | null): Cue[] | null {
  if (!value) return null
  try {
    const saved = JSON.parse(value) as unknown
    if (!Array.isArray(saved)) return null
    return saved.filter((cue): cue is Cue => {
      if (!cue || typeof cue !== 'object') return false
      const candidate = cue as Partial<Cue>
      return candidate.type === 'song'
        || candidate.type === 'video'
        || candidate.type === 'background'
        || candidate.type === 'verse'
    })
  } catch {
    return null
  }
}

function loadSavedSchedule(): Cue[] {
  const value = localStorage.getItem(SCHEDULE_STORAGE_KEY) ?? localStorage.getItem(LEGACY_SCHEDULE_STORAGE_KEY)
  return parseSavedSchedule(value) ?? []
}

const initialState = {
  schedule:      loadSavedSchedule(),
  selectedCueId: null as string | null,
  preview:       { ...initialScene } as SceneState,
  live:          { ...initialScene } as SceneState,
  fadeDuration:  500,
  logoPath:      '',
  defaultBg:     null as ResolvedBg | null,
  outputOpen:    false,   // true = output window is open and receiving scenes
}

type FullState = typeof initialState

type Action =
  | { type: 'SCHEDULE_ADD';        cue: Cue }
  | { type: 'SCHEDULE_REMOVE';     id: string }
  | { type: 'SCHEDULE_REORDER';    from: number; to: number }
  | { type: 'SCHEDULE_REPLACE';    schedule: Cue[] }
  | { type: 'SCHEDULE_SELECT';     id: string }
  | { type: 'SONG_UPDATED';        song: Song }
  | { type: 'PREVIEW_SET_CUE';     cue: Cue }
  | { type: 'PREVIEW_SET_BLOCK';   index: number }
  | { type: 'START_LIVE_OUTPUT' }
  | { type: 'PUSH_BLOCK_TO_LIVE';  cue: Cue | null; blockIndex: number }
  | { type: 'LIVE_TOGGLE_OVERLAY'; overlay: OverlayKind }
  | { type: 'SET_FADE_DURATION';   ms: number }
  | { type: 'SET_LOGO_PATH';       path: string }
  | { type: 'SET_DEFAULT_BG';      bg: ResolvedBg | null }
  | { type: 'SET_OUTPUT_OPEN';     open: boolean }
  | { type: 'CLOSE_OUTPUT' }

function reducer(state: FullState, action: Action): FullState {
  switch (action.type) {

    case 'SCHEDULE_ADD':
      return { ...state, schedule: [...state.schedule, action.cue] }

    case 'SCHEDULE_REMOVE':
      return {
        ...state,
        schedule: state.schedule.filter(c => c.id !== action.id),
        selectedCueId: state.selectedCueId === action.id ? null : state.selectedCueId,
      }

    case 'SCHEDULE_REORDER': {
      const arr = [...state.schedule]
      const [moved] = arr.splice(action.from, 1)
      arr.splice(action.to, 0, moved)
      return { ...state, schedule: arr }
    }

    case 'SCHEDULE_REPLACE':
      return {
        ...state,
        schedule: action.schedule,
        selectedCueId: null,
        preview: { ...initialScene, overlays: { ...EMPTY_OVERLAYS } },
      }

    case 'SCHEDULE_SELECT':
      return { ...state, selectedCueId: action.id }

    case 'SONG_UPDATED': {
      const refreshCue = (cue: Cue | null): Cue | null => {
        if (cue?.type !== 'song' || cue.song.id !== action.song.id) return cue
        return {
          ...cue,
          label: action.song.title,
          song: action.song,
          blocks: parseLyrics(action.song.lyrics_raw),
        } as SongCue
      }
      const schedule = state.schedule.map(cue => refreshCue(cue) as Cue)
      const previewCue = refreshCue(state.preview.cue)
      const liveCue = refreshCue(state.live.cue)
      const preview = { ...state.preview, cue: previewCue }
      const live = { ...state.live, cue: liveCue }
      if (state.outputOpen && liveCue !== state.live.cue) pushSceneToOutput(live)
      return { ...state, schedule, preview, live }
    }

    case 'PREVIEW_SET_CUE':
      return { ...state, preview: { ...state.preview, cue: action.cue, blockIndex: 0 } }

    case 'PREVIEW_SET_BLOCK':
      return { ...state, preview: { ...state.preview, blockIndex: action.index } }

    case 'START_LIVE_OUTPUT': {
      // Starting output is intentionally independent from Staging. Operators
      // take a staged cue to Production explicitly by double-clicking it.
      if (state.outputOpen) return state
      // Cache Production before opening so the output window receives this
      // scene on first load. Any take made while it opens replaces that cache
      // and therefore cannot be overwritten by an older captured scene.
      pushSceneToOutput(state.live)
      void openOutputWindow()
      return { ...state, outputOpen: true }
    }

    case 'PUSH_BLOCK_TO_LIVE': {
      const overlays = state.live.overlays
      const newLive: SceneState = {
        cue: action.cue,
        blockIndex: action.blockIndex,
        overlays,
      }
      if (state.outputOpen) pushSceneToOutput(newLive)
      // Keep Staging's selected block in sync when it is showing this same
      // song, while preserving a different cue that is being prepared next.
      const preview = action.cue && state.preview.cue?.id === action.cue.id
        ? { ...state.preview, blockIndex: action.blockIndex }
        : state.preview
      return { ...state, live: newLive, preview }
    }

    case 'LIVE_TOGGLE_OVERLAY': {
      const current = state.live.overlays
      const overlays = { ...current, [action.overlay]: !current[action.overlay] }
      const newLive = { ...state.live, overlays }
      if (state.outputOpen) pushSceneToOutput(newLive)
      return { ...state, live: newLive }
    }

    case 'SET_FADE_DURATION':
      pushFadeDuration(action.ms)
      return { ...state, fadeDuration: action.ms }

    case 'SET_LOGO_PATH':
      pushLogo(action.path)
      return { ...state, logoPath: action.path }

    case 'SET_DEFAULT_BG':
      pushDefaultBg(action.bg)
      return { ...state, defaultBg: action.bg }

    case 'SET_OUTPUT_OPEN':
      return { ...state, outputOpen: action.open }

    case 'CLOSE_OUTPUT':
      closeOutputWindow()
      return { ...state, outputOpen: false }

    default:
      return state
  }
}

// ─── IPC helpers ──────────────────────────────────────────────────────────────
const w = () => (window as any).api ?? {}
function pushSceneToOutput(s: SceneState) { try { w().scene?.pushToOutput(s) } catch {} }
function pushFadeDuration(ms: number)     { try { w().scene?.pushFadeDuration(ms) } catch {} }
function pushLogo(path: string)           { try { w().scene?.pushLogo(path) } catch {} }
function pushDefaultBg(bg: ResolvedBg | null) { try { w().scene?.pushDefaultBg(bg) } catch {} }
async function openOutputWindow(): Promise<void> {
  const api = w()
  try {
    const settings = await api.settings?.getAll()
    await new Promise<void>((resolve) => {
      let settled = false
      let timer: ReturnType<typeof setTimeout> | undefined
      let unsubscribe: (() => void) | undefined
      const finish = () => {
        if (settled) return
        settled = true
        if (timer) clearTimeout(timer)
        unsubscribe?.()
        resolve()
      }

      // Listen before opening so a fast output window cannot race past us.
      unsubscribe = api.onOutputReady?.(finish)
      timer = setTimeout(finish, 2000)
      const opening = settings?.output_screen
        ? api.output?.setScreen(Number(settings.output_screen))
        : api.output?.toggle(true)
      void Promise.resolve(opening).catch(finish)
    })
  } catch {}
}
function closeOutputWindow() {
  try { w().output?.toggle(false) } catch {}
}

// ─── Context ──────────────────────────────────────────────────────────────────
interface StoreContext {
  state: FullState
  dispatch: React.Dispatch<Action>
  addToSchedule:      (cue: Cue) => void
  removeFromSchedule: (id: string) => void
  selectCue:          (cue: Cue) => void
  setPreviewBlock:    (index: number) => void
  startLive:          () => void
  pushBlockToLive:    (cue: Cue | null, blockIndex: number) => void
  setFadeDuration:    (ms: number) => void
  setLogoPath:        (path: string) => void
  setDefaultBg:       (bg: ResolvedBg | null) => void
  setOutputOpen:      (open: boolean) => void
  closeOutput:        () => void
  updateScheduledSong:(song: Song) => void
}

const StoreCtx = createContext<StoreContext | null>(null)

export function AppStoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const [scheduleReady, setScheduleReady] = useState(false)

  useEffect(() => {
    let active = true
    async function hydrateSchedule() {
      try {
        const restoring = localStorage.getItem(RESTORE_IN_PROGRESS_KEY) === '1'
        const pendingValue = restoring ? null : localStorage.getItem(SCHEDULE_PENDING_KEY)
        const pendingSchedule = parseSavedSchedule(pendingValue)
        const saved = await w().settings?.get('current_schedule')

        if (restoring) {
          localStorage.removeItem(RESTORE_IN_PROGRESS_KEY)
          localStorage.removeItem(SCHEDULE_PENDING_KEY)
        }

        if (pendingSchedule && pendingValue) {
          // Recover a renderer update that did not receive a database
          // acknowledgement before the window closed.
          dispatch({ type: 'SCHEDULE_REPLACE', schedule: pendingSchedule })
          await w().settings?.set('current_schedule', pendingValue)
          if (localStorage.getItem(SCHEDULE_PENDING_KEY) === pendingValue) {
            localStorage.removeItem(SCHEDULE_PENDING_KEY)
          }
        } else {
          const databaseSchedule = parseSavedSchedule(typeof saved === 'string' ? saved : null)
          if (databaseSchedule) dispatch({ type: 'SCHEDULE_REPLACE', schedule: databaseSchedule })
        }
      } catch {}
      if (active) setScheduleReady(true)
    }
    void hydrateSchedule()
    return () => { active = false }
  }, [])

  useLayoutEffect(() => {
    if (!scheduleReady) return
    const serialized = JSON.stringify(state.schedule)
    try {
      localStorage.setItem(SCHEDULE_STORAGE_KEY, serialized)
      localStorage.setItem(SCHEDULE_PENDING_KEY, serialized)
    } catch {}

    void Promise.resolve(w().settings?.set('current_schedule', serialized))
      .then(() => {
        if (localStorage.getItem(SCHEDULE_PENDING_KEY) === serialized) {
          localStorage.removeItem(SCHEDULE_PENDING_KEY)
        }
      })
      .catch(() => {})
  }, [scheduleReady, state.schedule])

  const addToSchedule      = useCallback((cue: Cue)           => dispatch({ type: 'SCHEDULE_ADD', cue }), [])
  const removeFromSchedule = useCallback((id: string)          => dispatch({ type: 'SCHEDULE_REMOVE', id }), [])
  const selectCue          = useCallback((cue: Cue)            => {
    dispatch({ type: 'SCHEDULE_SELECT', id: cue.id })
    dispatch({ type: 'PREVIEW_SET_CUE', cue })
  }, [])
  const setPreviewBlock    = useCallback((index: number)       => dispatch({ type: 'PREVIEW_SET_BLOCK', index }), [])
  const startLive          = useCallback(()                    => dispatch({ type: 'START_LIVE_OUTPUT' }), [])
  const pushBlockToLive    = useCallback((cue: Cue | null, i: number) => dispatch({ type: 'PUSH_BLOCK_TO_LIVE', cue, blockIndex: i }), [])
  const setFadeDuration    = useCallback((ms: number)          => dispatch({ type: 'SET_FADE_DURATION', ms }), [])
  const setLogoPath        = useCallback((path: string)        => dispatch({ type: 'SET_LOGO_PATH', path }), [])
  const setDefaultBg       = useCallback((bg: ResolvedBg | null) => dispatch({ type: 'SET_DEFAULT_BG', bg }), [])
  const setOutputOpen      = useCallback((open: boolean)       => dispatch({ type: 'SET_OUTPUT_OPEN', open }), [])
  const closeOutput        = useCallback(()                    => dispatch({ type: 'CLOSE_OUTPUT' }), [])
  const updateScheduledSong = useCallback((song: Song)         => dispatch({ type: 'SONG_UPDATED', song }), [])

  return (
    <StoreCtx.Provider value={{
      state, dispatch,
      addToSchedule, removeFromSchedule, selectCue,
      setPreviewBlock, startLive,
      pushBlockToLive, setFadeDuration, setLogoPath, setDefaultBg,
      setOutputOpen, closeOutput, updateScheduledSong,
    }}>
      {children}
    </StoreCtx.Provider>
  )
}

export function useStore() {
  const ctx = useContext(StoreCtx)
  if (!ctx) throw new Error('useStore must be used inside AppStoreProvider')
  return ctx
}
