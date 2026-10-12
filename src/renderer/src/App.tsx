import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppStoreProvider, useStore } from './store/AppStore'
import TitleBar from './components/layout/TitleBar'
import LeftPanel from './components/layout/LeftPanel'
import PreviewPanel from './components/layout/PreviewPanel'
import LivePanel from './components/layout/LivePanel'
import SettingsModal from './components/layout/SettingsModal'
import { SettingsAPI, MediaAPI } from './utils/api'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { usePanelResize } from './hooks/usePanelResize'
import type { Cue, MediaReference, MediaValidationReport } from './types'
import './styles/app.css'
import './styles/editor.css'

function AppInner() {
  const { state, setFadeDuration, setLogoPath, setDefaultBg, setOutputOpen } = useStore()
  const [showSettings, setShowSettings] = useState(false)
  const [mediaHealth, setMediaHealth] = useState<MediaValidationReport>({
    checkedAt: '',
    issues: [],
  })
  const mainAreaRef = useRef<HTMLDivElement>(null)
  const [layout, setLayout] = useState(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem('simpleworship:panel-widths:v1')
        ?? localStorage.getItem('worship-presenter:panel-widths:v1')
        ?? ''
      )
      if (saved && Number(saved.library) && Number(saved.staging) && Number(saved.production)) return saved
    } catch {}
    return { library: 20, staging: 40, production: 40 }
  })

  useEffect(() => {
    localStorage.setItem('simpleworship:panel-widths:v1', JSON.stringify(layout))
  }, [layout])

  const pixelsToPercent = useCallback((delta: number) => {
    const width = mainAreaRef.current?.clientWidth ?? window.innerWidth
    return width > 0 ? delta / width * 100 : 0
  }, [])

  const resizeLibrary = useCallback((delta: number) => {
    const percent = pixelsToPercent(delta)
    setLayout((current: typeof layout) => {
      const library = Math.max(14, Math.min(32, current.library + percent))
      const applied = library - current.library
      const staging = Math.max(25, current.staging - applied)
      const actual = current.staging - staging
      return { ...current, library: current.library + actual, staging }
    })
  }, [pixelsToPercent])

  const resizeProduction = useCallback((delta: number) => {
    const percent = pixelsToPercent(delta)
    setLayout((current: typeof layout) => {
      const staging = Math.max(25, Math.min(55, current.staging + percent))
      const applied = staging - current.staging
      const production = Math.max(25, current.production - applied)
      const actual = current.production - production
      return { ...current, staging: current.staging + actual, production }
    })
  }, [pixelsToPercent])

  const dragLibrary = usePanelResize(resizeLibrary)
  const dragProduction = usePanelResize(resizeProduction)
  const resetPanelWidths = () => setLayout({ library: 20, staging: 40, production: 40 })

  // When output window is closed externally, update store
  useEffect(() => {
    const api = (window as any).api ?? {}
    const unsubReady = api.onOutputReady?.(() => setOutputOpen(true))
    const unsubClosed = api.onOutputClosed?.(() => setOutputOpen(false))
    return () => { unsubReady?.(); unsubClosed?.() }
  }, [setOutputOpen])

  useEffect(() => {
    async function load() {
      const s = await SettingsAPI.getAll()
      if (s.fade_duration) {
        const ms = parseInt(s.fade_duration, 10)
        if (!isNaN(ms)) setFadeDuration(ms)
      }
      if (s.logo_path) {
        setLogoPath(s.logo_path)
      } else if (s.logo_media_id) {
        const all = await MediaAPI.getAll()
        const logo = all.find(m => String(m.id) === s.logo_media_id)
        if (logo) {
          setLogoPath(logo.filepath)
          await SettingsAPI.set('logo_path', logo.filepath)
          await SettingsAPI.set('logo_filename', logo.filename)
        }
      }
      if (s.default_bg_type && (s.default_bg_type === 'color' || s.default_bg_type === 'image' || s.default_bg_type === 'video')) {
        setDefaultBg({ type: s.default_bg_type, value: s.default_bg_value ?? '' })
      }
    }
    load()
  }, [setFadeDuration, setLogoPath, setDefaultBg, setOutputOpen])

  const mediaReferences = useMemo(() => {
    const references: MediaReference[] = []
    const addCue = (cue: Cue | null, kind: MediaReference['kind']) => {
      if (!cue) return
      if (cue.type === 'video') {
        references.push({ kind, label: cue.label, path: cue.media.filepath })
      } else if (
        cue.type === 'song'
        && (cue.song.bg_type === 'image' || cue.song.bg_type === 'video')
        && cue.song.bg_value
      ) {
        references.push({ kind, label: cue.label, path: cue.song.bg_value })
      } else if (
        (cue.type === 'background' || cue.type === 'verse')
        && (cue.bg_type === 'image' || cue.bg_type === 'video')
        && cue.bg_value
      ) {
        references.push({ kind, label: cue.label, path: cue.bg_value })
      }
    }
    state.schedule.forEach(cue => addCue(cue, 'schedule'))
    addCue(state.preview.cue, 'preview')
    addCue(state.live.cue, 'live')
    return references
  }, [state.live.cue, state.preview.cue, state.schedule])

  const refreshMediaHealth = useCallback(async () => {
    setMediaHealth(await MediaAPI.validate(mediaReferences))
  }, [mediaReferences])

  useEffect(() => {
    void refreshMediaHealth()
    const onMediaChanged = () => { void refreshMediaHealth() }
    window.addEventListener('simpleworship:media-changed', onMediaChanged)
    return () => {
      window.removeEventListener('simpleworship:media-changed', onMediaChanged)
    }
  }, [refreshMediaHealth])

  useKeyboardShortcuts()

  return (
    <div className="app-shell">
      <TitleBar
        onSettings={() => setShowSettings(true)}
        missingMediaCount={mediaHealth.issues.length}
      />

      <div className="main-area" ref={mainAreaRef}>
        {/* LEFT: Schedule + Library */}
        <div className="main-column main-column-library" style={{ flex: `${layout.library} 1 0`, width: 'auto' }}>
          <LeftPanel mediaHealth={mediaHealth} />
        </div>

        <div
          className="resize-handle-v"
          onMouseDown={dragLibrary}
          onDoubleClick={resetPanelWidths}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize library and staging panels"
          tabIndex={0}
          onKeyDown={event => {
            if (event.key === 'ArrowLeft') { event.preventDefault(); resizeLibrary(-12) }
            if (event.key === 'ArrowRight') { event.preventDefault(); resizeLibrary(12) }
            if (event.key === 'Home') { event.preventDefault(); resetPanelWidths() }
          }}
        />

        {/* MIDDLE: Preview / Staging */}
        <div className="main-column main-column-staging" style={{ flex: `${layout.staging} 1 0`, width: 'auto' }}>
          <PreviewPanel />
        </div>

        <div
          className="resize-handle-v"
          onMouseDown={dragProduction}
          onDoubleClick={resetPanelWidths}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize staging and production panels"
          tabIndex={0}
          onKeyDown={event => {
            if (event.key === 'ArrowLeft') { event.preventDefault(); resizeProduction(-12) }
            if (event.key === 'ArrowRight') { event.preventDefault(); resizeProduction(12) }
            if (event.key === 'Home') { event.preventDefault(); resetPanelWidths() }
          }}
        />

        {/* RIGHT: Live / Production */}
        <div className="main-column main-column-production" style={{ flex: `${layout.production} 1 0`, width: 'auto' }}>
          <LivePanel />
        </div>
      </div>

      {showSettings && (
        <SettingsModal
          mediaHealth={mediaHealth}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  )
}

export default function App() {
  return (
    <AppStoreProvider>
      <AppInner />
    </AppStoreProvider>
  )
}
