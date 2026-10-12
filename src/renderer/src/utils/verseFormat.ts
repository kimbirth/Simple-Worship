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

/** Build the citation range for a set of selected verse rows. Multiple
 *  selected verses always compress to "first-last" (e.g. picking 2, 6, 11
 *  shows "2-11", not "2-6-11") — never a list of every number picked. */
export function compressedVerseRange(rows: BibleVerseRow[]): string {
  if (rows.length === 0) return ''
  if (rows.length === 1) return rows[0].display_verse || String(rows[0].verse)
  const bounds = rows.map(verseBounds)
  const min = Math.min(...bounds.map(b => b[0]))
  const max = Math.max(...bounds.map(b => b[1]))
  return min === max ? String(min) : `${min}-${max}`
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
