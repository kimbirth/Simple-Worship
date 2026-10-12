import React, { useRef, useState } from 'react'
import { useStore } from '../../store/AppStore'
import { parseLyrics } from '../../utils/lyricsParser'
import type { Cue, MediaItem, MediaValidationReport, Song } from '../../types'
import { ScheduleAPI } from '../../utils/api'
import { isMissingMediaPath } from '../../utils/mediaHealth'

const CUE_COLORS: Record<string, string> = {
  song: '#4a9eff', video: '#fd79a8', background: '#8b5cf6', verse: '#a29bfe',
}
const CUE_ICONS: Record<string, string> = {
  song: '🎵', video: '🎬', background: '🖼', verse: '📖',
}
const SCHEDULE_CUE_MIME = 'application/simpleworship-cue'
const LEGACY_MEDIA_MIME = 'application/x-worship-media'

export default function SchedulePanel({ mediaHealth }: { mediaHealth: MediaValidationReport }) {
  const { state, dispatch, selectCue, removeFromSchedule, addToSchedule } = useStore()
  const { schedule, selectedCueId, live } = state
  const liveCueId = live.cue?.id

  // Internal drag-reorder
  const dragIndex = useRef<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)
  const [dropZone, setDropZone] = useState(false)
  const [scheduleName, setScheduleName] = useState('Unsaved schedule')
  const [fileMessage, setFileMessage] = useState('')

  const saveSchedule = async () => {
    setFileMessage('Saving…')
    try {
      const result = await ScheduleAPI.save(schedule)
      if (!result) return setFileMessage('')
      setScheduleName(result.name.replace(/\.(sws|simpleworship-schedule)$/i, ''))
      setFileMessage('Saved')
    } catch (error) {
      setFileMessage(error instanceof Error ? error.message : 'Save failed')
    }
  }

  const openSchedule = async () => {
    setFileMessage('Opening…')
    try {
      const result = await ScheduleAPI.open()
      if (!result) return setFileMessage('')
      const loaded = result.schedule.flatMap((cue, index): Cue[] => {
        if (cue.type === 'song' && cue.song && typeof cue.song.lyrics_raw === 'string') {
          return [{
            ...cue,
            id: `loaded-song-${Date.now()}-${index}`,
            label: cue.song.title || cue.label || 'Song',
            blocks: parseLyrics(cue.song.lyrics_raw),
          }]
        }
        if (cue.type === 'video' && cue.media?.filepath) {
          return [{ ...cue, id: `loaded-video-${Date.now()}-${index}` }]
        }
        if (
          cue.type === 'background'
          && (cue.bg_type === 'default' || cue.bg_type === 'color' || cue.bg_type === 'image' || cue.bg_type === 'video')
          && typeof cue.bg_value === 'string'
        ) {
          return [{ ...cue, id: `loaded-background-${Date.now()}-${index}` }]
        }
        if (
          cue.type === 'verse'
          && typeof cue.book === 'string'
          && typeof cue.chapter === 'number'
          && typeof cue.version === 'string'
          && typeof cue.reference === 'string'
          && Array.isArray(cue.parts)
          && (cue.bg_type === 'default' || cue.bg_type === 'color' || cue.bg_type === 'image' || cue.bg_type === 'video')
        ) {
          return [{ ...cue, id: `loaded-verse-${Date.now()}-${index}` }]
        }
        return []
      })
      dispatch({ type: 'SCHEDULE_REPLACE', schedule: loaded })
      setScheduleName(result.name.replace(/\.(sws|simpleworship-schedule)$/i, ''))
      setFileMessage(`${loaded.length} cues loaded`)
    } catch (error) {
      setFileMessage(error instanceof Error ? error.message : 'Open failed')
    }
  }

  const onDragStart = (i: number) => { dragIndex.current = i }
  const onDragOver  = (e: React.DragEvent, i?: number) => {
    e.preventDefault()
    if (i !== undefined) setDragOver(i)
    else setDropZone(true)
  }
  const onDragLeave = () => { setDragOver(null); setDropZone(false) }

  const onDrop = (e: React.DragEvent, targetIndex?: number) => {
    e.preventDefault()
    setDragOver(null)
    setDropZone(false)

    // Check if it's an internal reorder
    if (dragIndex.current !== null && targetIndex !== undefined && dragIndex.current !== targetIndex) {
      dispatch({ type: 'SCHEDULE_REORDER', from: dragIndex.current, to: targetIndex })
      dragIndex.current = null
      return
    }
    dragIndex.current = null

    // Check if it's an external drag (from library)
    const raw = e.dataTransfer.getData(SCHEDULE_CUE_MIME)
      || e.dataTransfer.getData(LEGACY_MEDIA_MIME)
    if (!raw) return
    try {
      const parsed = JSON.parse(raw)
      const payload = parsed?.data ? parsed : { type: parsed?.type, data: parsed }
      let cue: Cue | null = null

      if (payload.type === 'song' && payload.data && typeof payload.data.lyrics_raw === 'string') {
        const song: Song = payload.data
        cue = {
          id: `${Date.now()}-${Math.random()}`,
          type: 'song',
          label: song.title,
          song,
          blocks: parseLyrics(song.lyrics_raw),
        }
      } else if (
        payload.type === 'video'
        && payload.data?.type === 'video'
        && typeof payload.data.filepath === 'string'
      ) {
        const media: MediaItem = payload.data
        cue = {
          id: `${Date.now()}-${Math.random()}`,
          type: 'video',
          label: media.filename,
          media,
        }
      } else if (
        (payload.type === 'background' || payload.type === 'image')
        && payload.data?.type === 'image'
        && typeof payload.data.filepath === 'string'
      ) {
        const media: MediaItem = payload.data
        cue = {
          id: `${Date.now()}-${Math.random()}`,
          type: 'background',
          label: media.filename,
          bg_type: 'image',
          bg_value: media.filepath,
        }
      }
      if (cue) addToSchedule(cue)
    } catch {}
  }

  return (
    <div
      className={`panel schedule-panel ${dropZone ? 'drop-target' : ''}`}
      onDragOver={(e) => onDragOver(e)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e)}
    >
      <div className="panel-header">
        <div className="schedule-title-group">
          <span className="panel-title">Schedule</span>
          <span className="schedule-file-name">{scheduleName}</span>
        </div>
        <div className="schedule-file-actions">
          {fileMessage && <span className="schedule-file-message">{fileMessage}</span>}
          <button onClick={openSchedule} aria-label="Open schedule">Open</button>
          <button onClick={saveSchedule} disabled={schedule.length === 0} aria-label="Save schedule">Save</button>
          <span className="panel-hint">{schedule.length} cue{schedule.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      <div className="schedule-list">
        {schedule.length === 0 && (
          <div className="empty-state drop-hint">
            <p>Drag songs or media here</p>
          </div>
        )}
        {schedule.map((cue, i) => (
          <CueItem
            key={cue.id}
            cue={cue}
            isSelected={cue.id === selectedCueId}
            isLive={cue.id === liveCueId}
            isDragOver={dragOver === i}
            isMissing={cue.type === 'video'
              ? isMissingMediaPath(mediaHealth, cue.media.filepath)
              : (cue.type === 'background' || cue.type === 'verse')
                && (cue.bg_type === 'image' || cue.bg_type === 'video')
                ? isMissingMediaPath(mediaHealth, cue.bg_value)
              : cue.type === 'song' && cue.song.bg_type !== 'color'
                && cue.song.bg_type !== 'default'
                ? isMissingMediaPath(mediaHealth, cue.song.bg_value)
                : false}
            onClick={() => selectCue(cue)}
            onRemove={() => removeFromSchedule(cue.id)}
            onDragStart={() => onDragStart(i)}
            onDragOver={(e) => onDragOver(e, i)}
            onDrop={(e) => onDrop(e, i)}
            onDragEnd={() => { dragIndex.current = null; setDragOver(null) }}
          />
        ))}
      </div>

      {schedule.length > 0 && (
        <div className="schedule-footer">
          <span className="schedule-hint">Drag to reorder · Click to stage</span>
        </div>
      )}
    </div>
  )
}

function CueItem({ cue, isSelected, isLive, isDragOver, isMissing, onClick, onRemove, onDragStart, onDragOver, onDrop, onDragEnd }: {
  cue: Cue; isSelected: boolean; isLive: boolean; isDragOver: boolean; isMissing: boolean
  onClick: () => void; onRemove: () => void
  onDragStart: () => void; onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void; onDragEnd: () => void
}) {
  const color = CUE_COLORS[cue.type]
  const icon  = CUE_ICONS[cue.type]
  return (
    <div
      className={`cue-item ${isSelected?'selected':''} ${isLive?'live':''} ${isDragOver?'drag-over':''}`}
      style={{ '--cue-color': color } as React.CSSProperties}
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      aria-label={`${cue.label}${isLive ? ', live' : ''}${isMissing ? ', media missing' : ''}`}
      onClick={onClick}
      onKeyDown={event => {
        if (event.target !== event.currentTarget) return
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onClick()
        }
      }}
      draggable onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop} onDragEnd={onDragEnd}
    >
      <div className="cue-drag-handle" aria-hidden="true">⋮⋮</div>
      <div className="cue-accent" />
      <div className="cue-content">
        <div className="cue-top">
          <span className="cue-icon">{icon}</span>
          <span className="cue-label">{cue.label}</span>
          {isLive && <span className="live-badge">LIVE</span>}
          {isMissing && <span className="missing-file-badge">Missing or moved</span>}
        </div>
        {cue.type === 'song'  && cue.song.artist && <span className="cue-sub">{cue.song.artist}</span>}
      </div>
      <button
        className="cue-remove"
        aria-label={`Remove ${cue.label} from schedule`}
        onClick={e => { e.stopPropagation(); onRemove() }}
      >×</button>
    </div>
  )
}
