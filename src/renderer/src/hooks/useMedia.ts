import { useState, useEffect, useCallback, useRef } from 'react'
import { MediaAPI, SettingsAPI } from '../utils/api'
import type { MediaItem } from '../types'

export function useMedia() {
  const [items,   setItems]   = useState<MediaItem[]>([])
  const [folder,  setFolder]  = useState('')
  const refreshVersion = useRef(0)

  const refresh = useCallback(async () => {
    const version = ++refreshVersion.current
    const [currentFolder, all] = await Promise.all([
      SettingsAPI.get('media_folder'),
      MediaAPI.getAll(),
    ])
    if (version !== refreshVersion.current) return
    setFolder(currentFolder || '')
    setItems(all)
  }, [])

  // Keep every Media, Settings, and VJ consumer synchronized after indexing
  // or deletion instead of leaving mounted views with stale local state.
  useEffect(() => {
    const onMediaChanged = () => {
      void refresh()
    }
    void refresh()
    window.addEventListener('simpleworship:media-changed', onMediaChanged)
    return () => {
      refreshVersion.current += 1
      window.removeEventListener('simpleworship:media-changed', onMediaChanged)
    }
  }, [refresh])

  const deleteItem = useCallback(async (id: number) => {
    await MediaAPI.delete(id)
    setItems(prev => prev.filter(m => m.id !== id))
  }, [])

  return { items, folder, deleteItem, reload: refresh }
}
