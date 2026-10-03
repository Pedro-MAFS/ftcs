import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { isNewerVersion } from './semver'
import type { UpdateDownloadRequest, UpdateDownloadState } from './update-download-types'
import {
  parseSetupSha256,
  resolveSetupDownloadUrls,
  setupInstallerFileName,
} from './update-setup-urls'

export interface UpdateDownloadEngineOptions {
  updatesRoot: string
  emit: (state: UpdateDownloadState) => void
  downloadFile: (
    url: string,
    partPath: string,
    onProgress: (received: number, total: number | null) => void,
    signal: AbortSignal,
  ) => Promise<void>
  spawnInstaller: (exePath: string) => Promise<void>
}

export interface UpdateDownloadEngine {
  begin: (req: UpdateDownloadRequest) => void
  retry: () => void
  defer: () => void
  install: () => Promise<{ ok: boolean; message: string }>
  getState: () => UpdateDownloadState
}

const PROGRESS_EMIT_MS = 200

function emptyState(): UpdateDownloadState {
  return {
    phase: 'idle',
    version: null,
    received: 0,
    total: null,
    message: '',
    deferred: false,
    downloadPage: '',
    revision: 0,
  }
}

function copyState(state: UpdateDownloadState): UpdateDownloadState {
  return { ...state }
}

function safeVersion(version: string): string | null {
  const value = String(version ?? '').trim()
  if (!value || value.includes('..') || /[\\/\0]/.test(value)) return null
  return value
}

function isAbortError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  return err.name === 'AbortError' || err.message === 'The operation was aborted'
}

function isChecksumError(err: unknown): boolean {
  return err instanceof Error && err.message === '校验失败'
}

export function formatDownloadError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? '')
  const text = raw.replace(/\s+/g, ' ').trim()
  if (!text) return '下载失败'
  if (text === '校验失败') return '校验失败'
  const full = text.startsWith('下载失败') ? text : `下载失败：${text}`
  return full.length > 80 ? `${full.slice(0, 80)}…` : full
}

async function sha256OfFile(filePath: string): Promise<string> {
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
  return hash.digest('hex')
}

export function createUpdateDownloadEngine(
  options: UpdateDownloadEngineOptions,
): UpdateDownloadEngine {
  let state = emptyState()
  let remembered: UpdateDownloadRequest | null = null
  let seq = 0
  let revision = 0
  let lastEmitAt = 0
  let gate: Promise<void> = Promise.resolve()
  let active: {
    version: string
    token: number
    controller: AbortController
    done: Promise<void>
  } | null = null

  function emit(next: Omit<UpdateDownloadState, 'revision'>, throttle: boolean): void {
    revision += 1
    state = { ...next, revision }
    const now = Date.now()
    if (throttle && next.phase === 'downloading' && now - lastEmitAt < PROGRESS_EMIT_MS) {
      return
    }
    lastEmitAt = now
    options.emit(copyState(state))
  }

  function installerPath(version: string): string {
    return path.join(options.updatesRoot, version, setupInstallerFileName(version))
  }

  async function fileReady(version: string, shaRaw: string | undefined): Promise<boolean> {
    const dest = installerPath(version)
    try {
      const st = await fs.stat(dest)
      if (!st.isFile() || st.size <= 0) return false
    } catch {
      return false
    }
    const sha = parseSetupSha256(shaRaw)
    if (sha.kind === 'skip') return true
    if (sha.kind === 'invalid') return false
    return (await sha256OfFile(dest)) === sha.hex
  }

  async function removeOtherVersions(keep: string): Promise<void> {
    let entries: import('node:fs').Dirent[]
    try {
      entries = await fs.readdir(options.updatesRoot, { withFileTypes: true })
    } catch {
      return
    }
    await Promise.all(
      entries
        .filter((ent) => ent.isDirectory() && ent.name !== keep)
        .map((ent) =>
          fs.rm(path.join(options.updatesRoot, ent.name), { recursive: true, force: true }),
        ),
    )
  }

  async function stopActiveIfOlder(version: string): Promise<boolean> {
    if (!active || active.version === version) return true
    if (!isNewerVersion(version, active.version)) return false
    const prev = active
    prev.controller.abort()
    active = null
    await prev.done.catch(() => undefined)
    return true
  }

  function begin(req: UpdateDownloadRequest): void {
    gate = gate.then(
      () => decide(req),
      () => decide(req),
    )
  }

  async function decide(req: UpdateDownloadRequest): Promise<void> {
    try {
      await decideInner(req)
    } catch (err) {
      if (isAbortError(err)) return
      emit(
        {
          phase: 'failed',
          version: safeVersion(req.version),
          received: 0,
          total: null,
          message: formatDownloadError(err),
          deferred: false,
          downloadPage: req.downloadPage,
        },
        false,
      )
    }
  }

  async function decideInner(req: UpdateDownloadRequest): Promise<void> {
    const version = safeVersion(req.version)
    if (!version) {
      emit(
        {
          phase: 'failed',
          version: null,
          received: 0,
          total: null,
          message: '下载失败：版本号无效',
          deferred: false,
          downloadPage: req.downloadPage,
        },
        false,
      )
      return
    }
    const normalized: UpdateDownloadRequest = { ...req, version }
    if (active?.version === version) {
      options.emit(copyState(state))
      return
    }
    if (await fileReady(version, req.setupSha256)) {
      const switched = await stopActiveIfOlder(version)
      if (!switched) return
      await removeOtherVersions(version)
      const deferred = state.phase === 'ready' && state.version === version && state.deferred
      let size = 0
      try {
        size = (await fs.stat(installerPath(version))).size
      } catch {
        size = 0
      }
      remembered = normalized
      emit(
        {
          phase: 'ready',
          version,
          received: size,
          total: size > 0 ? size : null,
          message: `已下载 ${version}`,
          deferred,
          downloadPage: req.downloadPage,
        },
        false,
      )
      return
    }
    if (active && !isNewerVersion(version, active.version)) return
    if (active) {
      const switched = await stopActiveIfOlder(version)
      if (!switched) return
    }
    await removeOtherVersions(version)
    const controller = new AbortController()
    const token = ++seq
    let resolveDone: () => void = () => undefined
    const done = new Promise<void>((resolve) => {
      resolveDone = resolve
    })
    active = { version, token, controller, done }
    remembered = normalized
    emit(
      {
        phase: 'downloading',
        version,
        received: 0,
        total: null,
        message: `正在下载 ${version}`,
        deferred: false,
        downloadPage: req.downloadPage,
      },
      false,
    )
    void runDownload(normalized, token, controller).finally(() => {
      resolveDone()
      if (active?.token === token) active = null
    })
  }

  async function runDownload(
    req: UpdateDownloadRequest,
    token: number,
    controller: AbortController,
  ): Promise<void> {
    const version = req.version
    const urls = resolveSetupDownloadUrls(version, req)
    const dest = installerPath(version)
    const part = `${dest}.part`
    await fs.mkdir(path.dirname(dest), { recursive: true })
    let lastError: unknown
    for (const url of [urls.primary, urls.fallback]) {
      if (controller.signal.aborted || token !== seq) return
      try {
        await fs.rm(part, { force: true })
        await options.downloadFile(
          url,
          part,
          (received, total) => {
            if (token !== seq || controller.signal.aborted) return
            emit(
              {
                phase: 'downloading',
                version,
                received,
                total,
                message: `正在下载 ${version}`,
                deferred: false,
                downloadPage: req.downloadPage,
              },
              true,
            )
          },
          controller.signal,
        )
        const stat = await fs.stat(part)
        if (stat.size <= 0) throw new Error('文件为空')
        await fs.rm(dest, { force: true })
        await fs.rename(part, dest)
        const sha = parseSetupSha256(req.setupSha256)
        if (
          sha.kind === 'invalid' ||
          (sha.kind === 'check' && (await sha256OfFile(dest)) !== sha.hex)
        ) {
          await fs.rm(dest, { force: true })
          throw new Error('校验失败')
        }
        if (controller.signal.aborted || token !== seq) return
        const size = (await fs.stat(dest)).size
        emit(
          {
            phase: 'ready',
            version,
            received: size,
            total: size,
            message: `已下载 ${version}`,
            deferred: false,
            downloadPage: req.downloadPage,
          },
          false,
        )
        return
      } catch (err) {
        await fs.rm(part, { force: true }).catch(() => undefined)
        if (controller.signal.aborted || token !== seq || isAbortError(err)) return
        if (isChecksumError(err)) {
          emit(
            {
              phase: 'failed',
              version,
              received: 0,
              total: null,
              message: '校验失败',
              deferred: false,
              downloadPage: req.downloadPage,
            },
            false,
          )
          return
        }
        lastError = err
      }
    }
    if (controller.signal.aborted || token !== seq) return
    emit(
      {
        phase: 'failed',
        version,
        received: 0,
        total: null,
        message: formatDownloadError(lastError),
        deferred: false,
        downloadPage: req.downloadPage,
      },
      false,
    )
  }

  function retry(): void {
    if (state.phase !== 'failed' || !remembered) return
    begin(remembered)
  }

  function defer(): void {
    if (state.phase !== 'ready') return
    emit({ ...state, deferred: true }, false)
  }

  async function install(): Promise<{ ok: boolean; message: string }> {
    if (state.phase !== 'ready' || !state.version) {
      return { ok: false, message: '无法启动安装程序' }
    }
    const exe = installerPath(state.version)
    try {
      await fs.access(exe)
    } catch {
      return { ok: false, message: '无法启动安装程序' }
    }
    try {
      await options.spawnInstaller(exe)
    } catch {
      return { ok: false, message: '无法启动安装程序' }
    }
    return { ok: true, message: '' }
  }

  return {
    begin,
    retry,
    defer,
    install,
    getState: () => copyState(state),
  }
}
