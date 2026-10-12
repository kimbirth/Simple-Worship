import { mediaUrl } from '../../utils/mediaUrl'
import React, { useState, useCallback, useEffect, useMemo } from 'react'
import { useMedia } from '../../hooks/useMedia'
import { useStore } from '../../store/AppStore'
import type { BackgroundCue, MediaItem, MediaValidationReport, VideoCue } from '../../types'
import { MediaAPI } from '../../utils/api'
import { isMissingMediaPath } from '../../utils/mediaHealth'
import MediaThumbnail from './MediaThumbnail'

type Filter = 'all' | 'video' | 'image'
const MEDIA_PAGE_SIZE = 100
const SCHEDULE_CUE_MIME = 'application/simpleworship-cue'

export default function MediaGrid({ mediaHealth }: { mediaHealth: MediaValidationReport }) {
  const { items, folder, deleteItem, reload } = useMedia()
  const { addToSchedule } = useStore()
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [hovered, setHovered] = useState<number | null>(null)
  const [page, setPage] = useState(0)

  const filtered = useMemo(() => items.filter((m) => {
    if (filter !== 'all' && m.type !== filter) return false
    if (search && !m.filename.toLowerCase().includes(search.toLowerCase())) return false
    return true
  }), [filter, items, search])
  const pageCount = Math.max(1, Math.ceil(filtered.length / MEDIA_PAGE_SIZE))
  const pageItems = filtered.slice(page * MEDIA_PAGE_SIZE, (page + 1) * MEDIA_PAGE_SIZE)

  useEffect(() => { setPage(0) }, [filter, search])
  useEffect(() => { setPage(current => Math.min(current, pageCount - 1)) }, [pageCount])

  const handleAddToSchedule = useCallback((item: MediaItem) => {
    const id = `${Date.now()}-${Math.random()}`
    const cue: VideoCue | BackgroundCue = item.type === 'video'
      ? { id, type: 'video', label: item.filename, media: item }
      : {
          id,
          type: 'background',
          label: item.filename,
          bg_type: 'image',
          bg_value: item.filepath,
        }
    addToSchedule(cue)
  }, [addToSchedule])

  return (
    <div className="media-tab-inner">
      {/* Toolbar */}
      <div className="media-toolbar">
        <div className="media-toolbar-primary">
          {folder && (
            <button className="media-refresh-btn" onClick={async () => {
              if (!folder) return
              await MediaAPI.indexFolder(folder)
              await reload()
            }} aria-label="Refresh media list">↻</button>
          )}
          <div className="media-folder-meta">
            <span className="media-folder-name">{folder ? folder.split(/[\\/]/).pop() : 'No folder'}</span>
            <span className="media-folder-count">{items.length} item{items.length !== 1 ? 's' : ''}</span>
          </div>
        </div>

        <div className="media-toolbar-secondary">
          <div className="media-filter-btns">
            {(['all', 'video', 'image'] as Filter[]).map((f) => (
              <button
                key={f}
                className={`media-filter-btn ${filter === f ? 'active' : ''}`}
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
              >
                {f === 'all' ? 'All' : f === 'video' ? 'Videos' : 'Images'}
              </button>
            ))}
          </div>
          {items.length > 0 && (
            <input
              type="text"
              className="search-input media-search"
              placeholder="Search media…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          )}
        </div>
      </div>

      {/* Grid */}
      <div className="media-grid-scroll">
        {!folder && (
          <div className="empty-state"><p>Select a media folder in Settings.</p></div>
        )}
        {folder && filtered.length === 0 && (
          <div className="empty-state">
            <p>{search ? 'No files match your search.' : 'No files found in this folder.'}</p>
          </div>
        )}
        {filtered.length > MEDIA_PAGE_SIZE && (
          <div className="media-pagination">
            <span>
              {page * MEDIA_PAGE_SIZE + 1}–{Math.min((page + 1) * MEDIA_PAGE_SIZE, filtered.length)} of {filtered.length}
            </span>
            <div>
              <button onClick={() => setPage(current => Math.max(0, current - 1))} disabled={page === 0}>‹</button>
              <span>{page + 1}/{pageCount}</span>
              <button onClick={() => setPage(current => Math.min(pageCount - 1, current + 1))} disabled={page >= pageCount - 1}>›</button>
            </div>
          </div>
        )}
        <div className="media-grid">
          {pageItems.map((item) => (
            <MediaCard
              key={item.id}
              item={item}
              isMissing={isMissingMediaPath(mediaHealth, item.filepath)}
              isHovered={hovered === item.id}
              onHover={() => setHovered(item.id)}
              onLeave={() => setHovered(null)}
              onAdd={() => handleAddToSchedule(item)}
              onDelete={() => deleteItem(item.id)}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'copy'
                e.dataTransfer.setData(SCHEDULE_CUE_MIME, JSON.stringify({
                  type: item.type === 'video' ? 'video' : 'background',
                  data: item,
                }))
                e.dataTransfer.setData('text/plain', item.filepath)
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function MediaCard({
  item, isHovered, isMissing, onHover, onLeave, onAdd, onDelete, onDragStart
}: {
  item: MediaItem
  isHovered: boolean
  isMissing: boolean
  onHover: () => void
  onLeave: () => void
  onAdd: () => void
  onDelete: () => void
  onDragStart: (e: React.DragEvent) => void
}) {
  const handleMouseEnter = () => {
    onHover()
  }
  const handleMouseLeave = () => {
    onLeave()
  }

  // Use file:// path for Electron
  const src = mediaUrl(item.filepath)

  const name = item.filename.length > 22
    ? item.filename.slice(0, 19) + '...'
    : item.filename

  return (
    <div
      className={`media-card ${isHovered ? 'hovered' : ''} ${isMissing ? 'missing' : ''}`}
      role="group"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleMouseEnter}
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) handleMouseLeave()
      }}
      onDoubleClick={() => { if (!isMissing) onAdd() }}
      onDragStart={event => { if (!isMissing) onDragStart(event) }}
      draggable={!isMissing}
      aria-label={`${item.filename}, ${item.type} media item`}
      title={item.filename}
    >
      <div className="media-card-thumb">
        <MediaThumbnail
          type={item.type}
          src={src}
          alt={item.filename}
          className={item.type === 'video' ? 'media-thumb-video' : 'media-thumb-img'}
          preview={item.type === 'video' && isHovered && !isMissing}
        />
        <div className="media-card-type-badge">
          {item.type === 'video' ? '▶' : '🖼'}
        </div>
        {isMissing && <div className="media-missing-overlay">Missing or moved</div>}
        <div className="media-card-actions" onDoubleClick={event => event.stopPropagation()}>
          {!isMissing && <button
            className="media-card-btn add"
            onClick={(event) => {
              event.stopPropagation()
              if (event.detail <= 1) onAdd()
            }}
            aria-label={`Add ${item.filename} to schedule`}
          >+ Schedule</button>}
          <button
            className="media-card-btn del"
            onClick={(event) => {
              event.stopPropagation()
              if (event.detail <= 1) onDelete()
            }}
            aria-label={`Remove ${item.filename} from library`}
          >✕</button>
        </div>
      </div>
      <div className="media-card-name">{name}</div>
    </div>
  )
}
