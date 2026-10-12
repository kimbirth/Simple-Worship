import { mediaUrl } from '../../utils/mediaUrl'
import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useStore } from '../../store/AppStore'
import { Compositor } from '../../utils/compositor'
import { tagColor } from '../../utils/lyricsParser'
import { usePanelResize } from '../../hooks/usePanelResize'
import DefaultBackgroundPicker from '../media/DefaultBackgroundPicker'

export default function PreviewPanel() {
  const { state, setPreviewBlock, pushBlockToLive } = useStore()
  const { preview, logoPath, defaultBg } = state

  const canvasRef   = useRef<HTMLCanvasElement>(null)
  const compRef     = useRef<Compositor | null>(null)
  const wrapRef     = useRef<HTMLDivElement>(null)
  const defaultBackgroundTriggerRef = useRef<HTMLButtonElement>(null)
  const [backgroundPickerOpen, setBackgroundPickerOpen] = useState(false)

  // Resizable blocks height
  const [blocksH, setBlocksH] = useState(() => {
    const saved = Number(
      localStorage.getItem('simpleworship:staging-blocks-height:v1')
      ?? localStorage.getItem('worship-presenter:staging-blocks-height:v1')
    )
    return Number.isFinite(saved) && saved >= 72 ? Math.min(saved, window.innerHeight - 150) : 300
  })
  useEffect(() => {
    localStorage.setItem('simpleworship:staging-blocks-height:v1', String(blocksH))
  }, [blocksH])
  const onResize = useCallback((d: number) => {
    setBlocksH(h => Math.max(72, Math.min(window.innerHeight - 150, h + d)))
  }, [])
  const dragHandle = usePanelResize(onResize, false)

  // Init compositor
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    compRef.current = new Compositor({ canvas, width: 960, height: 540 })
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

  // Resize canvas to match container using ResizeObserver
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const obs = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width } = entry.contentRect
        const canvas = canvasRef.current
        if (!canvas || !compRef.current || width < 10) return
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
  useEffect(() => { compRef.current?.pushScene(preview) }, [preview])

  const cue    = preview.cue
  const blocks = cue?.type === 'song' ? cue.blocks : []
  const defaultBackgroundLabel = defaultBg?.type === 'color'
    ? defaultBg.value || '#000000'
    : defaultBg?.value.split(/[\\/]/).pop() || `No ${defaultBg?.type ?? 'color'} selected`

  const closeBackgroundPicker = () => {
    setBackgroundPickerOpen(false)
    requestAnimationFrame(() => defaultBackgroundTriggerRef.current?.focus())
  }

  return (
    <div className="preview-panel">
      <div className="panel-header-bar">
        <span className="panel-label">STAGING</span>
        {cue
          ? <span className="panel-cue-name">{cue.label}{blocks.length > 0 ? ` · ${preview.blockIndex + 1}/${blocks.length}` : ''}</span>
          : <span className="panel-cue-name muted">Click a schedule cue to stage it</span>
        }
        <button
          ref={defaultBackgroundTriggerRef}
          type="button"
          className="default-background-trigger"
          onClick={() => setBackgroundPickerOpen(true)}
          title={`Default background: ${defaultBackgroundLabel}`}
          aria-label={`Choose default background. Current: ${defaultBackgroundLabel}`}
          aria-haspopup="dialog"
          aria-expanded={backgroundPickerOpen}
        >
          <span
            className={`default-background-trigger-icon type-${defaultBg?.type ?? 'color'}`}
            style={defaultBg?.type === 'color' ? { backgroundColor: defaultBg.value || '#000000' } : undefined}
            aria-hidden="true"
          >{defaultBg?.type === 'image' ? '🖼' : defaultBg?.type === 'video' ? '▶' : ''}</span>
          <span>DEFAULT BG</span>
        </button>
        <button
          type="button"
          className="push-to-production-btn"
          onClick={() => cue && pushBlockToLive(cue, preview.blockIndex)}
          disabled={!cue}
          title={cue ? `Push ${cue.label} to Production` : 'Stage a cue before pushing to Production'}
          aria-label={cue ? `Push ${cue.label} to Production` : 'Push to Production unavailable; no cue is staged'}
        >
          <span aria-hidden="true">▶</span>
          <span>PUSH TO PRODUCTION</span>
        </button>
      </div>

      {backgroundPickerOpen && <DefaultBackgroundPicker onClose={closeBackgroundPicker} />}

      {/* Block cards */}
      <div className="block-cards-wrap" style={{ height: blocksH, flexShrink: 0 }}>
        <div className="block-cards-scroll">
          {!cue && (
            <div className="empty-state" style={{ width: '100%' }}>
              <p>No cue staged</p>
            </div>
          )}
          {blocks.map((b, i) => {
            const color    = tagColor(b.tag)
            const isStaged = preview.blockIndex === i
            return (
              <div key={i}
                className={`block-card-h ${isStaged ? 'staged' : ''}`}
                style={{ '--bc': color } as React.CSSProperties}
                role="button"
                tabIndex={0}
                aria-pressed={isStaged}
                aria-label={`Stage ${b.tag}; press Enter to select or double-click to take live`}
                onClick={() => setPreviewBlock(i)}
                onDoubleClick={() => cue && pushBlockToLive(cue, i)}
                onKeyDown={event => {
                  if (event.target !== event.currentTarget) return
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    setPreviewBlock(i)
                  }
                }}
              >
                <div className="bch-accent" />
                <div className="bch-body">
                  <span className="bch-tag">{b.tag}</span>
                  {b.lines.map((l, li) => <span key={li} className="bch-line">{l}</span>)}
                </div>

              </div>
            )
          })}
        </div>
      </div>

      <div
        className="resize-handle-h"
        onMouseDown={dragHandle}
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize staging blocks and preview"
        tabIndex={0}
        onKeyDown={event => {
          if (event.key === 'ArrowUp') { event.preventDefault(); onResize(-12) }
          if (event.key === 'ArrowDown') { event.preventDefault(); onResize(12) }
        }}
      />

      {/* Canvas — fills remaining space, scales with container */}
      <div ref={wrapRef} className="preview-canvas-area">
        <canvas ref={canvasRef} className="preview-canvas-responsive" />
        <div className="preview-info">
          Staging — double-click a block to push it live
        </div>
      </div>
    </div>
  )
}
