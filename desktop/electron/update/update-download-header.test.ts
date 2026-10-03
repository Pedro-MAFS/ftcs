import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { after, describe, it } from 'node:test'
import { createUpdateDownloadEngine } from './update-download-engine.ts'
import { downloadNodeHttpToFile } from './update-download-transfer.ts'
import { setupInstallerFileName } from './update-setup-urls.ts'

const roots: string[] = []
const servers: net.Server[] = []

async function makeRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ftcs-update-header-'))
  roots.push(root)
  return root
}

function listen(handler: (socket: net.Socket) => void): Promise<net.Server> {
  const server = net.createServer(handler)
  servers.push(server)
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
}

async function waitFor(pred: () => boolean): Promise<void> {
  for (let i = 0; i < 50; i++) {
    if (pred()) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error('timed out waiting for update download')
}

describe('non-Latin-1 Content-Disposition', () => {
  after(async () => {
    await Promise.all(
      servers.map(
        (server) => new Promise((resolve) => server.close(() => resolve(undefined))),
      ),
    )
    await Promise.all(roots.map((root) => fs.rm(root, { recursive: true, force: true })))
  })

  it('saves the Gitee body and does not switch to GitHub', async () => {
    const header = 'attachment; filename="外贸获客-Setup-0.5.6.exe"'
    assert.equal(header.codePointAt(22), 22806)
    assert.equal(header[22], '外')

    const body = Buffer.from('gitee-setup-bytes')
    const server = await listen((socket) => {
      socket.once('data', (chunk) => {
        const request = chunk.toString('latin1')
        const target = request.split(' ')[1] ?? '/'
        if (target.startsWith('/jump')) {
          socket.end(
            'HTTP/1.1 302 Found\r\nLocation: /file\r\nContent-Length: 0\r\nConnection: close\r\n\r\n',
          )
          return
        }
        socket.end(
          Buffer.concat([
            Buffer.from('HTTP/1.1 200 OK\r\n'),
            Buffer.from(`Content-Disposition: ${header}\r\n`, 'utf8'),
            Buffer.from(`Content-Length: ${body.length}\r\nConnection: close\r\n\r\n`),
            body,
          ]),
        )
      })
    })
    const port = (server.address() as net.AddressInfo).port
    const localUrl = `http://127.0.0.1:${port}/jump`

    const root = await makeRoot()
    const calls: string[] = []
    let escaped = false
    const spy = () => {
      escaped = true
    }
    process.on('uncaughtException', spy)
    try {
      const engine = createUpdateDownloadEngine({
        updatesRoot: root,
        emit: () => undefined,
        spawnInstaller: async () => undefined,
        downloadFile: async (url, partPath, onProgress, signal) => {
          calls.push(url)
          if (url.includes('github.com')) {
            throw new Error('非 Latin-1 响应头不应改试 GitHub')
          }
          await downloadNodeHttpToFile(localUrl, partPath, onProgress, signal)
        },
      })
      engine.begin({
        version: '0.5.6',
        downloadPage: 'https://ftcs.ai-utills.com/download/',
      })
      await waitFor(() => engine.getState().phase === 'ready')
      assert.equal(calls.length, 1)
      assert.equal(calls[0]?.includes('gitee.com'), true)
      assert.equal(
        calls[0]?.includes('%E5%A4%96%E8%B4%B8%E8%8E%B7%E5%AE%A2-Setup-0.5.6.exe'),
        true,
      )
      assert.equal(calls.some((url) => url.includes('github.com')), false)
      const dest = path.join(root, '0.5.6', setupInstallerFileName('0.5.6'))
      assert.equal(await fs.readFile(dest, 'utf8'), 'gitee-setup-bytes')
      assert.equal(engine.getState().phase, 'ready')
      assert.equal(escaped, false)
    } finally {
      process.off('uncaughtException', spy)
    }
  })
})
