import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { parseLyrics, tagColor } from '../../utils/lyricsParser'
import { MediaAPI } from '../../utils/api'
import { mediaUrl } from '../../utils/mediaUrl'
import { wrapAllLines } from '../../utils/compositor'
import type { Song, BgType, MediaItem } from '../../types'
import { DEFAULT_FONT } from '../../types'
import { useDialogFocusTrap } from '../../hooks/useDialogFocusTrap'
import MediaThumbnail from '../media/MediaThumbnail'

const MEDIA_PICKER_PAGE_SIZE = 24

interface Props {
  song?: Song | null       // null = new song
  onSave: (song: Partial<Song>) => Promise<boolean>
  onClose: () => void
}

function blockIndexAtCaret(value: string, caret: number): number {
  const headingPattern = /^\s*\[[^\]\r\n]+\]\s*$/gm
  let index = -1
  let match: RegExpExecArray | null
  while ((match = headingPattern.exec(value))) {
    if (match.index > Math.max(0, caret)) break
    index += 1
  }
  return Math.max(0, index)
}

export default function SongEditorModal({ song, onSave, onClose }: Props) {
  const [title, setTitle]     = useState(song?.title   ?? '')
  const [artist, setArtist]   = useState(song?.artist  ?? '')
  const [lyrics, setLyrics]   = useState(song?.lyrics_raw ?? '')
  const [helpOpen, setHelpOpen] = useState(false)
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false)
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([])
  const [mediaLoadState, setMediaLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [mediaLoadError, setMediaLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const dialogRef = useDialogFocusTrap<HTMLDivElement>()
  const helpTriggerRef = useRef<HTMLButtonElement>(null)
  const mediaPickerTriggerRef = useRef<HTMLButtonElement>(null)
  const mediaLoadStartedRef = useRef(false)

  const closeHelp = () => {
    setHelpOpen(false)
    requestAnimationFrame(() => helpTriggerRef.current?.focus())
  }

  const closeMediaPicker = () => {
    setMediaPickerOpen(false)
    requestAnimationFrame(() => mediaPickerTriggerRef.current?.focus())
  }

  // Background — new songs default to 'default' (inherit the app-wide
  // default background from Settings) rather than a hardcoded black.
  const initialBgType: BgType = song?.bg_type ?? 'default'
  const [bgType, setBgType] = useState<BgType>(initialBgType)
  const [bgValues, setBgValues] = useState<Record<BgType, string>>({
    default: initialBgType === 'default' ? song?.bg_value ?? '' : '',
    color: initialBgType === 'color' ? song?.bg_value || '#000000' : '#000000',
    image: initialBgType === 'image' ? song?.bg_value || '' : '',
    video: initialBgType === 'video' ? song?.bg_value || '' : '',
  })
  const bgValue = bgValues[bgType]
  const setBgValue = (value: string) => {
    setBgValues(current => ({ ...current, [bgType]: value }))
  }

  useEffect(() => {
    if (!helpOpen) return
    const closeHelpOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeHelp()
    }
    window.addEventListener('keydown', closeHelpOnEscape)
    return () => window.removeEventListener('keydown', closeHelpOnEscape)
  }, [helpOpen])

  // Escape closes the editor — but not while the help popup is open,
  // where Escape should close that popup first (handled above).
  useEffect(() => {
    const closeEditor = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !helpOpen && !mediaPickerOpen && !saving) onClose()
    }
    window.addEventListener('keydown', closeEditor)
    return () => window.removeEventListener('keydown', closeEditor)
  }, [helpOpen, mediaPickerOpen, onClose, saving])

  // Live block preview
  const blocks = parseLyrics(lyrics)
  const [activeBlock, setActiveBlock] = useState(0)
  const lyricsRef = useRef<HTMLTextAreaElement>(null)

  // Lyrics undo/redo history. Native browser Ctrl+Z is unreliable here
  // because the tag-insert buttons set the textarea's value
  // programmatically (not via a real keystroke), which resets the
  // browser's own undo stack — so we track history ourselves instead.
  const [lyricsHistory, setLyricsHistory] = useState<{ stack: string[]; index: number }>(
    () => ({ stack: [song?.lyrics_raw ?? ''], index: 0 })
  )
  const historyDebounce = useRef<number>()
  const HISTORY_LIMIT = 100

  const recordHistory = (value: string) => {
    setLyricsHistory((h) => {
      if (h.stack[h.index] === value) return h
      const stack = h.stack.slice(0, h.index + 1)
      stack.push(value)
      const overflow = stack.length - HISTORY_LIMIT
      const trimmed = overflow > 0 ? stack.slice(overflow) : stack
      return { stack: trimmed, index: trimmed.length - 1 }
    })
  }

  // Typing: update immediately, but only snapshot into history after a
  // short pause so every keystroke doesn't become its own undo step.
  const commitLyrics = (value: string, immediate = false) => {
    setLyrics(value)
    if (historyDebounce.current) window.clearTimeout(historyDebounce.current)
    if (immediate) recordHistory(value)
    else historyDebounce.current = window.setTimeout(() => recordHistory(value), 500)
  }

  useEffect(() => () => { if (historyDebounce.current) window.clearTimeout(historyDebounce.current) }, [])

  const canUndo = lyricsHistory.index > 0
  const canRedo = lyricsHistory.index < lyricsHistory.stack.length - 1

  const undoLyrics = () => {
    if (historyDebounce.current) { window.clearTimeout(historyDebounce.current); recordHistory(lyrics) }
    setLyricsHistory((h) => {
      if (h.index <= 0) return h
      const index = h.index - 1
      setLyrics(h.stack[index])
      return { ...h, index }
    })
  }
  const redoLyrics = () => {
    setLyricsHistory((h) => {
      if (h.index >= h.stack.length - 1) return h
      const index = h.index + 1
      setLyrics(h.stack[index])
      return { ...h, index }
    })
  }

  const followLyricsCaret = (target: HTMLTextAreaElement, value = target.value) => {
    const index = blockIndexAtCaret(value, target.selectionStart ?? 0)
    setActiveBlock(Math.min(index, Math.max(0, parseLyrics(value).length - 1)))
  }

  // Insert a "[Tag]" heading at the current caret position (replacing any
  // selection), on its own line, then put focus back with the caret placed
  // right after it so the person can keep typing lyrics immediately.
  const insertTag = (tag: string) => {
    const textarea = lyricsRef.current
    const heading = `[${tag}]`
    if (!textarea) {
      commitLyrics(lyrics ? `${lyrics}\n\n${heading}\n` : `${heading}\n`, true)
      return
    }

    const start = textarea.selectionStart ?? lyrics.length
    const end = textarea.selectionEnd ?? lyrics.length
    const before = lyrics.slice(0, start)
    const after = lyrics.slice(end)

    // Make sure the heading starts on its own blank line.
    const needsLeadingBreak = before.length > 0 && !before.endsWith('\n\n')
    const leadingBreak = before.length === 0 ? '' : before.endsWith('\n') ? '\n' : '\n\n'
    const insertion = `${needsLeadingBreak ? leadingBreak : ''}${heading}\n`

    const nextValue = before + insertion + after
    const caret = (before + insertion).length

    commitLyrics(nextValue, true)
    requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(caret, caret)
      followLyricsCaret(textarea, nextValue)
    })
  }

  // Insert a "[Title]" block pulling from the Title/Artist fields above.
  const insertTitleBlock = () => {
    const textarea = lyricsRef.current
    const titleLine = title.trim() || 'Untitled'
    const body = artist.trim() ? `[Title]\n${titleLine}\nby: ${artist.trim()}\n` : `[Title]\n${titleLine}\n`
    if (!textarea) {
      commitLyrics(lyrics ? `${lyrics}\n\n${body}` : body, true)
      return
    }

    const start = textarea.selectionStart ?? lyrics.length
    const end = textarea.selectionEnd ?? lyrics.length
    const before = lyrics.slice(0, start)
    const after = lyrics.slice(end)

    const needsLeadingBreak = before.length > 0 && !before.endsWith('\n\n')
    const leadingBreak = before.length === 0 ? '' : before.endsWith('\n') ? '\n' : '\n\n'
    const insertion = `${needsLeadingBreak ? leadingBreak : ''}${body}`

    const nextValue = before + insertion + after
    const caret = (before + insertion).length

    commitLyrics(nextValue, true)
    requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(caret, caret)
      followLyricsCaret(textarea, nextValue)
    })
  }

  const handleSave = async () => {
    if (!title.trim()) return
    if ((bgType === 'image' || bgType === 'video') && !bgValue) {
      setSaveError(`Choose a ${bgType} file before saving.`)
      return
    }
    setSaving(true)
    setSaveError('')
    try {
      const saved = await onSave({
        ...(song?.id ? { id: song.id } : {}),
        title: title.trim(),
        artist: artist.trim(),
        lyrics_raw: lyrics,
        bg_type: bgType,
        bg_value: bgValue,
      })
      if (saved) onClose()
      else setSaveError('The song could not be saved. Your changes are still here; please try again.')
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'The song could not be saved. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const loadMediaLibrary = () => {
    // Fetch the index only once per editor session. Search and paging then
    // stay entirely local, keeping large media libraries responsive. A failed
    // request clears the guard so the picker can retry without closing.
    if (mediaLoadStartedRef.current) return
    mediaLoadStartedRef.current = true
    setMediaLoadState('loading')
    setMediaLoadError('')
    void MediaAPI.getAll()
      .then(items => {
        setMediaItems(items)
        setMediaLoadState('ready')
      })
      .catch(error => {
        mediaLoadStartedRef.current = false
        setMediaLoadError(error instanceof Error ? error.message : 'The media library could not be loaded.')
        setMediaLoadState('error')
      })
  }

  const openMediaPicker = () => {
    if (bgType !== 'image' && bgType !== 'video') return
    setMediaPickerOpen(true)
    loadMediaLibrary()
  }

  const selectLibraryBackground = (item: MediaItem) => {
    setBgValues(current => ({ ...current, [item.type]: item.filepath }))
    setSaveError('')
    closeMediaPicker()
  }

  const currentBlock = blocks[activeBlock]

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && !saving && onClose()}>
      <div ref={dialogRef} className="song-editor-modal" role="dialog" aria-modal="true" aria-labelledby="song-editor-title">

        {/* ── Header ── */}
        <div className="modal-header">
          <span className="modal-title" id="song-editor-title">{song ? 'Edit Song' : 'New Song'}</span>
          <div className="modal-header-actions">
            <button ref={helpTriggerRef} className="modal-help-btn" onClick={() => setHelpOpen(true)} aria-label="Open song block help">?</button>
            <button
              className="modal-save-btn"
              onClick={() => { void handleSave() }}
              disabled={!title.trim() || saving || ((bgType === 'image' || bgType === 'video') && !bgValue)}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button className="modal-close-btn" onClick={onClose} disabled={saving} aria-label="Close song editor">✕</button>
          </div>
        </div>

        <div className="modal-body">

          {/* ── Left: Lyrics editor ── */}
          <div className="editor-left">

            {/* Meta */}
            <div className="editor-meta">
              <label className="editor-field title-input">
                <span>Title <b>*</b></span>
                <input
                  className="meta-input"
                  value={title}
                  data-dialog-initial-focus
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              <label className="editor-field">
                <span>Artist</span>
                <input
                  className="meta-input"
                  value={artist}
                  onChange={(e) => setArtist(e.target.value)}
                />
              </label>
            </div>

            {/* Lyrics textarea */}
            <div className="lyrics-editor-wrap">
              <div className="lyrics-field-label-row">
                <label className="lyrics-field-label" htmlFor="song-lyrics">Lyrics</label>
                <div className="lyrics-insert-btns">
                  <button
                    type="button"
                    className="lyrics-insert-btn"
                    onClick={insertTitleBlock}
                  >
                    + Title
                  </button>
                  {['Verse', 'Pre-chorus', 'Chorus', 'Bridge'].map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      className="lyrics-insert-btn"
                      style={{ '--block-color': tagColor(tag) } as React.CSSProperties}
                      onClick={() => insertTag(tag)}
                    >
                      + {tag}
                    </button>
                  ))}
                  <span className="lyrics-toolbar-sep" />
                  <button
                    type="button"
                    className="lyrics-insert-btn lyrics-history-btn"
                    onClick={undoLyrics}
                    disabled={!canUndo}
                    title="Undo (Ctrl+Z)"
                    aria-label="Undo"
                  >
                    ↶
                  </button>
                  <button
                    type="button"
                    className="lyrics-insert-btn lyrics-history-btn"
                    onClick={redoLyrics}
                    disabled={!canRedo}
                    title="Redo (Ctrl+Y)"
                    aria-label="Redo"
                  >
                    ↷
                  </button>
                </div>
              </div>
              <textarea
                id="song-lyrics"
                ref={lyricsRef}
                className="lyrics-textarea"
                value={lyrics}
                onChange={(e) => {
                  const value = e.currentTarget.value
                  commitLyrics(value)
                  followLyricsCaret(e.currentTarget, value)
                }}
                onKeyDown={(e) => {
                  const mod = e.ctrlKey || e.metaKey
                  if (!mod) return
                  const key = e.key.toLowerCase()
                  if (key === 'z' && e.shiftKey) { e.preventDefault(); redoLyrics(); }
                  else if (key === 'z') { e.preventDefault(); undoLyrics(); }
                  else if (key === 'y') { e.preventDefault(); redoLyrics(); }
                }}
                onSelect={(e) => followLyricsCaret(e.currentTarget)}
                onFocus={(e) => followLyricsCaret(e.currentTarget)}
                spellCheck={false}
              />
            </div>

            {/* Block strip */}
            {blocks.length > 0 && (
              <div className="block-strip">
                {blocks.map((b, i) => (
                  <button
                    key={i}
                    className={`block-strip-btn ${activeBlock === i ? 'active' : ''}`}
                    style={{ '--block-color': tagColor(b.tag) } as React.CSSProperties}
                    onClick={() => setActiveBlock(i)}
                  >
                    {b.tag}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ── Right: Preview + BG ── */}
          <div className="editor-right">

            {/* Slide preview */}
            <div className="editor-preview-wrap">
              <span className="editor-preview-label">Preview{currentBlock ? ` · ${currentBlock.tag}` : ''}</span>
              <SlidePreview
                lines={currentBlock?.lines ?? []}
                bgType={bgType}
                bgValue={bgValue}
              />
            </div>

            {/* Background selector */}
            <div className="bg-selector">
              <span className="section-label">Background</span>
              <div className="bg-type-btns">
                {(['default', 'color', 'image', 'video'] as const).map((t) => (
                  <button
                    key={t}
                    className={`bg-type-btn ${bgType === t ? 'active' : ''}`}
                    aria-pressed={bgType === t}
                    onClick={() => {
                      setBgType(t)
                      setSaveError('')
                    }}
                  >
                    {t === 'default' ? '⚙️' : t === 'color' ? '🎨' : t === 'image' ? '🖼' : '🎬'} {t}
                  </button>
                ))}
              </div>

              {bgType === 'default' && (
                <div className="bg-default-note">Uses the default background set in Settings.</div>
              )}

              {bgType === 'color' && (
                <div className="bg-color-row">
                  <input
                    type="color"
                    value={bgValue || '#000000'}
                    onChange={(e) => setBgValue(e.target.value)}
                    className="color-picker large"
                  />
                  <span className="bg-color-label">{bgValue || '#000000'}</span>
                </div>
              )}

              {(bgType === 'image' || bgType === 'video') && (
                <div className="bg-file-row">
                  <button
                    ref={mediaPickerTriggerRef}
                    type="button"
                    className="bg-library-btn"
                    onClick={openMediaPicker}
                  >
                    Choose from Library
                  </button>
                  <span className={`bg-file-path ${bgValue ? 'selected' : ''}`} title={bgValue || undefined}>
                    {bgValue ? bgValue.split(/[\\/]/).pop() : `No ${bgType} selected`}
                  </span>
                </div>
              )}
            </div>
            {saveError && <div className="editor-save-error" role="alert">{saveError}</div>}
          </div>
        </div>
        {helpOpen && (
          <div className="song-block-help-backdrop" onMouseDown={event => event.target === event.currentTarget && closeHelp()}>
            <div className="song-block-help" role="dialog" aria-modal="true" aria-label="Song block help">
              <div className="song-block-help-header">
                <span>Song blocks</span>
                <button autoFocus onClick={closeHelp} aria-label="Close song block help">✕</button>
              </div>
              <p>Start each section with its block name inside square brackets. A blank line starts a new slide — it doesn't need its own heading if it's part of the same section.</p>
              <pre>{`[Title]\nAmazing Grace\nby: John Newton\n\n[Verse 1]\nFirst lyric line\nSecond lyric line\n\nThird lyric line\nFourth lyric line\n\n[Chorus]\nFirst chorus line\nSecond chorus line\n\n[Bridge]\nBridge lyric line`}</pre>
            </div>
          </div>
        )}
        {mediaPickerOpen && (bgType === 'image' || bgType === 'video') && (
          <BackgroundMediaPicker
            type={bgType}
            items={mediaItems}
            loadState={mediaLoadState}
            loadError={mediaLoadError}
            selectedPath={bgValue}
            onSelect={selectLibraryBackground}
            onRetry={loadMediaLibrary}
            onClose={closeMediaPicker}
          />
        )}
      </div>
    </div>
  )
}

// ─── Inline slide preview canvas ──────────────────────────────────────────────
function BackgroundMediaPicker({
  type,
  items,
  loadState,
  loadError,
  selectedPath,
  onSelect,
  onRetry,
  onClose,
}: {
  type: 'image' | 'video'
  items: MediaItem[]
  loadState: 'idle' | 'loading' | 'ready' | 'error'
  loadError: string
  selectedPath: string
  onSelect: (item: MediaItem) => void
  onRetry: () => void
  onClose: () => void
}) {
  const dialogRef = useDialogFocusTrap<HTMLDivElement>()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [previewsEnabled, setPreviewsEnabled] = useState(false)
  const deferredSearch = useDeferredValue(search.trim().toLocaleLowerCase())

  useEffect(() => {
    // Let the picker paint and receive focus before attaching media sources.
    // Starting many video decoders during the opening frame causes visible lag.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => setPreviewsEnabled(true))
    })
    return () => cancelAnimationFrame(frame)
  }, [])

  const filteredItems = useMemo(() => items.filter(item => (
    item.type === type
    && (!deferredSearch || item.filename.toLocaleLowerCase().includes(deferredSearch))
  )), [deferredSearch, items, type])
  const pageCount = Math.max(1, Math.ceil(filteredItems.length / MEDIA_PICKER_PAGE_SIZE))
  const pageItems = useMemo(() => {
    const start = page * MEDIA_PICKER_PAGE_SIZE
    return filteredItems.slice(start, start + MEDIA_PICKER_PAGE_SIZE)
  }, [filteredItems, page])

  useEffect(() => { setPage(0) }, [deferredSearch, type])
  useEffect(() => { setPage(current => Math.min(current, pageCount - 1)) }, [pageCount])

  return (
    <div
      className="song-media-picker-backdrop"
      onMouseDown={event => event.target === event.currentTarget && onClose()}
      onKeyDown={event => {
        if (event.key !== 'Escape') return
        event.preventDefault()
        event.stopPropagation()
        onClose()
      }}
    >
      <div
        ref={dialogRef}
        className="song-media-picker"
        role="dialog"
        aria-modal="true"
        aria-labelledby="song-media-picker-title"
      >
        <div className="song-media-picker-header">
          <div>
            <strong id="song-media-picker-title">Choose {type} background</strong>
            <span role="status" aria-live="polite" aria-atomic="true">
              {filteredItems.length} {type}{filteredItems.length === 1 ? '' : 's'} in the library
            </span>
          </div>
          <div className="song-media-picker-header-actions">
            <button type="button" className="song-media-picker-close" onClick={onClose} aria-label="Close media picker">✕</button>
          </div>
        </div>

        <div className="song-media-picker-toolbar">
          <input
            data-dialog-initial-focus
            type="search"
            className="song-media-picker-search"
            placeholder={`Search ${type}s…`}
            value={search}
            onChange={event => setSearch(event.target.value)}
            aria-label={`Search ${type} backgrounds`}
          />
          {loadState === 'ready' && filteredItems.length > MEDIA_PICKER_PAGE_SIZE && (
            <span>
              {page * MEDIA_PICKER_PAGE_SIZE + 1}–{Math.min((page + 1) * MEDIA_PICKER_PAGE_SIZE, filteredItems.length)} of {filteredItems.length}
            </span>
          )}
        </div>

        <div className="song-media-picker-content">
          {(loadState === 'idle' || loadState === 'loading') && (
            <div className="song-media-picker-state" role="status" aria-live="polite">
              <span className="song-media-picker-spinner" aria-hidden="true" />
              <p>Loading the media library…</p>
            </div>
          )}
          {loadState === 'error' && (
            <div className="song-media-picker-state error" role="alert">
              <strong>Media library unavailable</strong>
              <p>{loadError}</p>
              <button type="button" onClick={onRetry}>Retry</button>
            </div>
          )}
          {loadState === 'ready' && filteredItems.length === 0 && (
            <div className="song-media-picker-state">
              <strong>{search ? `No ${type}s match “${search}”` : `No ${type}s in the media library`}</strong>
              <p>{search ? 'Try a different search.' : 'Select and index a media folder from Settings, then choose it here.'}</p>
            </div>
          )}
          {loadState === 'ready' && pageItems.length > 0 && (
            <div className="song-media-picker-grid">
              {pageItems.map(item => (
                <BackgroundMediaCard
                  key={item.id}
                  item={item}
                  selected={item.filepath === selectedPath}
                  previewsEnabled={previewsEnabled}
                  onSelect={() => onSelect(item)}
                />
              ))}
            </div>
          )}
        </div>

        {loadState === 'ready' && filteredItems.length > MEDIA_PICKER_PAGE_SIZE && (
          <div className="song-media-picker-pagination" aria-label="Media pages">
            <button type="button" onClick={() => setPage(current => Math.max(0, current - 1))} disabled={page === 0}>
              ‹ Previous
            </button>
            <span>Page {page + 1} of {pageCount}</span>
            <button type="button" onClick={() => setPage(current => Math.min(pageCount - 1, current + 1))} disabled={page >= pageCount - 1}>
              Next ›
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function BackgroundMediaCard({
  item,
  selected,
  previewsEnabled,
  onSelect,
}: {
  item: MediaItem
  selected: boolean
  previewsEnabled: boolean
  onSelect: () => void
}) {
  const [preview, setPreview] = useState(false)
  const [loadStatus, setLoadStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading')

  useEffect(() => setLoadStatus('loading'), [item.filepath])
  const unavailable = loadStatus === 'unavailable'

  return (
    <button
      type="button"
      className={`song-media-picker-card ${selected ? 'selected' : ''}`}
      disabled={loadStatus !== 'ready'}
      onClick={onSelect}
      onMouseEnter={() => setPreview(true)}
      onMouseLeave={() => setPreview(false)}
      onFocus={() => setPreview(true)}
      onBlur={() => setPreview(false)}
      aria-pressed={selected}
      aria-label={`${selected ? 'Selected: ' : ''}${item.filename}${unavailable ? ', preview unavailable' : loadStatus === 'loading' ? ', loading preview' : ''}`}
      title={item.filename}
    >
      <span className="song-media-picker-card-preview">
        <MediaThumbnail
          type={item.type}
          src={mediaUrl(item.filepath)}
          alt=""
          className="song-media-picker-thumbnail"
          enabled={previewsEnabled}
          preview={preview}
          onLoadSuccess={() => setLoadStatus('ready')}
          onLoadError={() => setLoadStatus('unavailable')}
        />
        <span className="song-media-picker-kind" aria-hidden="true">{item.type === 'video' ? '▶' : '🖼'}</span>
        {unavailable
          ? <span className="song-media-picker-unavailable">Unavailable</span>
          : loadStatus === 'loading'
            ? <span className="song-media-picker-loading">Loading…</span>
            : selected && <span className="song-media-picker-selected">Selected</span>}
      </span>
      <span className="song-media-picker-name">{item.filename}</span>
    </button>
  )
}

function SlidePreview({
  lines, bgType, bgValue,
}: {
  lines: string[]
  bgType: string
  bgValue: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const W = canvas.width
    const H = canvas.height

    ctx.clearRect(0, 0, W, H)

    if (!lines.length) return

    const padding = W * 0.07
    const maxWidth = W - padding * 2
    const style = DEFAULT_FONT.bold ? 'bold ' : ''

    let fs = DEFAULT_FONT.size * (H / 720)
    fs = Math.min(fs, H * 0.8 / (lines.length * 1.3))
    fs = Math.max(fs, 10)

    let wrapped = lines
    while (fs > 10) {
      ctx.font = `${style}${fs}px "${DEFAULT_FONT.family}"`
      wrapped = wrapAllLines(ctx, lines, maxWidth)
      if (wrapped.length * fs * 1.3 <= H * 0.8) break
      fs -= 2
    }

    ctx.font = `${style}${fs}px "${DEFAULT_FONT.family}"`
    wrapped = wrapAllLines(ctx, lines, maxWidth)
    const lh = fs * 1.3
    let y = (H - wrapped.length * lh) / 2 + fs

    if (DEFAULT_FONT.shadowEnabled) {
      ctx.shadowColor = 'rgba(0,0,0,0.9)'
      ctx.shadowBlur = fs * 0.12
      ctx.shadowOffsetX = 1
      ctx.shadowOffsetY = 1
    }

    ctx.fillStyle = DEFAULT_FONT.color
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'

    for (const l of wrapped) {
      ctx.fillText(l, W / 2, y)
      y += lh
    }
    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0
  }, [lines])

  return (
    <div
      className="editor-preview-stage"
      style={{ backgroundColor: bgType === 'color' ? bgValue : '#111111' }}
    >
      {bgType === 'image' && bgValue && (
        <img className="editor-preview-media" src={mediaUrl(bgValue)} alt="" />
      )}
      {bgType === 'video' && bgValue && (
        <video
          key={bgValue}
          className="editor-preview-media"
          src={mediaUrl(bgValue)}
          muted
          playsInline
          preload="metadata"
          onLoadedMetadata={event => {
            const video = event.currentTarget
            const target = Number.isFinite(video.duration) ? Math.min(0.1, video.duration / 10) : 0.1
            try { video.currentTime = target } catch {}
          }}
          onSeeked={event => event.currentTarget.pause()}
        />
      )}
      <canvas
        ref={canvasRef}
        width={480}
        height={270}
        className="editor-preview-canvas"
      />
    </div>
  )
}
