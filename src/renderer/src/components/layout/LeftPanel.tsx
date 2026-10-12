import { useCallback, useEffect, useState } from 'react'
import SchedulePanel from '../schedule/SchedulePanel'
import SongEditorModal from '../editor/SongEditorModal'
import MediaGrid from '../media/MediaGrid'
import BibleTab from '../bible/BibleTab'
import { DraggableRow } from './DraggableRow'
import { useStore } from '../../store/AppStore'
import { useSongs } from '../../hooks/useSongs'
import { parseLyrics } from '../../utils/lyricsParser'
import { usePanelResize } from '../../hooks/usePanelResize'
import type { Song, SongCue } from '../../types'
import type { MediaValidationReport } from '../../types'
import { isMissingMediaPath } from '../../utils/mediaHealth'

type LibTab = 'songs' | 'media' | 'bible'

function songCue(song: Song): SongCue {
  return {
    id: `stage-song-${song.id}-${Date.now()}`,
    type: 'song',
    label: song.title,
    song,
    blocks: parseLyrics(song.lyrics_raw),
  }
}

export default function LeftPanel({ mediaHealth }: { mediaHealth: MediaValidationReport }) {
  const [scheduleH, setScheduleH] = useState(() => {
    const saved = Number(
      localStorage.getItem('simpleworship:schedule-height:v1')
      ?? localStorage.getItem('worship-presenter:schedule-height:v1')
    )
    return Number.isFinite(saved) && saved >= 100 ? Math.min(saved, window.innerHeight - 220) : 300
  })
  useEffect(() => {
    localStorage.setItem('simpleworship:schedule-height:v1', String(scheduleH))
  }, [scheduleH])
  const onResizeSched = useCallback((delta: number) => {
    setScheduleH(height => Math.max(100, Math.min(window.innerHeight - 220, height + delta)))
  }, [])
  const dragSched = usePanelResize(onResizeSched, false)
  const [libTab, setLibTab] = useState<LibTab>('songs')
  const [editingSong, setEditingSong] = useState<Song | null | undefined>(undefined)

  const { selectCue, updateScheduledSong } = useStore()
  const { songs, loading, search, saveSong, deleteSong } = useSongs()

  const handleSaveSong = useCallback(async (partial: Partial<Song>) => {
    const saved = await saveSong(partial as Partial<Song> & { title: string })
    if (!saved) return false
    updateScheduledSong(saved)
    return true
  }, [saveSong, updateScheduledSong])

  const handleStageSong = useCallback((song: Song) => {
    selectCue(songCue(song))
  }, [selectCue])

  return (
    <div className="left-panel">
      <div style={{ height: scheduleH, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <SchedulePanel mediaHealth={mediaHealth} />
      </div>

      <div
        className="resize-handle-h"
        onMouseDown={dragSched}
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize schedule and library panels"
        tabIndex={0}
        onKeyDown={event => {
          if (event.key === 'ArrowUp') { event.preventDefault(); onResizeSched(-12) }
          if (event.key === 'ArrowDown') { event.preventDefault(); onResizeSched(12) }
        }}
      />

      <div className="lib-panel">
        <div className="lib-tabs" role="tablist" aria-label="Library views">
          <button
            id="songs-library-tab"
            className={`lib-tab ${libTab === 'songs' ? 'active' : ''}`}
            role="tab"
            aria-selected={libTab === 'songs'}
            aria-controls="library-tab-panel"
            tabIndex={libTab === 'songs' ? 0 : -1}
            onClick={() => setLibTab('songs')}
            onKeyDown={event => {
              if (event.key !== 'ArrowRight' && event.key !== 'End') return
              event.preventDefault()
              const next = event.key === 'End' ? 'bible' : 'media'
              setLibTab(next)
              requestAnimationFrame(() => document.getElementById(`${next}-library-tab`)?.focus())
            }}
          >
            🎵 Songs
          </button>
          <button
            id="media-library-tab"
            className={`lib-tab ${libTab === 'media' ? 'active' : ''}`}
            role="tab"
            aria-selected={libTab === 'media'}
            aria-controls="library-tab-panel"
            tabIndex={libTab === 'media' ? 0 : -1}
            onClick={() => setLibTab('media')}
            onKeyDown={event => {
              if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Home' && event.key !== 'End') return
              event.preventDefault()
              const next = event.key === 'ArrowRight' || event.key === 'End' ? 'bible' : 'songs'
              setLibTab(next)
              requestAnimationFrame(() => document.getElementById(`${next}-library-tab`)?.focus())
            }}
          >
            🎬 Media
          </button>
          <button
            id="bible-library-tab"
            className={`lib-tab ${libTab === 'bible' ? 'active' : ''}`}
            role="tab"
            aria-selected={libTab === 'bible'}
            aria-controls="library-tab-panel"
            tabIndex={libTab === 'bible' ? 0 : -1}
            onClick={() => setLibTab('bible')}
            onKeyDown={event => {
              if (event.key !== 'ArrowLeft' && event.key !== 'Home') return
              event.preventDefault()
              const next = event.key === 'Home' ? 'songs' : 'media'
              setLibTab(next)
              requestAnimationFrame(() => document.getElementById(`${next}-library-tab`)?.focus())
            }}
          >
            📖 Bible
          </button>
        </div>
        <div
          id="library-tab-panel"
          className="lib-content"
          role="tabpanel"
          aria-labelledby={`${libTab}-library-tab`}
        >
          {libTab === 'songs' && (
            <SongsLib
              songs={songs}
              loading={loading}
              onNew={() => setEditingSong(null)}
              onEdit={setEditingSong}
              onDelete={deleteSong}
              onStage={handleStageSong}
              onSearch={search}
              mediaHealth={mediaHealth}
            />
          )}
          {libTab === 'media' && <MediaGrid mediaHealth={mediaHealth} />}
          {libTab === 'bible' && <BibleTab />}
        </div>
      </div>

      {editingSong !== undefined && (
        <SongEditorModal song={editingSong} onSave={handleSaveSong} onClose={() => setEditingSong(undefined)} />
      )}
    </div>
  )
}

function SongsLib({ songs, loading, onNew, onEdit, onDelete, onStage, onSearch, mediaHealth }: {
  songs: Song[]
  loading: boolean
  onNew: () => void
  onEdit: (song: Song) => void
  onDelete: (id: number) => void
  onStage: (song: Song) => void
  onSearch: (query: string) => void
  mediaHealth: MediaValidationReport
}) {
  const [query, setQuery] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)

  return (
    <div className="lib-songs">
      <div className="lib-search-row">
        <input
          className="search-input"
          placeholder="Search titles, artists, or lyrics…"
          aria-label="Search songs by title, artist, or lyrics"
          value={query}
          onChange={event => {
            setQuery(event.target.value)
            onSearch(event.target.value)
          }}
        />
        <button className="new-song-btn" onClick={onNew} aria-label="New song">+</button>
      </div>
      <div className="lib-list">
        {loading && <div className="empty-state"><p>Loading…</p></div>}
        {!loading && songs.length === 0 && (
          <div className="empty-state"><p>{query ? 'No results.' : 'No songs yet.'}</p></div>
        )}
        {songs.map(song => {
          const missingBackground = (song.bg_type === 'image' || song.bg_type === 'video')
            && isMissingMediaPath(mediaHealth, song.bg_value)
          return (
          <DraggableRow
            key={song.id}
            className="song-row"
            ariaLabel={`Stage ${song.title}${song.artist ? ` by ${song.artist}` : ''}`}
            onDragStart={event => {
              event.dataTransfer.setData('application/simpleworship-cue', JSON.stringify({ type: 'song', data: song }))
              event.dataTransfer.effectAllowed = 'copy'
            }}
            onDoubleClick={() => onStage(song)}
          >
            <div className="song-row-info">
              <span className="song-row-title">{song.title}</span>
              {song.artist && <span className="song-row-artist">{song.artist}</span>}
              {missingBackground && <span className="missing-file-badge">Missing or moved</span>}
            </div>
            <div className="song-row-actions">
              <button className="song-action-btn" onClick={event => { event.stopPropagation(); onEdit(song) }} aria-label="Edit song">✏️</button>
              {confirmDelete === song.id ? (
                <>
                  <button className="song-action-btn danger" onClick={event => { event.stopPropagation(); onDelete(song.id); setConfirmDelete(null) }}>✓</button>
                  <button className="song-action-btn" onClick={event => { event.stopPropagation(); setConfirmDelete(null) }}>✗</button>
                </>
              ) : (
                <button className="song-action-btn" onClick={event => { event.stopPropagation(); setConfirmDelete(song.id) }} aria-label="Delete song">🗑</button>
              )}
            </div>
          </DraggableRow>
          )
        })}
      </div>
    </div>
  )
}
