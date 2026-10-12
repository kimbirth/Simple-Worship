import { useCallback, useEffect } from 'react'
import { useStore } from '../store/AppStore'

type HotkeyCommand = 'next' | 'previous' | 'black' | 'clear' | 'logo'

export function useKeyboardShortcuts() {
  const { state, dispatch, pushBlockToLive } = useStore()

  const runCommand = useCallback((command: HotkeyCommand) => {
    const { live } = state
    const liveBlocks = live.cue?.type === 'song' ? live.cue.blocks : []

    if (command === 'next' && live.cue && liveBlocks.length > 0) {
      const next = Math.min(live.blockIndex + 1, liveBlocks.length - 1)
      if (next !== live.blockIndex) pushBlockToLive(live.cue, next)
    }
    if (command === 'previous' && live.cue && liveBlocks.length > 0) {
      const previous = Math.max(live.blockIndex - 1, 0)
      if (previous !== live.blockIndex) pushBlockToLive(live.cue, previous)
    }
    if (command === 'black') dispatch({ type: 'LIVE_TOGGLE_OVERLAY', overlay: 'black' })
    if (command === 'clear') dispatch({ type: 'LIVE_TOGGLE_OVERLAY', overlay: 'clear' })
    if (command === 'logo') dispatch({ type: 'LIVE_TOGGLE_OVERLAY', overlay: 'logo' })
  }, [dispatch, pushBlockToLive, state])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target instanceof HTMLElement ? e.target : null
      const tag = target?.tagName.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return
      const navigationControl = target?.closest(
        'button, a[href], [role="button"], [role="separator"], [role="tab"]',
      )

      switch (e.key) {
        case 'ArrowDown':
        case 'ArrowRight':
        case 'PageDown':
          if (navigationControl) break
          e.preventDefault()
          runCommand('next')
          break

        case 'ArrowUp':
        case 'ArrowLeft':
        case 'PageUp':
          if (navigationControl) break
          e.preventDefault()
          runCommand('previous')
          break

        case 'b': case 'B':
          if (!e.ctrlKey && !e.metaKey) break
          e.preventDefault()
          runCommand('black')
          break

        case 'c': case 'C':
          if (!e.ctrlKey && !e.metaKey) break
          e.preventDefault()
          runCommand('clear')
          break

        case 'l': case 'L':
          if (!e.ctrlKey && !e.metaKey) break
          e.preventDefault()
          runCommand('logo')
          break
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [runCommand])

  useEffect(() => {
    const api = (window as any).api ?? {}
    return api.onHotkey?.((command: HotkeyCommand) => runCommand(command))
  }, [runCommand])
}
