/**
 * Convert a local file path to a URL served by the local HTTP media server.
 * The main process passes the active loopback port in the renderer query string.
 * Port 19742 remains the compatibility fallback for tests and older entry points.
 */
const DEFAULT_MEDIA_PORT = 19742

function mediaPort(): number {
  if (typeof window === 'undefined') return DEFAULT_MEDIA_PORT
  const configured = Number(new URLSearchParams(window.location.search).get('mediaPort'))
  return Number.isInteger(configured) && configured > 0 && configured <= 65535
    ? configured
    : DEFAULT_MEDIA_PORT
}

export function mediaUrl(filePath: string): string {
  if (!filePath) return ''
  if (/^(https?:|data:|blob:)/i.test(filePath)) return filePath
  return `http://127.0.0.1:${mediaPort()}/file?p=${encodeURIComponent(filePath)}`
}
