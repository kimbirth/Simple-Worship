// ─── Song ─────────────────────────────────────────────────────────────────────
/** 'default' defers to the app-wide default background configured in Settings,
 *  for songs/verses that were never given their own explicit background. */
export type BgType = 'color' | 'image' | 'video' | 'default'

export interface Song {
  id: number
  title: string
  artist: string
  lyrics_raw: string
  bg_type: BgType
  bg_value: string
}

export interface SongBlock {
  tag: string        // e.g. "Verse 1", "Chorus", "Bridge"
  lines: string[]    // all lyric lines in this block
}

// ─── Media ────────────────────────────────────────────────────────────────────
export interface MediaItem {
  id: number
  filename: string
  filepath: string
  type: 'video' | 'image'
}

// ─── Bible ────────────────────────────────────────────────────────────────────
export interface BibleBook {
  id: number
  book_order: number
  code: string
  name: string
  chapters: number
}

export interface BibleVerseRow {
  id: number
  verse: number
  text: string
  display_verse: string
}

/** One selected verse, resolved to what actually gets drawn/superscripted. */
export interface VersePart {
  number: string   // empty for one selected verse; otherwise its display label or plain verse number
  text: string
}

// ─── Schedule / Cues ──────────────────────────────────────────────────────────
export type CueType = 'song' | 'video' | 'background' | 'verse'

export interface BaseCue {
  id: string        // ephemeral, uuid generated at runtime
  type: CueType
  label: string     // display name in schedule
}

export interface SongCue extends BaseCue {
  type: 'song'
  song: Song
  blocks: SongBlock[]
}

export interface VideoCue extends BaseCue {
  type: 'video'
  media: MediaItem
}

export interface BackgroundCue extends BaseCue {
  type: 'background'
  bg_type: BgType
  bg_value: string
}

export interface VerseCue extends BaseCue {
  type: 'verse'
  book: string
  chapter: number
  version: string
  parts: VersePart[]   // one per selected verse, in verse order
  reference: string    // precomputed "Book Chapter:Range Version" citation
  bg_type: BgType
  bg_value: string
}

export type Cue = SongCue | VideoCue | BackgroundCue | VerseCue

// ─── Overlay State ────────────────────────────────────────────────────────────
type OverlayMode = 'none' | 'black' | 'clear' | 'logo'

export type OverlayKind = Exclude<OverlayMode, 'none'>

export interface OverlayState {
  black: boolean
  clear: boolean
  logo: boolean
}

export const EMPTY_OVERLAYS: OverlayState = { black: false, clear: false, logo: false }

export function resolvedOverlay(overlays: OverlayState): OverlayMode {
  // Black is the top-most safety layer. Logo sits above Clear.
  if (overlays.black) return 'black'
  if (overlays.logo) return 'logo'
  if (overlays.clear) return 'clear'
  return 'none'
}

// ─── Scene State (Preview / Live) ─────────────────────────────────────────────
export interface SceneState {
  cue: Cue | null
  blockIndex: number       // which block/verse is active
  /** Independent output layers. Black can cover Clear and reveal it when disabled. */
  overlays: OverlayState
}

// ─── Display Screen ───────────────────────────────────────────────────────────
export interface DisplayScreen {
  id: number
  label: string
  bounds: { x: number; y: number; width: number; height: number }
  isPrimary: boolean
}

// ─── Backup / Media Health ────────────────────────────────────────────────────
export interface BackupStatus {
  directory: string
  count: number
  latestAt: string | null
}

export interface MediaReference {
  kind: 'schedule' | 'live' | 'preview'
  label: string
  path: string
}

export interface MissingMediaIssue {
  kind: 'library' | 'song-background' | 'default-background' | 'logo' | MediaReference['kind']
  label: string
  path: string
}

export interface MediaValidationReport {
  checkedAt: string
  issues: MissingMediaIssue[]
}

// ─── Font Settings ────────────────────────────────────────────────────────────
export interface FontSettings {
  family: string
  size: number
  bold: boolean
  italic: boolean
  color: string
  shadowEnabled: boolean
}

export const DEFAULT_FONT: FontSettings = {
  family: 'Tahoma',
  size: 90,
  bold: true,
  italic: false,
  color: '#ffffff',
  shadowEnabled: true
}
