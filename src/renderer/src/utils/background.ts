import type { BgType } from '../types'

export interface ResolvedBg {
  type: 'color' | 'image' | 'video'
  value: string
}

export const FALLBACK_BG: ResolvedBg = { type: 'color', value: '#000000' }

/** Resolves a stored bg_type/bg_value pair to what should actually be drawn.
 *  'default' defers to the app-wide default background (itself falling back
 *  to solid black if nothing has been configured in Settings yet). */
export function resolveBackground(
  bg_type: BgType,
  bg_value: string,
  defaultBg: ResolvedBg | null
): ResolvedBg {
  if (bg_type === 'default') return defaultBg ?? FALLBACK_BG
  return { type: bg_type, value: bg_value }
}
