import type { BibleBook, BibleVerseRow, VersePart } from '../types'

/** A verse row's own start/end. Most rows are a single verse (start===end);
 *  a merged row (e.g. display_verse "5-8") spans a range. */
export function verseBounds(row: BibleVerseRow): [number, number] {
  const label = row.display_verse || String(row.verse)
  const dash = label.indexOf('-')
  if (dash === -1) return [row.verse, row.verse]
  const start = parseInt(label.slice(0, dash), 10)
  const end = parseInt(label.slice(dash + 1), 10)
  if (Number.isFinite(start) && Number.isFinite(end)) return [start, end]
  return [row.verse, row.verse]
}

/** Build a compact, accurate citation for selected rows. Adjacent verses are
 *  collapsed to ranges while intentional gaps remain comma-separated. */
export function compressedVerseRange(rows: BibleVerseRow[]): string {
  if (rows.length === 0) return ''
  const bounds = rows
    .map(verseBounds)
    .map(([start, end]) => [Math.min(start, end), Math.max(start, end)] as [number, number])
    .sort((left, right) => left[0] - right[0] || left[1] - right[1])

  const ranges: Array<[number, number]> = []
  for (const [start, end] of bounds) {
    const previous = ranges[ranges.length - 1]
    if (previous && start <= previous[1] + 1) {
      previous[1] = Math.max(previous[1], end)
    } else {
      ranges.push([start, end])
    }
  }

  return ranges
    .map(([start, end]) => start === end ? String(start) : `${start}-${end}`)
    .join(',')
}

/** Full citation line: "Book Chapter:Range VERSION" */
export function buildReference(bookName: string, chapter: number, version: string, rows: BibleVerseRow[]): string {
  return `${bookName} ${chapter}:${compressedVerseRange(rows)} ${version}`
}

/** One part per selected verse, in verse order. A single selected verse does
 *  not need an inline number because the citation already identifies it. */
export function buildVerseParts(rows: BibleVerseRow[]): VersePart[] {
  const sorted = [...rows]
    .sort((a, b) => a.verse - b.verse)
  const showNumbers = sorted.length > 1
  return sorted.map(row => ({
    number: showNumbers ? row.display_verse || String(row.verse) : '',
    text: row.text.trim(),
  }))
}

/** Update checkbox selection using the visible chapter order. Selecting an
 *  unchecked verse fills every row between it and the current selection, so
 *  choosing verse 1 and then verse 4 includes verses 1, 2, 3, and 4. Clicking
 *  an already selected verse retains the existing toggle-off behavior. */
export function updateVerseSelection(
  rows: BibleVerseRow[],
  previousIds: ReadonlySet<number>,
  clickedId: number,
): Set<number> {
  const clickedIndex = rows.findIndex(row => row.id === clickedId)
  if (clickedIndex === -1) return new Set(previousIds)

  if (previousIds.has(clickedId)) {
    const next = new Set(previousIds)
    next.delete(clickedId)
    return next
  }

  const selectedIndexes = rows
    .map((row, index) => previousIds.has(row.id) ? index : -1)
    .filter(index => index >= 0)

  if (selectedIndexes.length === 0) return new Set([clickedId])

  const first = Math.min(clickedIndex, ...selectedIndexes)
  const last = Math.max(clickedIndex, ...selectedIndexes)
  return new Set(rows.slice(first, last + 1).map(row => row.id))
}

/** Resolve searched verse numbers to visible rows, including merged rows such
 *  as display_verse "5-8" when any requested number falls within that row. */
export function matchingVerseIds(
  rows: BibleVerseRow[],
  verseNumbers: ReadonlySet<number>,
): Set<number> {
  return new Set(rows
    .filter(row => {
      const [start, end] = verseBounds(row)
      for (const number of verseNumbers) {
        if (number >= Math.min(start, end) && number <= Math.max(start, end)) return true
      }
      return false
    })
    .map(row => row.id))
}

// ─── Reference search ("<book> <chapter>:<verse/verses>") ─────────────────────

export interface ParsedReference {
  book: BibleBook
  chapter: number
  verseNumbers: Set<number> | null   // null = whole chapter, no specific verses parsed
}

/** Parse "N" and "N-M" tokens, comma-separated, into a set of verse numbers.
 *  e.g. "2,6,11" -> {2,6,11}; "2-4,8" -> {2,3,4,8} */
function parseVerseNumbers(spec: string): Set<number> {
  const nums = new Set<number>()
  spec.split(',').map(s => s.trim()).filter(Boolean).forEach((token) => {
    const dash = token.indexOf('-')
    if (dash === -1) {
      const n = parseInt(token, 10)
      if (Number.isFinite(n)) nums.add(n)
    } else {
      const a = parseInt(token.slice(0, dash), 10)
      const b = parseInt(token.slice(dash + 1), 10)
      if (Number.isFinite(a) && Number.isFinite(b)) {
        for (let i = Math.min(a, b); i <= Math.max(a, b); i++) nums.add(i)
      }
    }
  })
  return nums
}

function findBook(query: string, books: BibleBook[]): BibleBook | null {
  const q = query.trim().toLowerCase()
  if (!q) return null
  return (
    books.find(b => b.name.toLowerCase() === q) ??
    books.find(b => b.code.toLowerCase() === q) ??
    books.find(b => b.name.toLowerCase().startsWith(q)) ??
    books.find(b => b.name.toLowerCase().includes(q)) ??
    null
  )
}

/** Parse a quick-reference string: "<book> <chapter>:<verse/verses>".
 *  The verse part is optional (just book+chapter jumps to the chapter).
 *  e.g. "John 3:16", "John 3:2,6,11", "John 3:2-11", "1 Corinthians 13" */
export function parseVerseReference(input: string, books: BibleBook[]): ParsedReference | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  const colonIdx = trimmed.indexOf(':')
  const head = colonIdx === -1 ? trimmed : trimmed.slice(0, colonIdx)
  const verseSpec = colonIdx === -1 ? '' : trimmed.slice(colonIdx + 1)

  // Chapter is the trailing numeric token; everything before it is the book query.
  const match = head.trim().match(/^(.+?)\s+(\d+)\s*$/)
  if (!match) return null

  const book = findBook(match[1], books)
  if (!book) return null
  const chapter = parseInt(match[2], 10)
  if (!Number.isFinite(chapter) || chapter < 1 || chapter > book.chapters) return null

  const verseNumbers = verseSpec.trim() ? parseVerseNumbers(verseSpec) : null
  return { book, chapter, verseNumbers }
}
