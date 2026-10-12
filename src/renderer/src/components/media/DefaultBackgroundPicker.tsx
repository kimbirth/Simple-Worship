import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useDialogFocusTrap } from '../../hooks/useDialogFocusTrap'
import { useStore } from '../../store/AppStore'
import type { MediaItem } from '../../types'
import { MediaAPI, SettingsAPI } from '../../utils/api'
import { mediaUrl } from '../../utils/mediaUrl'
import MediaThumbnail from './MediaThumbnail'

type DefaultBackgroundType = 'color' | 'image' | 'video'
type PickerMode = DefaultBackgroundType | 'logo'

const PAGE_SIZE = 24
const COLORS = [
  '#000000', '#ffffff', '#991b1b', '#ea580c', '#ca8a04',
  '#15803d', '#0369a1', '#1d4ed8', '#6d28d9', '#be185d',
]

interface Props {
  onClose: () => void
}

export default function DefaultBackgroundPicker({ onClose }: Props) {
  const { state, setDefaultBg, setLogoPath } = useStore()
  const initialType = state.defaultBg?.type ?? 'color'
  const [type, setType] = useState<PickerMode>(initialType)
  const [color, setColor] = useState(
    state.defaultBg?.type === 'color' && state.defaultBg.value ? state.defaultBg.value : '#000000',
  )
  const [items, setItems] = useState<MediaItem[]>([])
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loadError, setLoadError] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [saving, setSaving] = useState(false)
  const [previewsEnabled, setPreviewsEnabled] = useState(false)
  const dialogRef = useDialogFocusTrap<HTMLDivElement>()
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const deferredSearch = useDeferredValue(search.trim().toLocaleLowerCase())

  useEffect(() => {
    let active = true
    MediaAPI.getAll()
      .then(all => {
        if (!active) return
        setItems(all)
        setLoadState('ready')
      })
      .catch(error => {
        if (!active) return
        setLoadError(error instanceof Error ? error.message : 'The media library could not be loaded.')
        setLoadState('error')
      })
    return () => { active = false }
  }, [])

  useEffect(() => {
    // Show and focus the dialog before image decoding and video metadata reads
    // begin. This keeps opening instant even for a large media folder.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => setPreviewsEnabled(true))
    })
    return () => cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || saving) return
      event.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose, saving])

  const filteredItems = useMemo(() => {
    if (type === 'color') return []
    const mediaType = type === 'logo' ? 'image' : type
    return items.filter(item => (
      item.type === mediaType
      && (!deferredSearch || item.filename.toLocaleLowerCase().includes(deferredSearch))
    ))
  }, [deferredSearch, items, type])
  const pageCount = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE))
  const pageItems = useMemo(() => {
    const start = page * PAGE_SIZE
    return filteredItems.slice(start, start + PAGE_SIZE)
  }, [filteredItems, page])

  useEffect(() => { setPage(0) }, [deferredSearch, type])
  useEffect(() => { setPage(current => Math.min(current, pageCount - 1)) }, [pageCount])

  const saveBackground = async (nextType: DefaultBackgroundType, value: string, close = false) => {
    setSaving(true)
    try {
      await SettingsAPI.set('default_bg_type', nextType)
      await SettingsAPI.set('default_bg_value', value)
      setDefaultBg({ type: nextType, value })
      if (close) onClose()
    } finally {
      setSaving(false)
    }
  }

  const chooseColor = (value: string) => {
    setColor(value)
    void saveBackground('color', value)
  }

  const saveLogo = async (item: MediaItem) => {
    setSaving(true)
    try {
      await SettingsAPI.set('logo_media_id', String(item.id))
      await SettingsAPI.set('logo_path', item.filepath)
      await SettingsAPI.set('logo_filename', item.filename)
      setLogoPath(item.filepath)
      window.dispatchEvent(new Event('simpleworship:media-changed'))
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const clearLogo = async () => {
    setSaving(true)
    try {
      await SettingsAPI.set('logo_media_id', '')
      await SettingsAPI.set('logo_path', '')
      await SettingsAPI.set('logo_filename', '')
      setLogoPath('')
      window.dispatchEvent(new Event('simpleworship:media-changed'))
    } finally {
      setSaving(false)
    }
  }

  const libraryLabel = type === 'logo' ? 'logo' : type

  return createPortal(
    <div
      className="song-media-picker-backdrop default-background-picker-backdrop"
      onMouseDown={event => event.target === event.currentTarget && !saving && onClose()}
    >
      <div
        ref={dialogRef}
        className="song-media-picker default-background-picker"
        role="dialog"
        aria-modal="true"
        aria-labelledby="default-background-picker-title"
      >
        <div className="song-media-picker-header">
          <div>
            <strong id="default-background-picker-title">Default background &amp; logo</strong>
            <span>{type === 'logo' ? 'Shown when the LOGO overlay is active' : 'Used by songs and Bible verses set to Default'}</span>
          </div>
          <div className="song-media-picker-header-actions">
            {type === 'logo' && state.logoPath && (
              <button
                type="button"
                className="song-media-picker-file-btn"
                onClick={() => { void clearLogo() }}
                disabled={saving}
              >Remove logo</button>
            )}
            <button
              ref={closeButtonRef}
              type="button"
              className="song-media-picker-close"
              onClick={onClose}
              disabled={saving}
              aria-label="Close default background picker"
              data-dialog-initial-focus
            >✕</button>
          </div>
        </div>

        <div className="default-background-type-row" role="tablist" aria-label="Default background and logo type">
          {(['color', 'image', 'video', 'logo'] as const).map(option => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={type === option}
              className={`bg-type-btn ${type === option ? 'active' : ''}`}
              onClick={() => setType(option)}
            >
              {option === 'color' ? '🎨' : option === 'image' ? '🖼' : option === 'video' ? '🎬' : '☁'} {option}
            </button>
          ))}
        </div>

        {type === 'color' ? (
          <div className="default-background-color-panel">
            <div className="default-background-swatches">
              {COLORS.map(value => (
                <button
                  key={value}
                  type="button"
                  className={`default-background-swatch ${state.defaultBg?.type === 'color' && state.defaultBg.value === value ? 'selected' : ''}`}
                  style={{ backgroundColor: value }}
                  onClick={() => chooseColor(value)}
                  aria-label={`Use ${value} as the default background`}
                  aria-pressed={state.defaultBg?.type === 'color' && state.defaultBg.value === value}
                />
              ))}
            </div>
            <label className="default-background-custom-color">
              <span>Custom color</span>
              <input
                type="color"
                value={color}
                onChange={event => chooseColor(event.target.value)}
                aria-label="Choose a custom default background color"
              />
              <code>{color}</code>
            </label>
          </div>
        ) : (
          <>
            <div className="song-media-picker-toolbar">
              <input
                type="search"
                className="song-media-picker-search"
                placeholder={`Search ${libraryLabel}s…`}
                value={search}
                onChange={event => setSearch(event.target.value)}
                aria-label={`Search ${libraryLabel}s`}
              />
              {loadState === 'ready' && filteredItems.length > PAGE_SIZE && (
                <span>
                  {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filteredItems.length)} of {filteredItems.length}
                </span>
              )}
            </div>

            <div className="song-media-picker-content">
              {loadState === 'loading' && (
                <div className="song-media-picker-state" role="status" aria-live="polite">
                  <span className="song-media-picker-spinner" aria-hidden="true" />
                  <p>Loading the media library…</p>
                </div>
              )}
              {loadState === 'error' && (
                <div className="song-media-picker-state error" role="alert">
                  <strong>Media library unavailable</strong>
                  <p>{loadError}</p>
                </div>
              )}
              {loadState === 'ready' && filteredItems.length === 0 && (
                <div className="song-media-picker-state">
                  <strong>{search ? `No ${libraryLabel}s match “${search}”` : `No ${libraryLabel}s in the media library`}</strong>
                  <p>{search ? 'Try a different search.' : 'Select and index a media folder from Settings, then choose it here.'}</p>
                </div>
              )}
              {loadState === 'ready' && pageItems.length > 0 && (
                <div className="song-media-picker-grid">
                  {pageItems.map(item => (
                    <DefaultBackgroundCard
                      key={item.id}
                      item={item}
                      selected={type === 'logo'
                        ? state.logoPath === item.filepath
                        : state.defaultBg?.type === item.type && state.defaultBg.value === item.filepath}
                      previewsEnabled={previewsEnabled}
                      badge={type === 'logo' ? 'logo' : item.type}
                      onSelect={() => {
                        if (type === 'logo') void saveLogo(item)
                        else void saveBackground(item.type, item.filepath, true)
                      }}
                    />
                  ))}
                </div>
              )}
            </div>

            {loadState === 'ready' && filteredItems.length > PAGE_SIZE && (
              <div className="song-media-picker-pagination" aria-label="Media pages">
                <button type="button" onClick={() => setPage(current => Math.max(0, current - 1))} disabled={page === 0}>‹ Previous</button>
                <span>Page {page + 1} of {pageCount}</span>
                <button type="button" onClick={() => setPage(current => Math.min(pageCount - 1, current + 1))} disabled={page >= pageCount - 1}>Next ›</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}

function DefaultBackgroundCard({ item, selected, previewsEnabled, badge, onSelect }: {
  item: MediaItem
  selected: boolean
  previewsEnabled: boolean
  badge: string
  onSelect: () => void
}) {
  const [preview, setPreview] = useState(false)

  return (
    <button
      type="button"
      className={`song-media-picker-card ${selected ? 'selected' : ''}`}
      onClick={onSelect}
      onMouseEnter={() => setPreview(true)}
      onMouseLeave={() => setPreview(false)}
      onFocus={() => setPreview(true)}
      onBlur={() => setPreview(false)}
      aria-pressed={selected}
      aria-label={`${selected ? 'Selected: ' : ''}${item.filename}`}
      title={item.filename}
    >
      <span className="song-media-picker-card-preview">
        <MediaThumbnail
          type={item.type}
          src={mediaUrl(item.filepath)}
          alt={item.filename}
          className="song-media-picker-thumbnail"
          enabled={previewsEnabled}
          preview={item.type === 'video' && preview}
        />
        <span className="song-media-picker-kind">{badge}</span>
        {selected && <span className="song-media-picker-selected">✓</span>}
      </span>
      <span className="song-media-picker-name">{item.filename}</span>
    </button>
  )
}
