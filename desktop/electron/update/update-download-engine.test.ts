import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { after, describe, it } from 'node:test'
import { createUpdateDownloadEngine } from './update-download-engine.ts'
import type { UpdateDownloadEngine } from './update-download-engine.ts'
import type { UpdateDownloadRequest } from './update-download-types.ts'
import { setupInstallerFileName } from './update-setup-urls.ts'

const roots: string[] = []

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

async function makeRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ftcs-update-'))
  roots.push(root)
  return root
}

function request(version: string, extra: Partial<UpdateDownloadRequest> = {}): UpdateDownloadRequest {
  return {
    version,
    downloadPage: 'https://ftcs.ai-utills.com/download/',
    ...extra,
  }
}

async function waitFor(pred: () => boolean): Promise<void> {
  for (let i = 0; i < 50; i++) {
    if (pred()) return
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error('timed out waiting for update download')
}

function abortError(): Error {
  const err = new Error('The operation was aborted')
  err.name = 'AbortError'
  return err
}

describe('update download engine', () => {
  after(async () => {
    await Promise.all(roots.map((root) => fs.rm(root, { recursive: true, force: true })))
  })

  it('falls back from Gitee to GitHub and does not download twice for the same version', async () => {
    const root = await makeRoot()
    const calls: string[] = []
    let release: () => void = () => undefined
    const hold = new Promise<void>((resolve) => {
      release = resolve
    })
    let started = 0
    const engine = createUpdateDownloadEngine({
      updatesRoot: root,
      emit: () => undefined,
      spawnInstaller: async () => undefined,
      downloadFile: async (url, partPath, _onProgress, signal) => {
        calls.push(url)
        started += 1
        if (url.includes('gitee.com')) throw new Error('HTTP 404')
        if (started === 1) {
          await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(resolve, 30)
            signal.addEventListener('abort', () => {
              clearTimeout(timer)
              reject(abortError())
            })
          })
        }
        await fs.writeFile(partPath, 'installer-bytes')
        void hold
      },
    })
    const req = request('1.2.3')
    engine.begin(req)
    engine.begin(req)
    await waitFor(() => engine.getState().phase === 'ready')
    assert.equal(calls.length, 2)
    assert.equal(calls[0]?.includes('gitee.com'), true)
    assert.equal(calls[1]?.includes('github.com'), true)
    const dest = path.join(root, '1.2.3', setupInstallerFileName('1.2.3'))
    assert.equal(await fs.readFile(dest, 'utf8'), 'installer-bytes')
    const before = calls.length
    engine.begin(req)
    await waitFor(() => engine.getState().phase === 'ready')
    await new Promise((resolve) => setTimeout(resolve, 20))
    assert.equal(calls.length, before)
    release()
  })

  it('reports a short error when both urls fail', async () => {
    const root = await makeRoot()
    const engine = createUpdateDownloadEngine({
      updatesRoot: root,
      emit: () => undefined,
      spawnInstaller: async () => undefined,
      downloadFile: async () => {
        throw new Error('HTTP 404')
      },
    })
    engine.begin(request('1.2.4'))
    await waitFor(() => engine.getState().phase === 'failed')
    assert.equal(engine.getState().message, '下载失败：HTTP 404')
    assert.equal(engine.getState().message.includes('已是最新'), false)
  })

  it('fails checksum without trying the fallback url and can retry', async () => {
    const root = await makeRoot()
    const calls: string[] = []
    let attempt = 0
    const engine = createUpdateDownloadEngine({
      updatesRoot: root,
      emit: () => undefined,
      spawnInstaller: async () => undefined,
      downloadFile: async (url, partPath) => {
        calls.push(url)
        attempt += 1
        await fs.writeFile(partPath, attempt < 2 ? 'bad-bytes' : 'good-bytes')
      },
    })
    engine.begin(request('1.3.0', { setupSha256: sha256('good-bytes') }))
    await waitFor(() => engine.getState().phase === 'failed')
    assert.equal(engine.getState().message, '校验失败')
    assert.equal(calls.length, 1)
    const dest = path.join(root, '1.3.0', setupInstallerFileName('1.3.0'))
    await assert.rejects(fs.stat(dest))
    engine.retry()
    await waitFor(() => engine.getState().phase === 'ready')
    assert.equal(await fs.readFile(dest, 'utf8'), 'good-bytes')
  })

  it('accepts a non-empty file when the manifest has no setup url or sha256', async () => {
    const root = await makeRoot()
    const engine = createUpdateDownloadEngine({
      updatesRoot: root,
      emit: () => undefined,
      spawnInstaller: async () => undefined,
      downloadFile: async (url, partPath) => {
        assert.equal(url.includes('gitee.com'), true)
        await fs.writeFile(partPath, 'plain')
      },
    })
    engine.begin(request('1.4.0'))
    await waitFor(() => engine.getState().phase === 'ready')
    assert.equal(engine.getState().message, '已下载 1.4.0')
  })

  it('stops the older download and removes other version directories', async () => {
    const root = await makeRoot()
    const oldDir = path.join(root, '1.0.0')
    await fs.mkdir(oldDir, { recursive: true })
    await fs.writeFile(path.join(oldDir, 'old.txt'), 'old')
    const calls: string[] = []
    const engine = createUpdateDownloadEngine({
      updatesRoot: root,
      emit: () => undefined,
      spawnInstaller: async () => undefined,
      downloadFile: async (url, partPath, _onProgress, signal) => {
        calls.push(url)
        if (url.includes('/V1.0.0/')) {
          await new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(abortError()))
          })
          return
        }
        await fs.writeFile(partPath, 'newer')
      },
    })
    engine.begin(request('1.0.0'))
    await waitFor(() => calls.length === 1)
    engine.begin(request('1.1.0'))
    await waitFor(() => engine.getState().phase === 'ready' && engine.getState().version === '1.1.0')
    await assert.rejects(fs.stat(oldDir))
    assert.equal(calls.some((url) => url.includes('/V1.1.0/')), true)
  })

  it('keeps the installer after defer and can launch it without extra arguments', async () => {
    const root = await makeRoot()
    const spawned: string[] = []
    const engine: UpdateDownloadEngine = createUpdateDownloadEngine({
      updatesRoot: root,
      emit: () => undefined,
      spawnInstaller: async (exePath) => {
        spawned.push(exePath)
      },
      downloadFile: async (_url, partPath) => {
        await fs.writeFile(partPath, 'setup')
      },
    })
    engine.begin(request('1.5.0'))
    await waitFor(() => engine.getState().phase === 'ready')
    engine.defer()
    assert.equal(engine.getState().deferred, true)
    const dest = path.join(root, '1.5.0', setupInstallerFileName('1.5.0'))
    assert.equal(await fs.readFile(dest, 'utf8'), 'setup')
    const result = await engine.install()
    assert.equal(result.ok, true)
    assert.equal(spawned.length, 1)
    assert.equal(spawned[0], dest)
  })

  it('does not quit-equivalent success when the installer cannot start', async () => {
    const root = await makeRoot()
    const engine = createUpdateDownloadEngine({
      updatesRoot: root,
      emit: () => undefined,
      spawnInstaller: async () => {
        throw new Error('spawn failed')
      },
      downloadFile: async (_url, partPath) => {
        await fs.writeFile(partPath, 'setup')
      },
    })
    engine.begin(request('1.5.1'))
    await waitFor(() => engine.getState().phase === 'ready')
    const result = await engine.install()
    assert.equal(result.ok, false)
    assert.equal(result.message, '无法启动安装程序')
    assert.equal(engine.getState().phase, 'ready')
  })
})
