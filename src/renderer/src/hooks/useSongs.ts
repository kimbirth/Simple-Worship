import { useState, useEffect, useCallback, useRef } from 'react'
import { SongsAPI } from '../utils/api'
import type { Song } from '../types'

export function useSongs() {
  const [songs,   setSongs]   = useState<Song[]>([])
  const [loading, setLoading] = useState(true)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const data = await SongsAPI.getAll()
      if (mountedRef.current) {
        setSongs(data)
      }
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const search = useCallback(async (query: string) => {
    if (!query.trim()) { load(); return }
    try {
      const data = await SongsAPI.search(query)
      if (mountedRef.current) setSongs(data)
    } catch {}
  }, [load])

  const saveSong = useCallback(async (partial: Partial<Song> & { title: string }): Promise<Song | null> => {
    try {
      let saved: Song | null = null

      if (partial.id) {
        // Optimistic update immediately
        setSongs(prev => prev.map(s => s.id === partial.id ? { ...s, ...partial } as Song : s))
        saved = await SongsAPI.update(partial as Partial<Song> & { id: number })
        // Sync with DB truth
        if (saved && mountedRef.current) {
          setSongs(prev => prev.map(s => s.id === saved!.id ? saved! : s))
        }
      } else {
        saved = await SongsAPI.insert({
          title:      partial.title,
          artist:     partial.artist ?? '',
          lyrics_raw: partial.lyrics_raw ?? '',
          bg_type:    partial.bg_type ?? 'color',
          bg_value:   partial.bg_value ?? '#000000',
        })
        // Immediately add to list — don't wait for reload
        if (saved && mountedRef.current) {
          setSongs(prev =>
            [...prev, saved!].sort((a, b) =>
              a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
            )
          )
        }
      }

      // Background sync to catch any discrepancy
      setTimeout(() => { if (mountedRef.current) load() }, 300)
      return saved
    } catch {
      load() // recover from optimistic update on error
      return null
    }
  }, [load])

  const deleteSong = useCallback(async (id: number): Promise<boolean> => {
    // Optimistic removal
    setSongs(prev => prev.filter(s => s.id !== id))
    try {
      await SongsAPI.delete(id)
      return true
    } catch {
      load() // recover
      return false
    }
  }, [load])

  return { songs, loading, search, saveSong, deleteSong, reload: load }
}
