import { useCallback, useEffect, useRef, useState } from 'react'

export interface MediaThumbnailProps {
  type: 'image' | 'video'
  src: string
  alt: string
  className?: string
  /** Keep the media source detached until the owner has finished opening. */
  enabled?: boolean
  /** Play a muted preview while the surrounding card is hovered or focused. */
  preview?: boolean
  onLoadSuccess?: () => void
  onLoadError?: () => void
}

const FIRST_FRAME_SECONDS = 0.08
const OFFSCREEN_UNLOAD_DELAY_MS = 20_000

function findScrollContainer(element: HTMLElement): Element | null {
  let parent = element.parentElement
  while (parent) {
    const style = window.getComputedStyle(parent)
    if (/(auto|scroll)/.test(`${style.overflow} ${style.overflowX} ${style.overflowY}`)) return parent
    parent = parent.parentElement
  }
  return null
}

/**
 * A low-cost media thumbnail. Sources are attached only when the thumbnail is
 * close to the viewport, so large media folders do not start hundreds of
 * decoders at once. Videos seek to an early decoded frame and remain paused
 * until an owning card explicitly requests a preview.
 */
export default function MediaThumbnail({
  type,
  src,
  alt,
  className,
  enabled = true,
  preview = false,
  onLoadSuccess,
  onLoadError,
}: MediaThumbnailProps) {
  const [mediaElement, setMediaElement] = useState<HTMLVideoElement | HTMLImageElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const thumbnailTimeRef = useRef(FIRST_FRAME_SECONDS)
  const unloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [shouldLoad, setShouldLoad] = useState(false)
  const [failed, setFailed] = useState(false)

  const imageRef = useCallback((element: HTMLImageElement | null) => {
    setMediaElement(current => current === element ? current : element)
  }, [])
  const videoElementRef = useCallback((element: HTMLVideoElement | null) => {
    videoRef.current = element
    setMediaElement(current => current === element ? current : element)
  }, [])

  useEffect(() => {
    setShouldLoad(false)
    setFailed(false)
    thumbnailTimeRef.current = FIRST_FRAME_SECONDS
  }, [src, type])

  useEffect(() => {
    if (!enabled) {
      setShouldLoad(false)
      return
    }
    if (!mediaElement || failed) return
    if (typeof IntersectionObserver === 'undefined') {
      setShouldLoad(true)
      return
    }

    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        if (unloadTimerRef.current) clearTimeout(unloadTimerRef.current)
        unloadTimerRef.current = null
        setShouldLoad(true)
        return
      }

      if (unloadTimerRef.current) clearTimeout(unloadTimerRef.current)
      unloadTimerRef.current = setTimeout(() => {
        setShouldLoad(false)
        unloadTimerRef.current = null
      }, OFFSCREEN_UNLOAD_DELAY_MS)
    }, {
      root: findScrollContainer(mediaElement),
      rootMargin: '240px 0px',
    })

    observer.observe(mediaElement)
    return () => {
      observer.disconnect()
      if (unloadTimerRef.current) clearTimeout(unloadTimerRef.current)
      unloadTimerRef.current = null
    }
  }, [enabled, failed, mediaElement, src, type])

  useEffect(() => {
    const video = videoRef.current
    if (!video || failed) return

    if (!shouldLoad) {
      video.pause()
      video.removeAttribute('src')
      video.load()
      return
    }

    if (preview) {
      void video.play().catch(() => {})
      return
    }

    video.pause()
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
      const frameTime = thumbnailTimeRef.current
      if (Math.abs(video.currentTime - frameTime) > 0.04) {
        try { video.currentTime = frameTime } catch { /* unsupported seek */ }
      }
    }
  }, [failed, preview, shouldLoad])

  if (failed) {
    return (
      <div
        className={className}
        role="img"
        aria-label={`${alt} preview unavailable`}
        style={{
          alignItems: 'center',
          background: '#111827',
          color: '#94a3b8',
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <span aria-hidden="true">{type === 'video' ? '▶' : '🖼'}</span>
      </div>
    )
  }

  if (type === 'image') {
    return (
      <img
        ref={imageRef}
        src={shouldLoad ? src : undefined}
        alt={alt}
        className={className}
        loading="lazy"
        decoding="async"
        onLoad={onLoadSuccess}
        onError={() => {
          setFailed(true)
          onLoadError?.()
        }}
      />
    )
  }

  return (
    <video
      ref={videoElementRef}
      src={shouldLoad ? src : undefined}
      muted
      loop
      playsInline
      preload={shouldLoad ? 'metadata' : 'none'}
      className={className}
      aria-label={alt}
      onLoadedMetadata={event => {
        const video = event.currentTarget
        const duration = Number.isFinite(video.duration) ? video.duration : 0
        thumbnailTimeRef.current = duration > 0
          ? Math.min(FIRST_FRAME_SECONDS, Math.max(0, duration - 0.01))
          : FIRST_FRAME_SECONDS
        try { video.currentTime = thumbnailTimeRef.current } catch { /* unsupported seek */ }
      }}
      onLoadedData={event => {
        if (!preview) event.currentTarget.pause()
        onLoadSuccess?.()
      }}
      onError={() => {
        setFailed(true)
        onLoadError?.()
      }}
    />
  )
}
