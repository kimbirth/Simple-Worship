/**
 * Some merged rows in the bundled RTPV05 source retain the tail of their
 * source range marker at the beginning of the text. For example, display
 * range "2-6" is stored as "-6aMula..." and "6-11" as "b-11Mula...".
 * Remove only a marker that repeats the row's own range end.
 */
export function cleanMergedVerseText(text: string, displayVerse: string): string {
  const range = displayVerse.trim().match(/^\d+\s*-\s*(\d+)$/)
  if (!range) return text

  const rangeEnd = range[1]
  const directMarker = `-${rangeEnd}`
  if (text.startsWith(directMarker)) {
    let cleaned = text.slice(directMarker.length)
    // Split ranges can carry an "a" suffix before the actual sentence
    // ("-6aMula"). Restrict removal to lowercase + uppercase so real
    // lowercase sentence text such as "ang..." remains untouched.
    cleaned = cleaned.replace(/^[a-z](?=[A-Z])/, '')
    return cleaned.trimStart()
  }

  const splitMarker = text.match(/^([a-z])-(\d+)/)
  if (splitMarker?.[2] === rangeEnd) {
    return text.slice(splitMarker[0].length).trimStart()
  }

  return text
}
