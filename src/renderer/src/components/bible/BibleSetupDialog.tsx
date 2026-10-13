import { useEffect, useRef, useState } from 'react'
import type { BibleInstallResult, BibleLibraryState, BundledBiblePackage } from '../../types'
import { BibleAPI } from '../../utils/api'
import { useDialogFocusTrap } from '../../hooks/useDialogFocusTrap'

export default function BibleSetupDialog() {
  const [library, setLibrary] = useState<BibleLibraryState | null>(null)
  const [requiredAtStartup, setRequiredAtStartup] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const initialCheckFinished = useRef(false)
  const dialogRef = useDialogFocusTrap<HTMLDivElement>(Boolean(
    library && requiredAtStartup && !dismissed
  ))

  const refresh = async () => {
    const next = await BibleAPI.getLibrary()
    setLibrary(next)
    if (!initialCheckFinished.current) {
      setRequiredAtStartup(next.requiresImport)
      initialCheckFinished.current = true
    }
    return next
  }

  useEffect(() => {
    let active = true
    BibleAPI.getLibrary()
      .then(next => {
        if (!active) return
        setLibrary(next)
        setRequiredAtStartup(next.requiresImport)
        initialCheckFinished.current = true
      })
      .catch(() => {
        if (!active) return
        setLibrary({
          translations: [],
          activeTranslationId: null,
          bundledCandidates: [],
          requiresImport: true,
        })
        setRequiredAtStartup(true)
        setError('SimpleWorship could not check the Bible library. Try again.')
        initialCheckFinished.current = true
      })
    return () => { active = false }
  }, [])

  const finishInstall = async (result: BibleInstallResult) => {
    if (result.canceled) return
    if (!result.installed) {
      setError(result.error || 'The Bible package could not be imported.')
      return
    }
    await refresh()
    setNotice(`Imported ${result.versions?.join(', ') || result.name || 'Bible package'}.`)
  }

  const importFromComputer = async () => {
    setBusy('browse')
    setError('')
    setNotice('')
    try {
      await finishInstall(await BibleAPI.installPackage())
    } catch {
      setError('The Bible package could not be imported.')
    } finally {
      setBusy('')
    }
  }

  const importBundled = async (candidate: BundledBiblePackage) => {
    setBusy(candidate.id)
    setError('')
    setNotice('')
    try {
      await finishInstall(await BibleAPI.installBundled(candidate.id))
    } catch {
      setError(`The included ${candidate.versions.join(', ')} package could not be imported.`)
    } finally {
      setBusy('')
    }
  }

  if (!library || dismissed || !requiredAtStartup) return null

  const installedPackageIds = new Set(library.translations.map(item => item.packageId))
  const canContinue = library.translations.length > 0

  return (
    <div className="modal-backdrop bible-setup-backdrop">
      <div
        ref={dialogRef}
        className="bible-setup-dialog"
        role="dialog"
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby="bible-setup-title"
        aria-describedby="bible-setup-description"
        aria-busy={busy !== ''}
      >
        <div className="bible-setup-icon" aria-hidden="true">📖</div>
        <h2 id="bible-setup-title">Import a Bible to begin</h2>
        <p id="bible-setup-description">
          SimpleWorship needs at least one .swbible package. You can import
          more translations now or later, then switch versions from the Bible tab.
        </p>

        {library.bundledCandidates.length > 0 && (
          <section className="bible-setup-section" aria-labelledby="included-bibles-title">
            <h3 id="included-bibles-title">Included with this distribution</h3>
            <div className="bible-setup-package-list">
              {library.bundledCandidates.map(candidate => {
                const installed = installedPackageIds.has(candidate.id)
                return (
                  <div className="bible-setup-package" key={candidate.id}>
                    <div>
                      <strong>{candidate.versions.join(', ')}</strong>
                      <span>{candidate.name}</span>
                    </div>
                    <button
                      disabled={busy !== '' || installed}
                      onClick={() => { void importBundled(candidate) }}
                    >
                      {installed ? 'Imported' : busy === candidate.id ? 'Importing…' : 'Import'}
                    </button>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {library.translations.length > 0 && (
          <section className="bible-setup-section" aria-labelledby="installed-bibles-title">
            <h3 id="installed-bibles-title">Ready to use</h3>
            <p className="bible-setup-installed">
              {library.translations.map(item => item.version).join(', ')}
            </p>
          </section>
        )}

        {error && <p className="bible-setup-error" role="alert">{error}</p>}
        {notice && <p className="bible-setup-notice" role="status" aria-live="polite">{notice}</p>}

        <p className="bible-package-note">
          Import only Bible translations you are licensed to use. Include one in
          a distributed installer only when you also have redistribution rights.
        </p>

        <div className="bible-setup-actions">
          <button
            data-dialog-initial-focus
            className="bible-setup-secondary"
            disabled={busy !== ''}
            onClick={() => { void importFromComputer() }}
          >
            {busy === 'browse' ? 'Importing…' : 'Choose .swbible file…'}
          </button>
          <button
            className="bible-setup-primary"
            disabled={!canContinue || busy !== ''}
            onClick={() => setDismissed(true)}
          >
            Continue to SimpleWorship
          </button>
          <button
            className="bible-setup-exit"
            disabled={busy !== ''}
            onClick={() => (window as any).api?.window?.close()}
          >
            Exit
          </button>
        </div>
      </div>
    </div>
  )
}
