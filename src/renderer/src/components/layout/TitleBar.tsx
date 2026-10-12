import { useState, useEffect, useRef } from 'react'
import appLogoUrl from '../../../../../logo.png?url'

const api = () => (window as any).api ?? {}

export default function TitleBar({ onSettings, missingMediaCount = 0 }: {
  onSettings?: () => void
  missingMediaCount?: number
}) {
  const [maximized, setMaximized] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const helpRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (icon) icon.href = appLogoUrl
  }, [])

  useEffect(() => {
    const id = setInterval(() => {
      setMaximized(
        window.outerWidth >= window.screen.availWidth &&
        window.outerHeight >= window.screen.availHeight
      )
    }, 500)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!helpOpen) return
    const closeOutside = (event: MouseEvent) => {
      if (!helpRef.current?.contains(event.target as Node)) setHelpOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setHelpOpen(false)
    }
    document.addEventListener('mousedown', closeOutside)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOutside)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [helpOpen])

  return (
    <div className="titlebar">
      <div className="titlebar-left">
        <img className="titlebar-app-logo" src={appLogoUrl} alt="" />
        <span className="titlebar-name">SimpleWorship</span>
        <button className="tb-menu-btn" onClick={onSettings} aria-label="Open settings">⚙ Settings</button>
        {missingMediaCount > 0 && (
          <button className="tb-media-warning" onClick={onSettings} aria-label={`${missingMediaCount} missing media files`}>
            ⚠ {missingMediaCount} missing or moved
          </button>
        )}
        <div className="titlebar-help-wrap" ref={helpRef}>
          <button className="tb-help-btn" onClick={() => setHelpOpen(open => !open)} aria-label="Open keyboard shortcuts help">?</button>
          {helpOpen && (
            <div className="titlebar-help-popover">
              <div className="help-popover-heading">Keyboard shortcuts</div>
              <div className="hotkey-help-row"><kbd>← ↑</kbd><kbd>→ ↓</kbd><span>Previous / next live block</span></div>
              <div className="hotkey-help-row"><kbd>PgUp</kbd><kbd>PgDn</kbd><span>Previous / next live block</span></div>
              <div className="hotkey-help-row"><kbd>Ctrl+B</kbd><span>Toggle Black</span></div>
              <div className="hotkey-help-row"><kbd>Ctrl+C</kbd><span>Toggle Clear</span></div>
              <div className="hotkey-help-row"><kbd>Ctrl+L</kbd><span>Toggle Logo</span></div>
              <div className="hotkey-help-row"><kbd>Esc</kbd><span>Close focused Output</span></div>
            </div>
          )}
        </div>
      </div>
      <div className="titlebar-drag-space" />
      <div className="titlebar-controls">
        <button className="tb-btn tb-min" aria-label="Minimize window" onClick={() => api().window?.minimize()}>─</button>
        <button className="tb-btn tb-max" aria-label={maximized ? 'Restore window' : 'Maximize window'} onClick={() => api().window?.maximize()}>{maximized ? '❐' : '□'}</button>
        <button className="tb-btn tb-close" aria-label="Close application" onClick={() => api().window?.close()}>✕</button>
      </div>
    </div>
  )
}
