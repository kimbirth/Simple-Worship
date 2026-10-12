/**
 * Local HTTP media server. It prefers the historical fixed port, then falls
 * back to an OS-assigned loopback port when unrelated software owns it.
 */
import * as http from 'http'
import { createReadStream, stat } from 'fs'
import { extname } from 'path'
import { pipeline } from 'stream'

export const MEDIA_SERVER_PORT = 19742

const MIME: Record<string, string> = {
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif',
  '.webp': 'image/webp', '.bmp': 'image/bmp', '.svg': 'image/svg+xml',
}

interface ByteRange { start: number; end: number }

let server: http.Server | null = null
let serverPort = MEDIA_SERVER_PORT
let starting: Promise<number> | null = null
let pathAllowed: ((filePath: string) => boolean) | null = null

function parseByteRange(value: string, size: number): ByteRange | null {
  if (size <= 0 || !/^bytes=\d*-\d*$/.test(value) || value.includes(',')) return null
  const [startValue, endValue] = value.slice('bytes='.length).split('-')
  if (!startValue) {
    const suffixLength = Number(endValue)
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null
    return { start: Math.max(0, size - suffixLength), end: size - 1 }
  }
  const start = Number(startValue)
  const requestedEnd = endValue ? Number(endValue) : size - 1
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) ||
      start < 0 || start >= size || requestedEnd < start) return null
  return { start, end: Math.min(requestedEnd, size - 1) }
}

function endWithStatus(res: http.ServerResponse, status: number, message: string): void {
  if (res.headersSent) { res.destroy(); return }
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' })
  res.end(message)
}

function streamFile(filePath: string, res: http.ServerResponse, range?: ByteRange): void {
  const source = range
    ? createReadStream(filePath, { start: range.start, end: range.end })
    : createReadStream(filePath)
  pipeline(source, res, error => {
    if (error && !res.headersSent) endWithStatus(res, 404, 'Not found')
  })
}

function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
  let url: URL
  try { url = new URL(req.url ?? '/', 'http://127.0.0.1') }
  catch { endWithStatus(res, 400, 'Invalid URL'); return }

  if (url.pathname !== '/file') { endWithStatus(res, 404, 'Not found'); return }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD')
    endWithStatus(res, 405, 'Method not allowed')
    return
  }

  const filePath = url.searchParams.get('p') ?? ''
  if (!filePath) { endWithStatus(res, 400, 'Missing path'); return }
  if (pathAllowed) {
    try {
      if (!pathAllowed(filePath)) { endWithStatus(res, 403, 'Forbidden'); return }
    } catch { endWithStatus(res, 403, 'Forbidden'); return }
  }

  stat(filePath, (error, fileStat) => {
    if (error || !fileStat.isFile()) { endWithStatus(res, 404, 'Not found'); return }
    const mime = MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream'
    const size = fileStat.size
    const requestedRange = req.headers.range
    const range: ByteRange | undefined = requestedRange && mime.startsWith('video/')
      ? parseByteRange(requestedRange, size) ?? undefined
      : undefined

    if (requestedRange && mime.startsWith('video/') && !range) {
      res.writeHead(416, {
        'Content-Range': `bytes */${size}`, 'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache',
      })
      res.end()
      return
    }

    if (range) {
      res.writeHead(206, {
        'Content-Range': `bytes ${range.start}-${range.end}/${size}`,
        'Accept-Ranges': 'bytes', 'Content-Length': range.end - range.start + 1,
        'Content-Type': mime, 'Cache-Control': 'no-cache',
      })
    } else {
      res.writeHead(200, {
        'Content-Length': size, 'Content-Type': mime,
        'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache',
      })
    }
    if (req.method === 'HEAD') { res.end(); return }
    streamFile(filePath, res, range)
  })
}

function errorCode(error: unknown): string {
  return error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code) : ''
}

function listenOnPort(port: number): Promise<{ candidate: http.Server; port: number }> {
  return new Promise((resolve, reject) => {
    const candidate = http.createServer(handleRequest)
    const failStartup = (error: Error) => {
      candidate.removeAllListeners()
      candidate.close()
      reject(error)
    }
    candidate.once('error', failStartup)
    candidate.listen(port, '127.0.0.1', () => {
      candidate.removeListener('error', failStartup)
      const address = candidate.address()
      if (!address || typeof address === 'string') {
        candidate.close()
        reject(new Error('The media server did not receive a usable loopback address.'))
        return
      }
      resolve({ candidate, port: address.port })
    })
  })
}

export function startMediaServer(isPathAllowed?: (filePath: string) => boolean): Promise<number> {
  if (server?.listening) {
    pathAllowed = isPathAllowed ?? pathAllowed
    return Promise.resolve(serverPort)
  }
  if (starting) return starting

  pathAllowed = isPathAllowed ?? null
  starting = (async () => {
    let bound: { candidate: http.Server; port: number }
    try { bound = await listenOnPort(MEDIA_SERVER_PORT) }
    catch (error) {
      if (errorCode(error) !== 'EADDRINUSE') throw error
      bound = await listenOnPort(0)
    }
    bound.candidate.on('error', error => {
      console.error('SimpleWorship media server error:', error)
    })
    server = bound.candidate
    serverPort = bound.port
    return bound.port
  })()
    .catch(error => {
      server = null
      pathAllowed = null
      throw error
    })
    .finally(() => { starting = null })

  return starting
}

export function stopMediaServer(): void {
  const activeServer = server
  server = null
  serverPort = MEDIA_SERVER_PORT
  pathAllowed = null
  activeServer?.close()
}
