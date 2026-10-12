import { mediaUrl } from '../../utils/mediaUrl'
import React, { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../../store/AppStore'
import { Compositor } from '../../utils/compositor'
import { tagColor } from '../../utils/lyricsParser'
import { usePanelResize } from '../../hooks/usePanelResize'
import { useMedia } from '../../hooks/useMedia'
import type { Cue, OverlayKind, SceneState } from '../../types'
import { SettingsAPI } from '../../utils/api'
import MediaThumbnail from '../media/MediaThumbnail'

type LiveTab = 'output' | 'vj'
const VJ_MEDIA_PAGE_SIZE = 100

export default function LivePanel() {
  const { state, pushBlockToLive, dispatch, setFadeDuration, startLive, closeOutput } = useStore()
  const { live, logoPath, fadeDuration, defaultBg } = state
  const [tab, setTab] = useState<LiveTab>('output')

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const compRef   = useRef<Compositor | null>(null)
  const wrapRef   = useRef<HTMLDivElement>(null)

  // Resizable blocks — drag DOWN to grow
  const [blocksH, setBlocksH] = useState(() => {
    const saved = Number(
      localStorage.getItem('simpleworship:production-blocks-height:v1')
      ?? localStorage.getItem('worship-presenter:production-blocks-height:v1')
    )
    return Number.isFinite(saved) && saved >= 80 ? Math.min(saved, window.innerHeight - 190) : 300
  })
  useEffect(() => {
    localStorage.setItem('simpleworship:production-blocks-height:v1', String(blocksH))
  }, [blocksH])
  const onResizeBlocks = useCallback((d: number) => {
    setBlocksH(h => Math.max(80, Math.min(window.innerHeight - 190, h + d)))
  }, [])
  const dragBlocks = usePanelResize(onResizeBlocks, false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    compRef.current = new Compositor({ canvas, width: 480, height: 270 })
    // Initial resize to match container
    requestAnimationFrame(() => {
      const wrap = wrapRef.current ?? canvasRef.current?.parentElement
      if (wrap && compRef.current) {
        const w = Math.round(wrap.clientWidth - 12)
        if (w > 10) compRef.current.resize(w, Math.round(w * 9 / 16))
      }
    })
    return () => { compRef.current?.destroy(); compRef.current = null }
  }, [])

  // Resize canvas when container resizes
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const obs = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width } = entry.contentRect
        if (!compRef.current || width < 10) return
        const w = Math.round(width)
        const h = Math.round(width * 9 / 16)
        compRef.current.resize(w, h)
      }
    })
    obs.observe(wrap)
    return () => obs.disconnect()
  }, [])

  // Force redraw when window is restored from minimize/maximize
  useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden && compRef.current) {
        const scene = (compRef.current as any).currentScene
        if (scene) compRef.current.pushScene(scene)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', onVisibility)
    }
  }, [])

  useEffect(() => { compRef.current?.setLogo(logoPath ? mediaUrl(logoPath) : '') }, [logoPath])
  useEffect(() => { compRef.current?.setDefaultBackground(defaultBg) }, [defaultBg])
  useEffect(() => { compRef.current?.pushScene(live) }, [live])

  const cue    = live.cue
  const blocks = cue?.type === 'song' ? cue.blocks : []

  const activeOverlays = live.overlays
  const setOverlay = (overlay: OverlayKind) => dispatch({ type: 'LIVE_TOGGLE_OVERLAY', overlay })

  const activeOverlayNames = (['black', 'clear', 'logo'] as const).filter(name => activeOverlays[name])
  return (
    <div className="live-panel">

      {/* ── Live Topbar ── */}
      <div className="live-topbar">
        <div className="live-tb-overlays">
          <button className={`live-tb-btn ${activeOverlays.black?'active-black':''}`}
            aria-pressed={activeOverlays.black}
            onClick={() => setOverlay('black')}>■ BLACK</button>
          <button className={`live-tb-btn ${activeOverlays.clear?'active-clear':''}`}
            aria-pressed={activeOverlays.clear}
            onClick={() => setOverlay('clear')}>✕ CLEAR</button>
          <button className={`live-tb-btn ${activeOverlays.logo?'active-logo':''}`}
            aria-pressed={activeOverlays.logo}
            onClick={() => setOverlay('logo')}>☁ LOGO</button>
        </div>
        <div className="go-live-area">
          <button
            className="go-live-btn"
            onClick={startLive}
            disabled={state.outputOpen}
            aria-pressed={state.outputOpen}
          >▶ LIVE</button>
          {state.outputOpen && (
            <button className="close-output-btn" onClick={closeOutput} aria-label="Stop and close output">⏹</button>
          )}
        </div>
        {state.outputOpen && (
          <span className="output-live-dot"><span className="live-pulse" /><span>LIVE</span></span>
        )}
      </div>

      {/* ── Live info ── */}
      <div className="live-info-bar">
        <span className="live-label-badge">PRODUCTION</span>
        {cue
          ? <span className="live-cue-name">{cue.label} {blocks.length > 0 && `· ${live.blockIndex + 1}/${blocks.length}`}</span>
          : <span className="live-cue-name" style={{ opacity: 0.4 }}>Nothing live</span>
        }
        {activeOverlayNames.length > 0 && (
          <span className="live-overlay-badge">{activeOverlayNames.map(name => name.toUpperCase()).join(' + ')}</span>
        )}
      </div>

      {/* ── Live block cards — 1-click to push ── */}
      <div className="block-cards-wrap" style={{ height: blocksH, flexShrink: 0 }}>
        <div className="block-cards-scroll">
          {!cue && <div className="empty-state" style={{ width: '100%' }}><p>Nothing live yet</p></div>}
          {blocks.map((b, i) => {
            const color    = tagColor(b.tag)
            const isActive = live.blockIndex === i
            return (
              <div key={i}
                className={`block-card-h live-card ${isActive ? 'islive' : ''}`}
                style={{ '--bc': color } as React.CSSProperties}
                role="button"
                tabIndex={0}
                aria-pressed={isActive}
                aria-label={`Show ${b.tag} live`}
                onClick={() => cue && pushBlockToLive(cue, i)}
                onKeyDown={event => {
                  if (event.target !== event.currentTarget) return
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    if (cue) pushBlockToLive(cue, i)
                  }
                }}
              >
                <div className="bch-accent" />
                <div className="bch-body">
                  <span className="bch-tag">{b.tag}</span>
                  {b.lines.map((l, li) => <span key={li} className="bch-line">{l}</span>)}
                </div>
                {isActive && <span className="bch-live-dot" />}
              </div>
            )
          })}
        </div>
      </div>

      <div
        className="resize-handle-h"
        onMouseDown={dragBlocks}
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize production blocks and output preview"
        tabIndex={0}
        onKeyDown={event => {
          if (event.key === 'ArrowUp') { event.preventDefault(); onResizeBlocks(-12) }
          if (event.key === 'ArrowDown') { event.preventDefault(); onResizeBlocks(12) }
        }}
      />

      {/* ── Tabs ── */}
      <div className="pp-tabs" role="tablist" aria-label="Production views">
        <button
          id="output-preview-tab"
          role="tab"
          aria-selected={tab === 'output'}
          aria-controls="output-preview-panel"
          tabIndex={tab === 'output' ? 0 : -1}
          className={`pp-tab ${tab==='output'?'active':''}`}
          onClick={() => setTab('output')}
          onKeyDown={event => {
            if (event.key !== 'ArrowRight' && event.key !== 'End') return
            event.preventDefault()
            setTab('vj')
            requestAnimationFrame(() => document.getElementById('vj-background-tab')?.focus())
          }}
        >Output Preview</button>
        <button
          id="vj-background-tab"
          role="tab"
          aria-selected={tab === 'vj'}
          aria-controls="vj-background-panel"
          tabIndex={tab === 'vj' ? 0 : -1}
          className={`pp-tab ${tab==='vj'?'active':''}`}
          onClick={() => setTab('vj')}
          onKeyDown={event => {
            if (event.key !== 'ArrowLeft' && event.key !== 'Home') return
            event.preventDefault()
            setTab('output')
            requestAnimationFrame(() => document.getElementById('output-preview-tab')?.focus())
          }}
        >VJ / BG</button>
      </div>

      <div className="pp-tab-content">
        {/* Always mounted - hide with CSS so compositor never unmounts */}
        <div
          id="output-preview-panel"
          ref={wrapRef}
          className="pp-output-tab"
          role="tabpanel"
          aria-labelledby="output-preview-tab"
          style={{ display: tab === 'output' ? 'flex' : 'none' }}
        >
          <canvas ref={canvasRef} className="preview-canvas-responsive" />
          <div className="pp-canvas-info">
            {state.outputOpen ? '🔴 Output is live' : 'Press Live to open output'}
          </div>
        </div>
        <div
          id="vj-background-panel"
          className="vj-tab-pane"
          role="tabpanel"
          aria-labelledby="vj-background-tab"
          style={{ display: tab === 'vj' ? 'flex' : 'none' }}
        >
          <VJPanel
            fadeDuration={fadeDuration}
            setFadeDuration={setFadeDuration}
            live={live}
            dispatch={dispatch}
          />
        </div>
      </div>
    </div>
  )
}

// ─── VJ Panel ─────────────────────────────────────────────────────────────────
function VJPanel({ fadeDuration, setFadeDuration, live, dispatch }: {
  fadeDuration: number
  setFadeDuration: (ms: number) => void
  live: SceneState
  dispatch: React.Dispatch<{
    type: 'PUSH_BLOCK_TO_LIVE'
    cue: Cue | null
    blockIndex: number
  }>
}) {
  const { items, folder } = useMedia()
  const [gridColumns, setGridColumns] = useState<2 | 3 | 4 | 5>(() => {
    const saved = Number(
      localStorage.getItem('simpleworship:vj-grid-columns:v1')
      ?? localStorage.getItem('worship-presenter:vj-grid-columns:v1')
    )
    return saved === 3 || saved === 4 || saved === 5 ? saved : 2
  })
  const mediaGridRef = useRef<HTMLDivElement>(null)
  const [mediaPage, setMediaPage] = useState(0)
  const [previewItemId, setPreviewItemId] = useState<number | null>(null)
  React.useEffect(() => {
    localStorage.setItem('simpleworship:vj-grid-columns:v1', String(gridColumns))
  }, [gridColumns])
  const mediaPageCount = Math.max(1, Math.ceil(items.length / VJ_MEDIA_PAGE_SIZE))
  const mediaPageStart = mediaPage * VJ_MEDIA_PAGE_SIZE
  const visibleItems = items.slice(mediaPageStart, mediaPageStart + VJ_MEDIA_PAGE_SIZE)

  React.useEffect(() => {
    setMediaPage(0)
    if (mediaGridRef.current) mediaGridRef.current.scrollTop = 0
  }, [items.length])
  React.useEffect(() => {
    setMediaPage(current => Math.min(current, mediaPageCount - 1))
  }, [mediaPageCount])
  React.useEffect(() => {
    if (mediaGridRef.current) mediaGridRef.current.scrollTop = 0
  }, [mediaPage])
  const [overrideInfo, setOverrideInfo] = useState('')
  const [colorValue, setColorValue] = useState('#000000')
  const [colorPicker, setColorPicker] = useState<{ x: number; y: number } | null>(null)
  const colorPickerRef = useRef<HTMLDivElement>(null)
  const originalSceneRef = useRef<{ cue: Cue | null; blockIndex: number } | null>(null)
  const overrideCueRef = useRef<Cue | null>(null)

  React.useEffect(() => {
    if (!colorPicker) return
    const closeOutside = (event: MouseEvent) => {
      if (!colorPickerRef.current?.contains(event.target as Node)) setColorPicker(null)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setColorPicker(null)
    }
    document.addEventListener('mousedown', closeOutside)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOutside)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [colorPicker])

  React.useEffect(() => {
    if (overrideInfo && overrideCueRef.current && live.cue !== overrideCueRef.current) {
      originalSceneRef.current = null
      overrideCueRef.current = null
      setOverrideInfo('')
    }
  }, [live.cue, overrideInfo])

  const applyOverride = (type: 'color'|'image'|'video', value: string) => {
    if (!originalSceneRef.current) {
      originalSceneRef.current = { cue: live.cue, blockIndex: live.blockIndex }
    }
    setOverrideInfo(type === 'color' ? value : value.split(/[\\/]/).pop() ?? value)
    let updatedCue: Cue
    if (live.cue?.type === 'song') {
      updatedCue = {
        ...live.cue,
        song: { ...live.cue.song, bg_type: type, bg_value: value },
      }
    } else if (live.cue?.type === 'verse' || live.cue?.type === 'background') {
      updatedCue = { ...live.cue, bg_type: type, bg_value: value }
    } else {
      // Standalone video cues always render their own filepath. Replace them
      // with a real background cue and restore the exact original scene later.
      updatedCue = {
        id: live.cue?.id ?? 'vj-override',
        type: 'background',
        label: live.cue ? `${live.cue.label} · BG Override` : 'BG Override',
        bg_type: type,
        bg_value: value,
      }
    }
    overrideCueRef.current = updatedCue
    dispatch({ type: 'PUSH_BLOCK_TO_LIVE', cue: updatedCue, blockIndex: live.blockIndex })
  }

  const clearOverride = () => {
    const originalScene = originalSceneRef.current
    setOverrideInfo('')
    originalSceneRef.current = null
    overrideCueRef.current = null
    if (originalScene) {
      dispatch({
        type: 'PUSH_BLOCK_TO_LIVE',
        cue: originalScene.cue,
        blockIndex: originalScene.blockIndex,
      })
    }
  }

  const applyColor = (value: string, close = true) => {
    setColorValue(value)
    applyOverride('color', value)
    if (close) setColorPicker(null)
  }

  return (
    <div className="vj-panel">
      <div className="vj-controls-row">
        <button className="vj-bg-btn" onClick={event => {
          const width = 190
          const height = 132
          setColorPicker({
            x: Math.max(8, Math.min(event.clientX, window.innerWidth - width - 8)),
            y: Math.max(8, Math.min(event.clientY + 8, window.innerHeight - height - 8)),
          })
        }}>🎨 Color</button>
        {overrideInfo && <button className="vj-clear-btn" onClick={clearOverride}>✕ Clear</button>}
        <span className="vj-label">Fade</span>
        <input type="range" min={0} max={3000} step={100} value={fadeDuration}
          onChange={e => {
            const value = Number(e.target.value)
            setFadeDuration(value)
            SettingsAPI.set('fade_duration', String(value))
          }}
          className="fade-slider" style={{ flex: 1 }} />
        <span className="vj-fade-val">{(fadeDuration / 1000).toFixed(1)}s</span>
      </div>

      {colorPicker && createPortal(
        <div
          ref={colorPickerRef}
          className="vj-color-popover"
          style={{ left: colorPicker.x, top: colorPicker.y }}
        >
          <div className="vj-color-swatches">
            {['#000000', '#ffffff', '#991b1b', '#ea580c', '#ca8a04', '#15803d', '#0369a1', '#1d4ed8', '#6d28d9', '#be185d'].map(color => (
              <button
                key={color}
                className="vj-color-swatch"
                style={{ backgroundColor: color }}
                onClick={() => applyColor(color)}
                aria-label={`Use color ${color}`}
              />
            ))}
          </div>
          <label className="vj-custom-color">
            <span>Custom</span>
            <input
              type="color"
              value={colorValue}
              onChange={event => applyColor(event.target.value)}
              aria-label="Choose a custom background color"
            />
            <code>{colorValue}</code>
          </label>
        </div>,
        document.body
      )}

      {overrideInfo && <div className="vj-override-info">Override: {overrideInfo}</div>}

      <div className="vj-media-header">
        <span className="vj-label">
          Backgrounds
          {items.length > 0 && (
            <span className="vj-item-count">
              {' '}{mediaPageStart + 1}–{Math.min(mediaPageStart + visibleItems.length, items.length)}/{items.length}
            </span>
          )}
        </span>
        <div className="vj-view-options" aria-label="Background grid size">
          {mediaPageCount > 1 && (
            <div className="vj-pagination" aria-label="Background pages">
              <button
                type="button"
                onClick={() => setMediaPage(current => Math.max(0, current - 1))}
                disabled={mediaPage === 0}
                aria-label="Previous background page"
              >‹</button>
              <span>{mediaPage + 1}/{mediaPageCount}</span>
              <button
                type="button"
                onClick={() => setMediaPage(current => Math.min(mediaPageCount - 1, current + 1))}
                disabled={mediaPage >= mediaPageCount - 1}
                aria-label="Next background page"
              >›</button>
            </div>
          )}
          <span className="vj-view-label">Grid</span>
          <input
            className="vj-grid-slider"
            type="range"
            min={2}
            max={5}
            step={1}
            value={gridColumns}
            onChange={event => setGridColumns(Number(event.target.value) as 2 | 3 | 4 | 5)}
            aria-label="VJ background grid density"
          />
          <output className="vj-grid-value">{gridColumns}×{gridColumns}</output>
        </div>
      </div>

      {!folder && <div className="vj-hint">Select a media folder in Settings.</div>}

      <div
        ref={mediaGridRef}
        className={`vj-media-grid grid-${gridColumns}`}
        style={{ gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))` }}
      >
        {visibleItems.map(item => (
          <div key={item.id}
            className="vj-media-thumb"
            role="button"
            tabIndex={0}
            aria-label={`Apply ${item.filename} as background`}
            onMouseEnter={() => setPreviewItemId(item.id)}
            onMouseLeave={() => setPreviewItemId(current => current === item.id ? null : current)}
            onFocus={() => setPreviewItemId(item.id)}
            onBlur={event => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setPreviewItemId(current => current === item.id ? null : current)
              }
            }}
            onClick={() => applyOverride(item.type as 'image'|'video', item.filepath)}
            onKeyDown={event => {
              if (event.target !== event.currentTarget) return
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                applyOverride(item.type as 'image'|'video', item.filepath)
              }
            }}
          >
            <MediaThumbnail
              type={item.type}
              src={mediaUrl(item.filepath)}
              alt={item.filename}
              className="vj-thumb-media"
              preview={item.type === 'video' && previewItemId === item.id}
            />
            <span className="vj-thumb-label">{item.filename.slice(0, 16)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
