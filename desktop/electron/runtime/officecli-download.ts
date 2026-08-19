import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import fs from 'node:fs/promises'
import http from 'node:http'
import https from 'node:https'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import type { Readable } from 'node:stream'
import { OFFICECLI_INSTALL } from './officecli-install-types'

function get(url: string): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http
    const req = lib.get(
      url,
      { timeout: OFFICECLI_INSTALL.downloadTimeoutMs },
      (res) => {
        resolve(res)
      },
    )
    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy(new Error('下载超时'))
    })
  })
}

async function followDownload(
  url: string,
  redirectsLeft = 5,
): Promise<http.IncomingMessage> {
  const res = await get(url)
  const status = res.statusCode ?? 0
  if (status >= 300 && status < 400 && res.headers.location) {
    res.resume()
    if (redirectsLeft <= 0) throw new Error('下载重定向次数过多')
    const next = new URL(res.headers.location, url).toString()
    return followDownload(next, redirectsLeft - 1)
  }
  if (status !== 200) {
    res.resume()
    throw new Error(`下载失败 HTTP ${status}`)
  }
  return res
}

/** 按顺序尝试多个 URL，成功则写入 destPath */
export async function downloadOfficeCliBinary(
  destPath: string,
  onProgress?: (downloaded: number, total: number | null, url: string) => void,
): Promise<{ url: string }> {
  const urls = [OFFICECLI_INSTALL.urlGitee, OFFICECLI_INSTALL.urlGitHub]
  let lastError: unknown
  for (const url of urls) {
    try {
      await fs.mkdir(path.dirname(destPath), { recursive: true })
      const res = await followDownload(url)
      const totalHeader = res.headers['content-length']
      const total = totalHeader ? Number.parseInt(totalHeader, 10) : null
      let downloaded = 0
      res.on('data', (chunk: Buffer) => {
        downloaded += chunk.length
        onProgress?.(downloaded, Number.isFinite(total) ? total : null, url)
      })
      await pipeline(res as Readable, createWriteStream(destPath))
      return { url }
    } catch (err) {
      lastError = err
      await fs.unlink(destPath).catch(() => undefined)
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

export async function verifyOfficeCliSha256(filePath: string): Promise<boolean> {
  const hash = createHash('sha256')
  const fh = await fs.open(filePath, 'r')
  try {
    const stream = fh.createReadStream()
    for await (const chunk of stream) {
      hash.update(chunk as Buffer)
    }
  } finally {
    await fh.close()
  }
  return (
    hash.digest('hex').toLowerCase() ===
    OFFICECLI_INSTALL.sha256WinX64.toLowerCase()
  )
}
