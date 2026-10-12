import { useState, useEffect } from 'react'
import { useSettings } from '../../hooks/useSettings'
import { BackupAPI, ScreensAPI, MediaAPI } from '../../utils/api'
import type { BackupStatus, DisplayScreen, MediaValidationReport } from '../../types'
import { RESTORE_IN_PROGRESS_KEY, useStore } from '../../store/AppStore'
import { useDialogFocusTrap } from '../../hooks/useDialogFocusTrap'

export default function SettingsModal({ onClose, mediaHealth }: {
  onClose: () => void
  mediaHealth: MediaValidationReport
}) {
  const { state, setFadeDuration } = useStore()
  const { settings, loaded, set } = useSettings()
  const [screens,  setScreens]  = useState<DisplayScreen[]>([])
  const [indexing, setIndexing] = useState(false)
  const [indexMsg, setIndexMsg] = useState('')
  const [backupStatus, setBackupStatus] = useState<BackupStatus>({ directory: '', count: 0, latestAt: null })
  const [backupMessage, setBackupMessage] = useState('')
  const [backupBusy, setBackupBusy] = useState(false)
  const dialogRef = useDialogFocusTrap<HTMLDivElement>()

  useEffect(() => {
    ScreensAPI.getAll().then(setScreens)
    BackupAPI.getStatus().then(setBackupStatus)
  }, [])

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !backupBusy && !indexing) onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [backupBusy, indexing, onClose])

  const handleSetScreen = async (id: string) => {
    await set('output_screen', id)
    if (id) await ScreensAPI.setScreen(Number(id))
    else     await ScreensAPI.toggle(false)
  }

  const handleSelectFolder = async () => {
    const path = await MediaAPI.selectFolder()
    if (!path) return
    setIndexing(true)
    setIndexMsg('Indexing…')
    try {
      const result = await MediaAPI.indexFolder(path)
      if (result?.success) {
        await set('media_folder', path)
        setIndexMsg(`${result.count} files indexed`)
      } else {
        setIndexMsg(result?.error ? `Indexing failed: ${result.error}` : 'Indexing failed')
      }
    } catch (error) {
      setIndexMsg(error instanceof Error ? `Indexing failed: ${error.message}` : 'Indexing failed')
    } finally {
      setIndexing(false)
    }
  }

  const handleCreateBackup = async () => {
    setBackupBusy(true)
    setBackupMessage('Creating backup…')
    try {
      const result = await BackupAPI.create(state.schedule)
      setBackupMessage(result ? `Saved ${result.name}` : '')
      setBackupStatus(await BackupAPI.getStatus())
    } catch (error) {
      setBackupMessage(error instanceof Error ? error.message : 'Backup failed')
    } finally {
      setBackupBusy(false)
    }
  }

  const handleRestoreBackup = async () => {
    setBackupBusy(true)
    setBackupMessage('Waiting for backup selection…')
    localStorage.setItem(RESTORE_IN_PROGRESS_KEY, '1')
    try {
      const result = await BackupAPI.restore()
      setBackupMessage(result ? `Restored ${result.name}` : '')
      if (result) {
        // Wait for the IPC acknowledgement before reloading so the restored
        // database is ready and a stale pending schedule cannot win the race.
        window.location.reload()
      } else {
        localStorage.removeItem(RESTORE_IN_PROGRESS_KEY)
      }
    } catch (error) {
      localStorage.removeItem(RESTORE_IN_PROGRESS_KEY)
      setBackupMessage(error instanceof Error ? error.message : 'Restore failed')
    } finally {
      setBackupBusy(false)
    }
  }

  if (!loaded) return null

  return (
    <div className="modal-backdrop" onClick={e => {
      if (e.target === e.currentTarget && !backupBusy && !indexing) onClose()
    }}>
      <div ref={dialogRef} className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">

        <div className="modal-header">
          <span className="modal-title" id="settings-title">Settings</span>
          <div className="modal-header-actions">
            <button
              className="modal-close-btn"
              onClick={onClose}
              disabled={backupBusy || indexing}
              aria-label="Close settings"
              data-dialog-initial-focus
            >✕</button>
          </div>
        </div>

        <div className="settings-body">

          {/* Media Folder */}
          <div className="settings-section">
            <div className="settings-section-title">Media Folder</div>
            <div className="settings-section-desc">
              Select the folder containing your background videos and images.
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button className="modal-save-btn" onClick={handleSelectFolder} disabled={indexing}>
                {indexing ? 'Indexing…' : '📁 Select Folder'}
              </button>
              <span className="settings-hint">
                {settings.media_folder
                  ? `${settings.media_folder}${indexMsg ? ` — ${indexMsg}` : ''}`
                  : indexMsg || 'No folder selected'}
              </span>
            </div>
          </div>

          {/* Missing media */}
          <div className="settings-section">
            <div className="settings-section-title">Missing Media</div>
            <div className="settings-section-desc">
              Missing or moved files are detected automatically when SimpleWorship loads or its media references change.
            </div>
            <div className="settings-action-row">
              <span className={mediaHealth.issues.length ? 'media-health-warning' : 'media-health-ok'}>
                {mediaHealth.issues.length
                  ? `${mediaHealth.issues.length} missing or moved file${mediaHealth.issues.length === 1 ? '' : 's'}`
                  : 'All referenced media is available'}
              </span>
            </div>
            {mediaHealth.issues.length > 0 && (
              <div className="missing-media-list">
                {mediaHealth.issues.map((issue, index) => (
                  <div className="missing-media-row" key={`${issue.kind}-${issue.path}-${index}`}>
                    <span className="missing-media-kind">{issue.kind.replace('-', ' ')}</span>
                    <span className="missing-media-details">
                      <strong>{issue.label}</strong>
                      <em>Missing or moved</em>
                      <span>{issue.path}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Output Screen */}
          <div className="settings-section">
            <div className="settings-section-title">Output Screen</div>
            <div className="settings-section-desc">
              Select the display for fullscreen output. If none is selected, the app automatically uses the secondary display when available.
            </div>
            <div className="screen-list">
              <div
                className={`screen-item ${!settings.output_screen ? 'selected' : ''}`}
                onClick={() => handleSetScreen('')}
                role="button"
                tabIndex={0}
                aria-pressed={!settings.output_screen}
                onKeyDown={event => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    void handleSetScreen('')
                  }
                }}
              >
                <div className="screen-item-icon">🖥</div>
                <div className="screen-item-info">
                  <span className="screen-item-name">Automatic fullscreen output</span>
                  <span className="screen-item-res">Secondary display when available</span>
                </div>
                {!settings.output_screen && <span className="screen-item-check">✓</span>}
              </div>
              {screens.map(s => (
                <div key={s.id}
                  className={`screen-item ${settings.output_screen === String(s.id) ? 'selected' : ''}`}
                  onClick={() => handleSetScreen(String(s.id))}
                  role="button"
                  tabIndex={0}
                  aria-pressed={settings.output_screen === String(s.id)}
                  onKeyDown={event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      void handleSetScreen(String(s.id))
                    }
                  }}
                >
                  <div className="screen-item-icon">{s.isPrimary ? '💻' : '🖥'}</div>
                  <div className="screen-item-info">
                    <span className="screen-item-name">{s.isPrimary ? 'Primary Display' : `Display ${s.id}`}</span>
                    <span className="screen-item-res">{s.bounds.width} × {s.bounds.height}</span>
                  </div>
                  {settings.output_screen === String(s.id) && <span className="screen-item-check">✓</span>}
                </div>
              ))}
            </div>
          </div>

          {/* Data backup */}
          <div className="settings-section">
            <div className="settings-section-title">Data Backup &amp; Recovery</div>
            <div className="settings-section-desc">
              Back up songs, the current schedule, settings, and the media index. SimpleWorship also keeps the latest 12 automatic safety backups.
            </div>
            <div className="settings-action-row">
              <button className="modal-save-btn" onClick={handleCreateBackup} disabled={backupBusy}>Create Backup</button>
              <button className="settings-secondary-btn" onClick={handleRestoreBackup} disabled={backupBusy}>Restore Backup</button>
            </div>
            <div className="settings-hint backup-status">
              {backupMessage || (
                backupStatus.count > 0
                  ? `${backupStatus.count} automatic backup${backupStatus.count === 1 ? '' : 's'} · Latest ${backupStatus.latestAt ? new Date(backupStatus.latestAt).toLocaleString() : 'unknown'}`
                  : 'No automatic backup yet'
              )}
            </div>
          </div>

          {/* Fade Duration */}
          <div className="settings-section">
            <div className="settings-section-title">Default Fade Duration</div>
            <div className="fade-duration-row">
              <input type="range" min={0} max={3000} step={100}
                value={Number(settings.fade_duration)}
                onChange={e => {
                  const value = Number(e.target.value)
                  set('fade_duration', e.target.value)
                  setFadeDuration(value)
                }}
                className="fade-slider" />
              <span className="fade-duration-label">{(Number(settings.fade_duration)/1000).toFixed(1)}s</span>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
