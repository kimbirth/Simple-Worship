import type { SongBlock } from '../types'

/**
 * Parse raw lyrics text into SongBlocks.
 *
 * Format:
 *   [Verse 1]
 *   Line one
 *   Line two
 *
 *   [Chorus]
 *   Line one
 *   Line two
 */
export function parseLyrics(raw: string): SongBlock[] {
  const blocks: SongBlock[] = []
  const lines = raw.split('\n')

  let currentTag: string | null = null
  let currentLines: string[] = []

  const flushBlock = () => {
    if (currentTag !== null && currentLines.length > 0) {
      blocks.push({ tag: currentTag, lines: currentLines })
    }
  }

  for (const line of lines) {
    const trimmed = line.trim()

    // Detect [Tag] headers
    const tagMatch = trimmed.match(/^\[(.+)\]$/)
    if (tagMatch) {
      flushBlock()
      currentTag = tagMatch[1].trim()
      currentLines = []
      continue
    }

    // Empty line = block separator (only flush if we have content).
    // The tag carries over so a new slide/block can start under the same
    // heading without repeating "[Tag]" — e.g. two [Verse] blocks in a row.
    if (trimmed === '') {
      if (currentLines.length > 0) {
        flushBlock()
        currentLines = []
      }
      continue
    }

    // Regular lyric line
    if (currentTag !== null) {
      currentLines.push(trimmed)
    }
  }

  // Flush last block
  flushBlock()

  return blocks
}

/**
 * Get a color accent for a block tag (for visual differentiation in UI)
 */
export function tagColor(tag: string): string {
  const lower = tag.toLowerCase()
  if (lower.startsWith('verse')) return '#4a9eff'
  if (lower.startsWith('chorus')) return '#ff6b6b'
  if (lower.startsWith('bridge')) return '#ffd166'
  if (lower.startsWith('pre')) return '#a29bfe'
  if (lower.startsWith('intro')) return '#55efc4'
  if (lower.startsWith('outro')) return '#fd79a8'
  return '#b2bec3'
}
