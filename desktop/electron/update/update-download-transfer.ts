import { createWriteStream } from 'node:fs'
import fs from 'node:fs/promises'
import http from 'node:http'
import https from 'node:https'
import path from 'node:path'
import { Transform } from 'node:stream'
import type { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const MAX_REDIRECTS = 5

export type DownloadHeaders = NodeJS.Dict<string | string[] | undefined>

/**
 * 不把响应头放进 Fetch / undici 的 Headers。
 * Gitee 跳转后的 Content-Disposition 含「外贸获客-Setup-….exe」，
 * 那种非 Latin-1 头不是下载失败，调用方应继续保存正文。
 */

function abortError(): Error {
  const err = new Error('The operation was aborted')
  err.name = 'AbortError'
  return err
}

function headerLine(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

function contentLengthOf(headers: DownloadHeaders): number | null {
  const raw = headerLine(headers['content-length'])
  if (!raw) return null
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

export async function saveDownloadBody(options: {
  statusCode: number
  headers: DownloadHeaders
  body: Readable
  partPath: string
  onProgress: (received: number, total: number | null) => void
  signal: AbortSignal
}): Promise<void> {
  const { statusCode, headers, body, partPath, onProgress, signal } = options
  if (statusCode < 200 || statusCode >= 300) {
    body.resume()
    throw new Error(`HTTP ${statusCode}`)
  }
  const total = contentLengthOf(headers)
  await fs.mkdir(path.dirname(partPath), { recursive: true })
  let received = 0
  const counter = new Transform({
    transform(chunk, _encoding, callback) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      received += buf.length
      onProgress(received, total)
      callback(null, buf)
    },
  })
  try {
    await pipeline(body, counter, createWriteStream(partPath), { signal })
  } catch (err) {
    await fs.rm(partPath, { force: true }).catch(() => undefined)
    throw err
  }
  let size = 0
  try {
    size = (await fs.stat(partPath)).size
  } catch {
    size = 0
  }
  if (size <= 0) {
    await fs.rm(partPath, { force: true }).catch(() => undefined)
    throw new Error('文件为空')
  }
}

function nodeGet(url: string, signal: AbortSignal): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError())
      return
    }
    const lib = url.startsWith('https:') ? https : http
    const req = lib.get(url, (res) => {
      signal.removeEventListener('abort', onAbort)
      resolve(res)
    })
    const onAbort = () => {
      req.destroy(abortError())
    }
    signal.addEventListener('abort', onAbort, { once: true })
    req.on('error', (err) => {
      signal.removeEventListener('abort', onAbort)
      reject(err)
    })
  })
}

/** 不经过 Fetch Headers。重定向只跟随 Location，不解析 Content-Disposition。 */
export async function downloadNodeHttpToFile(
  url: string,
  partPath: string,
  onProgress: (received: number, total: number | null) => void,
  signal: AbortSignal,
  redirectsLeft = MAX_REDIRECTS,
): Promise<void> {
  const res = await nodeGet(url, signal)
  const statusCode = res.statusCode ?? 0
  if (statusCode >= 300 && statusCode < 400) {
    const location = headerLine(res.headers.location)
    res.resume()
    if (!location) throw new Error(`HTTP ${statusCode}`)
    if (redirectsLeft <= 0) throw new Error('下载重定向次数过多')
    const next = new URL(location, url).toString()
    return downloadNodeHttpToFile(next, partPath, onProgress, signal, redirectsLeft - 1)
  }
  await saveDownloadBody({
    statusCode,
    headers: res.headers,
    body: res,
    partPath,
    onProgress,
    signal,
  })
}
