import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import ReactDOM from 'react-dom/client'
import type { SceneState, VersePart } from './types'
import { DEFAULT_FONT, resolvedOverlay } from './types'
import { mediaUrl } from './utils/mediaUrl'
import { resolveBackground } from './utils/background'
import type { ResolvedBg } from './utils/background'
import './styles/output.css'

type Background =
  | { key: string; type: 'color'; color: string }
  | { key: string; type: 'image' | 'video'; src: string; fit: 'cover' | 'contain' }

const BLACK: Background = { key: 'color:#000000', type: 'color', color: '#000000' }

function backgroundFor(scene: SceneState | null, logoPath: string, defaultBg: ResolvedBg | null): Background {
  if (!scene) return BLACK
  const overlay = resolvedOverlay(scene.overlays)
  if (overlay === 'black') return BLACK
  if (overlay === 'logo') {
    return logoPath
      ? { key: `logo:${logoPath}`, type: 'image', src: mediaUrl(logoPath), fit: 'contain' }
      : BLACK
  }

  const cue = scene.cue
  if (!cue) return BLACK

  let type: 'color' | 'image' | 'video' = 'color'
  let value = '#000000'
  if (cue.type === 'song') {
    const resolved = resolveBackground(cue.song.bg_type, cue.song.bg_value, defaultBg)
    type = resolved.type
    value = resolved.value
  } else if (cue.type === 'video') {
    type = 'video'
    value = cue.media.filepath
  } else if (cue.type === 'background') {
    const resolved = resolveBackground(cue.bg_type, cue.bg_value, defaultBg)
    type = resolved.type
    value = resolved.value
  } else if (cue.type === 'verse') {
    const resolved = resolveBackground(cue.bg_type, cue.bg_value, defaultBg)
    type = resolved.type
    value = resolved.value
  }

  if (type === 'color') return { key: `color:${value}`, type, color: value || '#000000' }
  return { key: `${type}:${value}`, type, src: mediaUrl(value), fit: 'cover' }
}

function BackgroundLayer({ background, visible, fadeDuration, onReady, onError }: {
  background: Background
  visible: boolean
  fadeDuration: number
  onReady: () => void
  onError: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const settled = useRef(false)

  const reportReady = useCallback(() => {
    if (settled.current) return
    settled.current = true
    onReady()
  }, [onReady])

  const reportError = useCallback(() => {
    if (settled.current) return
    settled.current = true
    onError()
  }, [onError])

  useEffect(() => {
    if (background.type === 'color') {
      reportReady()
      return
    }
    if (background.type === 'image') {
      const image = imageRef.current
      if (image?.complete && image.naturalWidth > 0) reportReady()
      return
    }
    const video = videoRef.current
    if (video && video.readyState >= 2) reportReady()
  }, [background.key, background.type, reportReady])

  useEffect(() => {
    if (background.type === 'color' || settled.current) return
    const timeout = window.setTimeout(reportError, 10000)
    return () => window.clearTimeout(timeout)
  }, [background.key, background.type, reportError])

  useEffect(() => {
    const video = videoRef.current
    if (!video || background.type !== 'video') return
    let pauseTimer: number | undefined
    if (visible) {
      video.play().catch(() => {})
    } else {
      pauseTimer = window.setTimeout(() => video.pause(), fadeDuration + 80)
    }
    return () => { if (pauseTimer) window.clearTimeout(pauseTimer) }
  }, [background.key, background.type, fadeDuration, visible])

  return (
    <div
      className={`output-background-layer ${visible ? 'visible' : ''}`}
      style={{ transitionDuration: `${fadeDuration}ms` }}
    >
      {background.type === 'color' && (
        <div className="output-background-fill" style={{ backgroundColor: background.color }} />
      )}
      {background.type === 'image' && (
        <img
          ref={imageRef}
          className={`output-background-media fit-${background.fit}`}
          src={background.src}
          alt=""
          onLoad={reportReady}
          onError={reportError}
          draggable={false}
        />
      )}
      {background.type === 'video' && (
        <video
          ref={videoRef}
          className="output-background-media fit-cover"
          src={background.src}
          muted
          loop
          playsInline
          preload="auto"
          onCanPlay={reportReady}
          onError={reportError}
        />
      )}
    </div>
  )
}

function CrossfadeBackground({ desired, fadeDuration, requestKey, onDisplayed }: {
  desired: Background
  fadeDuration: number
  requestKey: string
  onDisplayed: (requestKey: string) => void
}) {
  const [layers, setLayers] = useState<[Background, Background]>([BLACK, BLACK])
  const [active, setActive] = useState(0)
  const requested = useRef({ slot: 0, key: BLACK.key, requestKey })
  const lastDisplayed = useRef('')
  const failedFor = useRef<{ desiredKey: string; fallback: Background } | null>(null)
  const readyKeys = useRef<[string | null, string | null]>([null, null])

  useEffect(() => {
    if (failedFor.current && failedFor.current.desiredKey !== desired.key) {
      failedFor.current = null
    }
    const target = failedFor.current?.desiredKey === desired.key
      ? failedFor.current.fallback
      : desired

    if (layers[active].key === target.key) {
      requested.current = { slot: active, key: target.key, requestKey }
      if (lastDisplayed.current !== requestKey) {
        lastDisplayed.current = requestKey
        onDisplayed(requestKey)
      }
      return
    }
    const inactive = active === 0 ? 1 : 0
    requested.current = { slot: inactive, key: target.key, requestKey }
    if (layers[inactive].key === target.key) {
      if (readyKeys.current[inactive] === target.key) {
        setActive(inactive)
        if (lastDisplayed.current !== requestKey) {
          lastDisplayed.current = requestKey
          onDisplayed(requestKey)
        }
      }
      return
    }
    readyKeys.current[inactive] = null
    setLayers(previous => {
      const next: [Background, Background] = [...previous]
      next[inactive] = target
      return next
    })
  }, [active, desired, layers, onDisplayed, requestKey])

  const ready = useCallback((slot: number, key: string) => {
    readyKeys.current[slot] = key
    const pending = requested.current
    if (pending.slot !== slot || pending.key !== key) return
    setActive(slot)
    if (lastDisplayed.current !== pending.requestKey) {
      lastDisplayed.current = pending.requestKey
      onDisplayed(pending.requestKey)
    }
  }, [onDisplayed])

  const failed = useCallback((slot: number, key: string) => {
    const pending = requested.current
    if (pending.slot !== slot || pending.key !== key) return

    // Never show new content over the previous scene when its requested media
    // cannot load. Replace that slot with a request-specific black layer.
    const fallback: Background = {
      key: `failed:${key}`,
      type: 'color',
      color: '#000000',
    }
    failedFor.current = { desiredKey: key, fallback }
    requested.current = { ...pending, key: fallback.key }
    readyKeys.current[slot] = null
    setLayers(previous => {
      const next: [Background, Background] = [...previous]
      next[slot] = fallback
      return next
    })
  }, [])

  return (
    <div className="output-background-stack">
      {layers.map((background, slot) => (
        <BackgroundLayer
          key={`${slot}-${background.key}`}
          background={background}
          visible={active === slot}
          fadeDuration={fadeDuration}
          onReady={() => ready(slot, background.key)}
          onError={() => failed(slot, background.key)}
        />
      ))}
    </div>
  )
}

type SceneText =
  | { kind: 'lines'; lines: string[] }
  | { kind: 'verse'; parts: VersePart[]; reference: string }
  | { kind: 'empty' }

function sceneText(scene: SceneState | null): SceneText {
  if (!scene || resolvedOverlay(scene.overlays) !== 'none' || !scene.cue) return { kind: 'empty' }
  const { cue, blockIndex } = scene
  if (cue.type === 'song') return { kind: 'lines', lines: cue.blocks[blockIndex]?.lines ?? [] }
  if (cue.type === 'verse') return { kind: 'verse', parts: cue.parts, reference: cue.reference }
  return { kind: 'empty' }
}

function OutputText({ scene }: { scene: SceneState | null }) {
  const content = useMemo(() => sceneText(scene), [scene])
  const textRef = useRef<HTMLDivElement>(null)
  const fontSize = DEFAULT_FONT.size
  const hasContent = content.kind === 'verse' || (content.kind === 'lines' && content.lines.length > 0)

  useLayoutEffect(() => {
    const element = textRef.current
    if (!element || !hasContent) return
    const fit = () => {
      let size = Math.max(18, fontSize)
      element.style.fontSize = `${size}px`
      while (size > 18 && (element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth)) {
        size -= 2
        element.style.fontSize = `${size}px`
      }
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(document.documentElement)
    return () => observer.disconnect()
  }, [fontSize, hasContent, content])

  if (!hasContent) return null

  return (
    <div className="output-text-safe-area">
      <div
        ref={textRef}
        className={`output-text ${DEFAULT_FONT.shadowEnabled ? 'with-shadow' : ''}`}
        style={{
          color: DEFAULT_FONT.color,
          fontFamily: DEFAULT_FONT.family,
          fontWeight: DEFAULT_FONT.bold ? 700 : 400,
          fontStyle: DEFAULT_FONT.italic ? 'italic' : 'normal',
        }}
      >
        {content.kind === 'lines' &&
          content.lines.map((line, index) => <div key={index}>{line || '\u00a0'}</div>)}
        {content.kind === 'verse' && (
          <>
            <div className="output-verse-body">
              {content.parts.map((part, index) => (
                <span key={index}>
                  {part.number && (
                    <><sup className="output-verse-num">{part.number}</sup>{'\u00a0'}</>
                  )}
                  {part.text}{' '}
                </span>
              ))}
            </div>
            <div className="output-verse-citation">{content.reference}</div>
          </>
        )}
      </div>
    </div>
  )
}

function contentKey(scene: SceneState | null): string {
  if (!scene) return 'empty'
  return JSON.stringify(scene)
}

function CrossfadeContent({ scene, fadeDuration }: { scene: SceneState | null; fadeDuration: number }) {
  const [layers, setLayers] = useState<[SceneState | null, SceneState | null]>([null, null])
  const [active, setActive] = useState(0)
  const activeRef = useRef(0)
  const keysRef = useRef<[string, string]>(['empty', 'empty'])
  const transitionToken = useRef(0)
  const desiredKey = useMemo(() => contentKey(scene), [scene])

  useEffect(() => {
    const currentSlot = activeRef.current
    if (keysRef.current[currentSlot] === desiredKey) {
      setLayers(previous => {
        const next: [SceneState | null, SceneState | null] = [...previous]
        next[currentSlot] = scene
        return next
      })
      return
    }

    const nextSlot = currentSlot === 0 ? 1 : 0
    const token = ++transitionToken.current
    keysRef.current[nextSlot] = desiredKey
    setLayers(previous => {
      const next: [SceneState | null, SceneState | null] = [...previous]
      next[nextSlot] = scene
      return next
    })

    const firstFrame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (transitionToken.current !== token) return
        activeRef.current = nextSlot
        setActive(nextSlot)
      })
    })
    return () => cancelAnimationFrame(firstFrame)
  }, [desiredKey, scene])

  return (
    <div className="output-content-stack">
      {layers.map((layerScene, slot) => (
        <div
          key={slot}
          className={`output-content-layer ${active === slot ? 'visible' : ''}`}
          style={{ transitionDuration: `${fadeDuration}ms` }}
        >
          <OutputText scene={layerScene} />
        </div>
      ))}
    </div>
  )
}

function OutputRenderer() {
  const [scene, setScene] = useState<SceneState | null>(null)
  const [displayedScene, setDisplayedScene] = useState<SceneState | null>(null)
  const [fadeDuration, setFadeDuration] = useState(500)
  const [logoPath, setLogoPath] = useState('')
  const [defaultBg, setDefaultBg] = useState<ResolvedBg | null>(null)
  const background = useMemo(() => backgroundFor(scene, logoPath, defaultBg), [logoPath, scene, defaultBg])
  const requestKey = useMemo(() => contentKey(scene), [scene])
  const pendingScene = useRef({ key: requestKey, scene })
  pendingScene.current = { key: requestKey, scene }

  const showScene = useCallback((readyRequestKey: string) => {
    const pending = pendingScene.current
    if (pending.key === readyRequestKey) setDisplayedScene(pending.scene)
  }, [])

  useEffect(() => {
    const api = (window as Window & { outputApi?: {
      triggerHotkey: (command: string) => void
      requestState: () => void
      onSceneUpdate: (callback: (value: SceneState) => void) => () => void
      onFadeDuration: (callback: (value: number) => void) => () => void
      onLogo: (callback: (value: string) => void) => () => void
      onDefaultBg: (callback: (value: ResolvedBg | null) => void) => () => void
    } }).outputApi
    if (!api) return
    const unsubScene = api.onSceneUpdate(setScene)
    const unsubFade = api.onFadeDuration(ms => setFadeDuration(Math.max(0, Math.min(5000, ms))))
    const unsubLogo = api.onLogo(setLogoPath)
    const unsubDefaultBg = api.onDefaultBg(setDefaultBg)
    api.requestState()
    return () => { unsubScene?.(); unsubFade?.(); unsubLogo?.(); unsubDefaultBg?.() }
  }, [])

  useEffect(() => {
    const api = (window as any).outputApi
    if (!api?.triggerHotkey) return
    const handler = (event: KeyboardEvent) => {
      let command = ''
      if (event.key === 'Escape') command = 'close-output'
      else if (['ArrowDown', 'ArrowRight', 'PageDown'].includes(event.key)) command = 'next'
      else if (['ArrowUp', 'ArrowLeft', 'PageUp'].includes(event.key)) command = 'previous'
      else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b') command = 'black'
      else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') command = 'clear'
      else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'l') command = 'logo'
      if (!command) return
      event.preventDefault()
      api.triggerHotkey(command)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <main className="output-stage">
      <CrossfadeBackground
        desired={background}
        fadeDuration={fadeDuration}
        requestKey={requestKey}
        onDisplayed={showScene}
      />
      <CrossfadeContent scene={displayedScene} fadeDuration={fadeDuration} />
    </main>
  )
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(<OutputRenderer />)
