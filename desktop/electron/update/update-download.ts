import { spawn } from 'node:child_process'
import path from 'node:path'
import type { Readable } from 'node:stream'
import { app, net } from 'electron'
import { createUpdateDownloadEngine } from './update-download-engine'
import type { UpdateDownloadEngine } from './update-download-engine'
import type { UpdateDownloadRequest, UpdateDownloadState } from './update-download-types'
import { installerCommand } from './update-setup-urls'
import {
  downloadNodeHttpToFile,
  saveDownloadBody,
  type DownloadHeaders,
} from './update-download-transfer'

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

const MAX_REDIRECTS = 5

/**
 * 安装包下载不用 net.fetch。Gitee 跳转后的 Content-Disposition 含中文文件名，
 * net.fetch 会把它写进只接受 Latin-1 的 Headers，并在响应回调里抛未捕获异常。
 * 这里用 net.request 只读状态码、Location 和正文，中文文件名不影响 Gitee 下载成功。
 */
export async function downloadUrlToFile(
  url: string,
  partPath: string,
  onProgress: (received: number, total: number | null) => void,
  signal: AbortSignal,
): Promise<void> {
  await downloadOnce(url, partPath, onProgress, signal, MAX_REDIRECTS)
}

async function downloadOnce(
  url: string,
  partPath: string,
  onProgress: (received: number, total: number | null) => void,
  signal: AbortSignal,
  redirectsLeft: number,
): Promise<void> {
  if (typeof net.request === 'function') {
    const response = await electronGet(url, signal)
    const statusCode = response.statusCode ?? 0
    if (statusCode >= 300 && statusCode < 400) {
      const location = locationOf(response.headers.location)
      response.resume()
      if (!location) throw new Error(`HTTP ${statusCode}`)
      if (redirectsLeft <= 0) throw new Error('下载重定向次数过多')
      return downloadOnce(
        new URL(location, url).toString(),
        partPath,
        onProgress,
        signal,
        redirectsLeft - 1,
      )
    }
    await saveDownloadBody({
      statusCode,
      headers: response.headers,
      body: response,
      partPath,
      onProgress,
      signal,
    })
    return
  }
  await downloadNodeHttpToFile(url, partPath, onProgress, signal, redirectsLeft)
}

function locationOf(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

type ElectronDownloadResponse = Readable & {
  statusCode?: number
  headers: DownloadHeaders & { location?: string | string[] }
  resume: () => void
}

function electronGet(url: string, signal: AbortSignal): Promise<ElectronDownloadResponse> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError())
      return
    }
    const request = net.request({
      method: 'GET',
      url,
      redirect: 'manual',
    })
    const onAbort = () => {
      request.abort()
      fail(abortError())
    }
    const fail = (err: Error) => {
      signal.removeEventListener('abort', onAbort)
      reject(err)
    }
    signal.addEventListener('abort', onAbort, { once: true })
    request.on('response', (response) => {
      signal.removeEventListener('abort', onAbort)
      resolve(response as unknown as ElectronDownloadResponse)
    })
    request.on('error', (err: Error) => {
      fail(err instanceof Error ? err : new Error(String(err)))
    })
    request.end()
  })
}

function abortError(): Error {
  const err = new Error('The operation was aborted')
  err.name = 'AbortError'
  return err
}
