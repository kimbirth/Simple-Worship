import { resolvedOverlay } from '../types'
import type { SceneState, VersePart } from '../types'
import { DEFAULT_FONT } from '../types'
import { mediaUrl } from './mediaUrl'
import { resolveBackground } from './background'
import type { ResolvedBg } from './background'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CompositorOptions {
  canvas: HTMLCanvasElement
  width: number
  height: number
}

interface Layer {
  type: 'color' | 'image' | 'video' | 'black' | 'logo'
  src?: string
  color?: string
  image?: HTMLImageElement
  video?: HTMLVideoElement
}

// ─── Compositor Class ─────────────────────────────────────────────────────────

export class Compositor {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private W: number
  private H: number

  private currentLayer: Layer = { type: 'black' }

  // Animation loop
  private rafId: number | null = null
  private destroyed = false

  // Current scene
  private currentScene: SceneState | null = null

  // Image / video cache
  private imageCache = new Map<string, HTMLImageElement>()
  private videoCache = new Map<string, HTMLVideoElement>()

  // Logo image
  private logoImage: HTMLImageElement | null = null
  private logoSrc = ''

  // App-wide default background (used when a cue's bg_type is 'default')
  private defaultBg: ResolvedBg | null = null

  constructor(opts: CompositorOptions) {
    this.canvas = opts.canvas
    this.ctx = opts.canvas.getContext('2d', { alpha: false })!
    this.W = opts.width
    this.H = opts.height

    this.canvas.width = this.W
    this.canvas.height = this.H

    this.requestRender()
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  resize(width: number, height: number) {
    if (width < 1 || height < 1) return
    this.W = width
    this.H = height
    this.canvas.width  = width
    this.canvas.height = height
    this.requestRender()
  }

  setLogo(src: string) {
    this.logoSrc = src
    this.logoImage = null
    if (!src) {
      this.requestRender()
      return
    }
    const img = new Image()
    img.onload = () => {
      if (this.destroyed || this.logoSrc !== src) return
      this.logoImage = img
      this.requestRender()
    }
    img.onerror = () => {
      if (this.logoSrc === src) this.requestRender()
    }
    img.src = src
  }

  pushScene(scene: SceneState) {
    this.currentLayer.video?.pause()
    this.currentScene = scene
    this.currentLayer = this.buildLayerFromScene(scene)
    const video = this.currentLayer.video
    if (video) {
      video.pause()
      if (video.readyState < 2) {
        video.load()
      } else if (Math.abs(video.currentTime) > 0.01) {
        video.currentTime = 0
      }
    }
    this.requestRender()
  }

  setDefaultBackground(bg: ResolvedBg | null) {
    this.defaultBg = bg
    if (this.currentScene) this.pushScene(this.currentScene)
    else this.requestRender()
  }

  destroy() {
    this.destroyed = true
    if (this.rafId !== null) cancelAnimationFrame(this.rafId)
    this.rafId = null
    // Stop all cached videos
    this.videoCache.forEach((v) => { v.pause(); v.src = '' })
    this.videoCache.clear()
    this.imageCache.clear()
  }

  private buildLayerFromScene(scene: SceneState): Layer {
    const { cue } = scene
    const overlay = resolvedOverlay(scene.overlays)

    if (overlay === 'black') return { type: 'black' }
    if (overlay === 'logo') return { type: 'logo' }
    if (!cue) return { type: 'black' }

    if (cue.type === 'song') {
      const { type, value } = resolveBackground(cue.song.bg_type, cue.song.bg_value, this.defaultBg)
      if (type === 'color') return { type: 'color', color: value }
      if (type === 'image') return this.buildImageLayer(value)
      if (type === 'video') return this.buildVideoLayer(value)
    }

    if (cue.type === 'video') {
      return this.buildVideoLayer(cue.media.filepath)
    }

    if (cue.type === 'background') {
      const { type, value } = resolveBackground(cue.bg_type, cue.bg_value, this.defaultBg)
      if (type === 'color') return { type: 'color', color: value }
      if (type === 'image') return this.buildImageLayer(value)
      if (type === 'video') return this.buildVideoLayer(value)
    }

    if (cue.type === 'verse') {
      const { type, value } = resolveBackground(cue.bg_type, cue.bg_value, this.defaultBg)
      if (type === 'color') return { type: 'color', color: value }
      if (type === 'image') return this.buildImageLayer(value)
      if (type === 'video') return this.buildVideoLayer(value)
    }

    return { type: 'black' }
  }

  private buildImageLayer(src: string): Layer {
    if (!src) return { type: 'black' }
    src = mediaUrl(src)
    if (this.imageCache.has(src)) {
      return { type: 'image', src, image: this.imageCache.get(src)! }
    }
    const img = new Image()
    this.imageCache.set(src, img)
    img.onload = () => {
      if (this.currentLayer.type === 'image' && this.currentLayer.src === src) {
        this.requestRender()
      }
    }
    img.onerror = () => {
      if (this.currentLayer.type === 'image' && this.currentLayer.src === src) {
        this.requestRender()
      }
    }
    img.src = src
    return { type: 'image', src, image: img }
  }

  private buildVideoLayer(src: string): Layer {
    if (!src) return { type: 'black' }
    src = mediaUrl(src)

    let video: HTMLVideoElement
    if (this.videoCache.has(src)) {
      video = this.videoCache.get(src)!
    } else {
      video = document.createElement('video')
      video.src = src
      video.loop = true
      video.muted = true
      video.playsInline = true
      video.preload = 'auto'
      const renderFirstFrame = () => {
        if (this.currentLayer.type !== 'video' || this.currentLayer.video !== video) return
        video.pause()
        if (video.readyState >= 2 && Math.abs(video.currentTime) > 0.01) {
          video.currentTime = 0
        } else {
          this.requestRender()
        }
      }
      video.addEventListener('loadeddata', renderFirstFrame)
      video.addEventListener('seeked', renderFirstFrame)
      video.addEventListener('error', renderFirstFrame)
      this.videoCache.set(src, video)
    }

    return { type: 'video', src, video }
  }

  // ── Render Loop ──────────────────────────────────────────────────────────────

  private requestRender() {
    if (this.destroyed || this.rafId !== null) return
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null
      if (this.destroyed) return
      this.render()
    })
  }

  private render() {
    const ctx = this.ctx
    const W = this.W
    const H = this.H

    ctx.clearRect(0, 0, W, H)

    this.drawLayer(ctx, this.currentLayer, W, H)

    // Draw lyrics on top (always full alpha)
    ctx.globalAlpha = 1
    if (this.currentScene) {
      this.drawSceneText(ctx, this.currentScene, W, H)
    }
  }

  // ── Layer Drawing ────────────────────────────────────────────────────────────

  private drawLayer(ctx: CanvasRenderingContext2D, layer: Layer, W: number, H: number) {
    switch (layer.type) {
      case 'black':
        ctx.fillStyle = '#000000'
        ctx.fillRect(0, 0, W, H)
        break

      case 'logo':
        ctx.fillStyle = '#000000'
        ctx.fillRect(0, 0, W, H)
        if (this.logoImage) {
          drawCover(ctx, this.logoImage, W, H)
        }
        break

      case 'color':
        ctx.fillStyle = layer.color ?? '#000000'
        ctx.fillRect(0, 0, W, H)
        break

      case 'image':
        ctx.fillStyle = '#000000'
        ctx.fillRect(0, 0, W, H)
        if (layer.image?.complete && layer.image.naturalWidth > 0) {
          drawCover(ctx, layer.image, W, H)
        }
        break

      case 'video':
        ctx.fillStyle = '#000000'
        ctx.fillRect(0, 0, W, H)
        if (layer.video && layer.video.readyState >= 2) {
          drawCover(ctx, layer.video, W, H)
        }
        break
    }
  }

  // ── Text Drawing ──────────────────────────────────────────────────────────────

  private drawSceneText(ctx: CanvasRenderingContext2D, scene: SceneState, W: number, H: number) {
    const { cue, blockIndex } = scene
    const overlay = resolvedOverlay(scene.overlays)

    // Overlays that suppress text
    if (overlay === 'black' || overlay === 'logo' || overlay === 'clear') return
    if (!cue) return

    let lines: string[] = []
    if (cue.type === 'song') {
      const block = cue.blocks[blockIndex]
      if (block) lines = block.lines
    }

    if (cue.type === 'verse') {
      drawVerseOnCanvas(ctx, W, H, cue.parts, cue.reference)
      return
    }

    if (lines.length === 0) return

    drawLyricsOnCanvas(ctx, W, H, lines)
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Draw an image/video element scaled to cover the canvas (like CSS object-fit: cover) */
function drawCover(
  ctx: CanvasRenderingContext2D,
  source: HTMLImageElement | HTMLVideoElement,
  W: number,
  H: number
) {
  const sw = source instanceof HTMLVideoElement ? source.videoWidth  : source.naturalWidth
  const sh = source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight
  if (!sw || !sh) return

  const scale = Math.max(W / sw, H / sh)
  const dw = sw * scale
  const dh = sh * scale
  const dx = (W - dw) / 2
  const dy = (H - dh) / 2

  ctx.drawImage(source, dx, dy, dw, dh)
}

/** Break a single line into multiple lines that each fit maxWidth, on word
 *  boundaries. ctx.font must already be set to the size being measured at.
 *  A single word wider than maxWidth is kept whole on its own line rather
 *  than being split mid-word. */
export function wrapLine(ctx: CanvasRenderingContext2D, line: string, maxWidth: number): string[] {
  if (line === '') return ['']
  const words = line.split(' ')
  const wrapped: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (!current || ctx.measureText(candidate).width <= maxWidth) {
      current = candidate
    } else {
      wrapped.push(current)
      current = word
    }
  }
  if (current) wrapped.push(current)
  return wrapped
}

export function wrapAllLines(ctx: CanvasRenderingContext2D, lines: string[], maxWidth: number): string[] {
  const out: string[] = []
  for (const line of lines) out.push(...wrapLine(ctx, line, maxWidth))
  return out
}

/** Auto-sizing lyrics renderer for the operator previews. */
// Shared shadow + outline settings for both lyric and verse canvas text,
// matching the real output window: distance 8px, angle 110° (0°=right,
// clockwise), 0 blur = sharp. Canvas preview is rendered at whatever size
// W/H are, so the 8px is scaled relative to a 1920px-wide reference (the
// preview canvas is typically half that) to stay visually proportional.
const TEXT_SHADOW_DISTANCE = 4
const TEXT_SHADOW_ANGLE_DEG = 60
const STROKE_WIDTH_RATIO = 0.0572

function applyTextShadow(ctx: CanvasRenderingContext2D, W: number) {
  const scale = W / 1920
  const angleRad = (TEXT_SHADOW_ANGLE_DEG * Math.PI) / 180
  ctx.shadowColor   = 'rgba(0,0,0,0.95)'
  ctx.shadowBlur    = 0
  ctx.shadowOffsetX = TEXT_SHADOW_DISTANCE * scale * Math.cos(angleRad)
  ctx.shadowOffsetY = TEXT_SHADOW_DISTANCE * scale * Math.sin(angleRad)
}

function clearTextShadow(ctx: CanvasRenderingContext2D) {
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur  = 0
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 0
}

/** Draws an outlined+filled text run: stroke first (behind), fill on top —
 *  same visual effect as the output window's `paint-order: stroke fill`.
 *  The shadow is only cast by the fill pass; casting it from the stroke
 *  pass too would double it up and look muddier than the CSS version. */
function fillTextWithStroke(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, fontSizePx: number) {
  const { shadowColor, shadowBlur, shadowOffsetX, shadowOffsetY } = ctx
  ctx.shadowColor = 'transparent'
  ctx.lineWidth = Math.max(fontSizePx * STROKE_WIDTH_RATIO, 1)
  ctx.strokeStyle = '#000000'
  ctx.lineJoin = 'round'
  ctx.miterLimit = 2
  ctx.strokeText(text, x, y)
  ctx.shadowColor = shadowColor
  ctx.shadowBlur = shadowBlur
  ctx.shadowOffsetX = shadowOffsetX
  ctx.shadowOffsetY = shadowOffsetY
  ctx.fillText(text, x, y)
}

function drawLyricsOnCanvas(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  lines: string[]
) {
  if (!lines.length) return

  const padding   = W * 0.07
  const maxWidth  = W - padding * 2
  const safeH     = H * 0.85

  const fontFamily = DEFAULT_FONT.family
  const fontColor  = DEFAULT_FONT.color
  const fontBold   = DEFAULT_FONT.bold
  const fontItalic = DEFAULT_FONT.italic
  const shadowOn   = DEFAULT_FONT.shadowEnabled

  const style = `${fontItalic ? 'italic ' : ''}${fontBold ? 'bold ' : ''}`

  // Start at the fixed 90 px baseline, then shrink only when needed.
  const preferredSize = DEFAULT_FONT.size * (H / 720)
  let fs = Math.min(preferredSize, safeH / (lines.length * 1.3), H / 5)
  fs = Math.floor(fs)
  fs = Math.max(fs, 14)

  let wrapped = lines
  while (fs > 14) {
    ctx.font = `${style}${fs}px "${fontFamily}"`
    wrapped = wrapAllLines(ctx, lines, maxWidth)
    const heightFits = wrapped.length * fs * 1.3 <= safeH
    if (heightFits) break
    fs -= 2
  }

  ctx.font = `${style}${fs}px "${fontFamily}"`
  wrapped = wrapAllLines(ctx, lines, maxWidth)
  const lineHeight = fs * 1.3
  const totalH     = wrapped.length * lineHeight
  let y = (H - totalH) / 2 + fs

  if (shadowOn) applyTextShadow(ctx, W)

  ctx.fillStyle    = fontColor
  ctx.textAlign    = 'center'
  ctx.textBaseline = 'alphabetic'

  for (const line of wrapped) {
    fillTextWithStroke(ctx, line, W / 2, y, fs)
    y += lineHeight
  }

  clearTextShadow(ctx)
}

// ─── Bible Verse Text (superscript verse numbers + citation line) ────────────

interface VerseToken {
  text: string
  superscript: boolean
  spaceBefore: boolean
}

interface LaidOutToken extends VerseToken {
  width: number
}

interface VerseLine {
  tokens: LaidOutToken[]
  width: number
}

function tokenizeVerseParts(parts: VersePart[]): VerseToken[] {
  const tokens: VerseToken[] = []
  parts.forEach((part, pi) => {
    if (part.number) {
      tokens.push({ text: part.number, superscript: true, spaceBefore: pi > 0 })
    }
    part.text.split(/\s+/).filter(Boolean).forEach((word, wordIndex) => {
      tokens.push({
        text: word,
        superscript: false,
        spaceBefore: Boolean(part.number) || pi > 0 || wordIndex > 0,
      })
    })
  })
  return tokens
}

function layoutVerseTokens(
  ctx: CanvasRenderingContext2D,
  tokens: VerseToken[],
  style: string,
  fontFamily: string,
  fs: number,
  superFs: number,
  maxWidth: number
): VerseLine[] {
  ctx.font = `${style}${fs}px "${fontFamily}"`
  const spaceWidth = ctx.measureText(' ').width

  const measured: LaidOutToken[] = tokens.map((t) => {
    ctx.font = `${style}${t.superscript ? superFs : fs}px "${fontFamily}"`
    return { ...t, width: ctx.measureText(t.text).width }
  })

  const lines: VerseLine[] = []
  let current: LaidOutToken[] = []
  let currentWidth = 0
  for (const tok of measured) {
    const gap = tok.spaceBefore && current.length > 0 ? spaceWidth : 0
    if (current.length > 0 && currentWidth + gap + tok.width > maxWidth) {
      lines.push({ tokens: current, width: currentWidth })
      current = [tok]
      currentWidth = tok.width
    } else {
      current.push(tok)
      currentWidth += gap + tok.width
    }
  }
  if (current.length > 0) lines.push({ tokens: current, width: currentWidth })
  return lines
}

/** Auto-sizing renderer for Bible verse slides: wraps the combined verse
 *  body (with inline superscript verse numbers) to fit, then draws a
 *  smaller centered citation line ("Book Chapter:Range VERSION") below it. */
function drawVerseOnCanvas(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  parts: VersePart[],
  reference: string
) {
  if (!parts.length) return

  const padding  = W * 0.08
  const maxWidth = W - padding * 2
  const safeH    = H * 0.82

  const fontFamily = DEFAULT_FONT.family
  const fontColor  = DEFAULT_FONT.color
  const fontBold   = DEFAULT_FONT.bold
  const fontItalic = DEFAULT_FONT.italic
  const shadowOn   = DEFAULT_FONT.shadowEnabled
  const style = `${fontItalic ? 'italic ' : ''}${fontBold ? 'bold ' : ''}`

  const tokens = tokenizeVerseParts(parts)
  const CITATION_RATIO = 0.7
  const GAP_RATIO      = 0.4
  const SUPER_RATIO    = 0.58
  const SUPER_RISE_RATIO = 0.32

  const preferredSize = DEFAULT_FONT.size * (H / 720)
  let fs = Math.floor(Math.max(Math.min(preferredSize, H / 5), 14))

  let wrapped: VerseLine[] = []
  while (fs > 14) {
    const superFs = Math.max(fs * SUPER_RATIO, 8)
    wrapped = layoutVerseTokens(ctx, tokens, style, fontFamily, fs, superFs, maxWidth)
    const citationFs = Math.max(fs * CITATION_RATIO, 12)
    const totalH = wrapped.length * (fs * 1.35) + fs * GAP_RATIO + citationFs * 1.3
    if (totalH <= safeH) break
    fs -= 2
  }
  const superFs = Math.max(fs * SUPER_RATIO, 8)
  wrapped = layoutVerseTokens(ctx, tokens, style, fontFamily, fs, superFs, maxWidth)

  const bodyLineHeight = fs * 1.35
  const citationFs = Math.max(Math.floor(fs * CITATION_RATIO), 12)
  const citationLineHeight = citationFs * 1.3
  const gap = fs * GAP_RATIO
  const totalH = wrapped.length * bodyLineHeight + gap + citationLineHeight
  const top = (H - totalH) / 2

  if (shadowOn) applyTextShadow(ctx, W)

  ctx.fillStyle    = fontColor
  ctx.textBaseline = 'alphabetic'
  const superRise = fs * SUPER_RISE_RATIO

  let y = top + fs
  for (const line of wrapped) {
    let x = W / 2 - line.width / 2
    const lineStartX = x
    for (const tok of line.tokens) {
      if (tok.spaceBefore && x > lineStartX) {
        ctx.font = `${style}${fs}px "${fontFamily}"`
        x += ctx.measureText(' ').width
      }
      const tokFs = tok.superscript ? superFs : fs
      ctx.font = `${style}${tokFs}px "${fontFamily}"`
      ctx.textAlign = 'left'
      fillTextWithStroke(ctx, tok.text, x, tok.superscript ? y - superRise : y, tokFs)
      x += tok.width
    }
    y += bodyLineHeight
  }

  ctx.font = `${style}${citationFs}px "${fontFamily}"`
  ctx.textAlign = 'center'
  fillTextWithStroke(ctx, reference, W / 2, top + wrapped.length * bodyLineHeight + gap + citationFs, citationFs)

  clearTextShadow(ctx)
}
