import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../../store/AppStore'
import { BibleAPI } from '../../utils/api'
import { buildReference, buildVerseParts, parseVerseReference } from '../../utils/verseFormat'
import type { BibleBook, BibleVerseRow, VerseCue } from '../../types'

type Step = 'books' | 'chapters' | 'verses'

export default function BibleTab() {
  const { addToSchedule, selectCue } = useStore()

  const [books, setBooks] = useState<BibleBook[]>([])
  const [versions, setVersions] = useState<string[]>([])
  const [version, setVersion] = useState('')

  const [selectedBook, setSelectedBook] = useState<BibleBook | null>(null)
  const [chapter, setChapter] = useState<number | null>(null)
  const [verses, setVerses] = useState<BibleVerseRow[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [loadingVerses, setLoadingVerses] = useState(false)

  const [bookQuery, setBookQuery] = useState('')
  const [refQuery, setRefQuery] = useState('')
  const [refError, setRefError] = useState('')
  const [installingPackage, setInstallingPackage] = useState(false)
  const [packageNotice, setPackageNotice] = useState('')
  const [packageError, setPackageError] = useState('')

  const versionRef = useRef(version)
  versionRef.current = version

  const step: Step = !selectedBook ? 'books' : !chapter ? 'chapters' : 'verses'

  const loadLibrary = useCallback(async () => {
    const [nextBooks, nextVersions] = await Promise.all([
      BibleAPI.getBooks(),
      BibleAPI.getVersions(),
    ])
    setBooks(nextBooks)
    setVersions(nextVersions)
    setVersion((current) => nextVersions.includes(current) ? current : nextVersions[0] || '')
  }, [])

  useEffect(() => { void loadLibrary() }, [loadLibrary])

  const handleInstallPackage = async () => {
    setInstallingPackage(true)
    setPackageNotice('')
    setPackageError('')
    try {
      const result = await BibleAPI.installPackage()
      if (result.canceled) return
      if (!result.installed) {
        setPackageError(result.error || 'The Bible package could not be installed.')
        return
      }
      await loadLibrary()
      setSelectedBook(null)
      setChapter(null)
      setVerses([])
      setSelectedIds(new Set())
      setPackageNotice(`Installed ${result.name || 'Bible package'}.`)
    } catch {
      setPackageError('The Bible package could not be installed.')
    } finally {
      setInstallingPackage(false)
    }
  }

  /** Loads a chapter's verses, optionally auto-selecting a set of verse
   *  numbers once they arrive (used by the reference search). Explicit
   *  function rather than a state-watching effect so search can control
   *  the sequencing precisely, even when re-searching the same chapter. */
  const loadVerses = async (book: BibleBook, ch: number, preselect?: Set<number> | null) => {
    setSelectedBook(book)
    setChapter(ch)
    setLoadingVerses(true)
    const rows = await BibleAPI.getVerses(book.id, ch, versionRef.current)
    setVerses(rows)
    if (preselect && preselect.size > 0) {
      setSelectedIds(new Set(rows.filter(r => preselect.has(r.verse)).map(r => r.id)))
    } else {
      setSelectedIds(new Set())
    }
    setLoadingVerses(false)
  }

  // Reload the current chapter when the version changes
  useEffect(() => {
    if (!selectedBook || !chapter || !version) return
    loadVerses(selectedBook, chapter)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version])

  const filteredBooks = useMemo(() => {
    const q = bookQuery.trim().toLowerCase()
    if (!q) return books
    return books.filter((b) => b.name.toLowerCase().includes(q) || b.code.toLowerCase().includes(q))
  }, [books, bookQuery])

  const oldTestamentBooks = useMemo(
    () => filteredBooks.filter((book) => book.book_order <= 39),
    [filteredBooks]
  )

  const newTestamentBooks = useMemo(
    () => filteredBooks.filter((book) => book.book_order >= 40),
    [filteredBooks]
  )

  const selectedRows = useMemo(
    () => verses.filter((v) => selectedIds.has(v.id)),
    [verses, selectedIds]
  )

  const reference = useMemo(() => {
    if (!selectedBook || !chapter || selectedRows.length === 0) return ''
    return buildReference(selectedBook.name, chapter, version, selectedRows)
  }, [selectedBook, chapter, version, selectedRows])

  const toggleVerse = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const buildCue = useCallback((): VerseCue | null => {
    if (!selectedBook || !chapter || selectedRows.length === 0) return null
    return {
      id: `stage-verse-${Date.now()}`,
      type: 'verse',
      label: reference,
      book: selectedBook.name,
      chapter,
      version,
      parts: buildVerseParts(selectedRows),
      reference,
      bg_type: 'default',
      bg_value: '',
    }
  }, [chapter, reference, selectedBook, selectedRows, version])

  // Bible selection is the Staging preview: every checkbox change and
  // reference-search preselection is reflected there immediately. This does
  // not add anything to the schedule or alter Production.
  useEffect(() => {
    const cue = buildCue()
    if (cue) selectCue(cue)
  }, [buildCue, selectCue])

  const handleAdd = () => {
    const cue = buildCue()
    if (!cue) return
    addToSchedule(cue)
    setSelectedIds(new Set())
  }

  const handleStage = () => {
    const cue = buildCue()
    if (!cue) return
    selectCue(cue)
  }

  const handleReferenceSearch = () => {
    const parsed = parseVerseReference(refQuery, books)
    if (!parsed) {
      setRefError('Reference not found. Try "Book Chapter:Verse".')
      return
    }
    setRefError('')
    loadVerses(parsed.book, parsed.chapter, parsed.verseNumbers)
  }

  return (
    <div className="lib-bible">
      <div className="lib-search-row">
        <input
          className="search-input"
          placeholder='e.g. "John 3:16" or "John 3:2,6,11"'
          value={refQuery}
          onChange={(e) => { setRefQuery(e.target.value); setRefError('') }}
          onKeyDown={(e) => { if (e.key === 'Enter') handleReferenceSearch() }}
        />
        <button className="bible-go-btn" onClick={handleReferenceSearch}>Go</button>
      </div>
      {refError && <div className="bible-ref-error">{refError}</div>}
      {packageError && <div className="bible-ref-error">{packageError}</div>}
      {packageNotice && <div className="bible-package-notice">{packageNotice}</div>}

      <div className="bible-breadcrumb">
        <button
          className={`bible-crumb ${step === 'books' ? 'active' : ''}`}
          onClick={() => { setSelectedBook(null); setChapter(null) }}
        >
          Books
        </button>
        {selectedBook && (
          <>
            <span className="bible-crumb-sep">›</span>
            <button
              className={`bible-crumb ${step === 'chapters' ? 'active' : ''}`}
              onClick={() => setChapter(null)}
            >
              {selectedBook.name}
            </button>
          </>
        )}
        {selectedBook && chapter && (
          <>
            <span className="bible-crumb-sep">›</span>
            <button className="bible-crumb active">Ch. {chapter}</button>
          </>
        )}
        {versions.length > 1 && (
          <select
            className="bible-version-select"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
          >
            {versions.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        )}
      </div>

      {step === 'books' && (
        <>
          <div className="lib-search-row">
            <input
              className="search-input"
              placeholder="Search books…"
              value={bookQuery}
              onChange={(e) => setBookQuery(e.target.value)}
            />
          </div>
          <div className="lib-list bible-testament-list">
            {books.length === 0 && (
              <div className="empty-state">
                <p>No Bible package is installed.</p>
                <button
                  className="bible-add-btn"
                  disabled={installingPackage}
                  onClick={handleInstallPackage}
                >
                  {installingPackage ? 'Installing…' : 'Install .swbible package'}
                </button>
                <p className="bible-package-note">
                  Install only a Bible translation you are licensed to use.
                </p>
              </div>
            )}
            {books.length > 0 && (
              <div className="bible-testament-columns">
                <section className="bible-testament-column" aria-labelledby="old-testament-title">
                  <h3 id="old-testament-title" className="bible-testament-title">Old Testament</h3>
                  {oldTestamentBooks.map((book) => (
                    <button
                      key={book.id}
                      className="bible-book-row"
                      onClick={() => { setSelectedBook(book); setChapter(null) }}
                    >
                      {book.name}
                    </button>
                  ))}
                  {oldTestamentBooks.length === 0 && (
                    <p className="bible-testament-empty">No matches</p>
                  )}
                </section>
                <section className="bible-testament-column" aria-labelledby="new-testament-title">
                  <h3 id="new-testament-title" className="bible-testament-title">New Testament</h3>
                  {newTestamentBooks.map((book) => (
                    <button
                      key={book.id}
                      className="bible-book-row"
                      onClick={() => { setSelectedBook(book); setChapter(null) }}
                    >
                      {book.name}
                    </button>
                  ))}
                  {newTestamentBooks.length === 0 && (
                    <p className="bible-testament-empty">No matches</p>
                  )}
                </section>
              </div>
            )}
          </div>
        </>
      )}

      {step === 'chapters' && selectedBook && (
        <div className="lib-list">
          <div className="bible-chapter-grid">
            {Array.from({ length: selectedBook.chapters }, (_, i) => i + 1).map((n) => (
              <button key={n} className="bible-chapter-btn" onClick={() => loadVerses(selectedBook, n)}>
                {n}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 'verses' && selectedBook && chapter && (
        <>
          <div className="lib-list bible-verse-list">
            {loadingVerses && <div className="empty-state"><p>Loading…</p></div>}
            {!loadingVerses && verses.length === 0 && (
              <div className="empty-state"><p>No verses found.</p></div>
            )}
            {verses.map((v) => (
              <label key={v.id} className={`bible-verse-row ${selectedIds.has(v.id) ? 'selected' : ''}`}>
                <input
                  type="checkbox"
                  checked={selectedIds.has(v.id)}
                  onChange={() => toggleVerse(v.id)}
                />
                <span className="bible-verse-num">{v.display_verse || v.verse}</span>
                <span className="bible-verse-text">{v.text}</span>
              </label>
            ))}
          </div>
          <div className="bible-footer">
            {reference && <div className="bible-reference-preview">{reference}</div>}
            <div className="bible-footer-btns">
              <button className="bible-stage-btn" disabled={selectedRows.length === 0} onClick={handleStage}>
                ▶ Push to Staging
              </button>
              <button className="bible-add-btn" disabled={selectedRows.length === 0} onClick={handleAdd}>
                + Add to Schedule
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
