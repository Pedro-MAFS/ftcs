import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createWriteStream } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { app, net } from 'electron'
import { createUpdateDownloadEngine } from './update-download-engine'
import type { UpdateDownloadEngine } from './update-download-engine'
import type { UpdateDownloadRequest, UpdateDownloadState } from './update-download-types'
import { installerCommand } from './update-setup-urls'

type WebReader = {
  read: () => Promise<{ done: boolean; value?: Uint8Array }>
  cancel: () => Promise<void>
}

export type { UpdateDownloadRequest, UpdateDownloadState } from './update-download-types'

let emitter: (state: UpdateDownloadState) => void = () => undefined
let engine: UpdateDownloadEngine | null = null

function updatesRoot(): string {
  return path.join(app.getPath('userData'), 'updates')
}

function getEngine(): UpdateDownloadEngine {
  if (!engine) {
    engine = createUpdateDownloadEngine({
      updatesRoot: updatesRoot(),
      emit: (state) => emitter(state),
      downloadFile: downloadUrlToFile,
      spawnInstaller,
    })
  }
  return engine
}

export function bindUpdateDownloadBroadcast(
  fn: (state: UpdateDownloadState) => void,
): void {
  emitter = fn
}

export function beginUpdateDownload(req: UpdateDownloadRequest): void {
  if (process.platform !== 'win32') return
  getEngine().begin(req)
}

export function getUpdateDownloadState(): UpdateDownloadState {
  return getEngine().getState()
}

export function retryUpdateDownload(): UpdateDownloadState {
  if (process.platform !== 'win32') return getEngine().getState()
  getEngine().retry()
  return getEngine().getState()
}

export function deferUpdateInstall(): UpdateDownloadState {
  getEngine().defer()
  return getEngine().getState()
}

export async function installDownloadedUpdate(): Promise<{ ok: boolean; message: string }> {
  if (process.platform !== 'win32') {
    return { ok: false, message: '无法启动安装程序' }
  }
  const result = await getEngine().install()
  if (result.ok) app.quit()
  return result
}

async function spawnInstaller(exePath: string): Promise<void> {
  const command = installerCommand(exePath)
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command.command, [...command.args], {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    })
    child.once('error', reject)
    child.once('spawn', () => {
      child.unref()
      resolve()
    })
  })
}

export async function downloadUrlToFile(
  url: string,
  partPath: string,
  onProgress: (received: number, total: number | null) => void,
  signal: AbortSignal,
): Promise<void> {
  const doFetch =
    typeof net.fetch === 'function' ? net.fetch.bind(net) : globalThis.fetch.bind(globalThis)
  const res = await doFetch(url, {
    method: 'GET',
    signal,
    redirect: 'follow',
    cache: 'no-store',
  })
  if (!res.ok) {
    await cancelBody(res)
    throw new Error(`HTTP ${res.status}`)
  }
  const lengthHeader = res.headers.get('content-length')
  const parsed = lengthHeader ? Number.parseInt(lengthHeader, 10) : Number.NaN
  const total = Number.isFinite(parsed) && parsed > 0 ? parsed : null
  const body = res.body
  if (!body) throw new Error('空响应')
  await fs.mkdir(path.dirname(partPath), { recursive: true })
  try {
    await writeResponseBody(body, partPath, onProgress, signal, total)
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

async function writeResponseBody(
  body: ReadableStream<Uint8Array>,
  partPath: string,
  onProgress: (received: number, total: number | null) => void,
  signal: AbortSignal,
  total: number | null,
): Promise<void> {
  const reader = (body as unknown as { getReader: () => WebReader }).getReader()
  const ws = createWriteStream(partPath)
  let received = 0
  const onAbort = () => {
    ws.destroy()
    void reader.cancel().catch(() => undefined)
  }
  signal.addEventListener('abort', onAbort, { once: true })
  try {
    while (true) {
      if (signal.aborted) {
        const err = new Error('The operation was aborted')
        err.name = 'AbortError'
        throw err
      }
      const { done, value } = await reader.read()
      if (done) break
      if (!value || value.byteLength === 0) continue
      received += value.byteLength
      const buf = Buffer.from(value)
      if (!ws.write(buf)) await once(ws, 'drain')
      onProgress(received, total)
    }
    const finished = once(ws, 'finish')
    ws.end()
    await finished
  } catch (err) {
    ws.destroy()
    throw err
  } finally {
    signal.removeEventListener('abort', onAbort)
  }
}

async function cancelBody(res: Response): Promise<void> {
  try {
    await res.body?.cancel()
  } catch {
    // 失败响应的正文可以丢弃
  }
}
