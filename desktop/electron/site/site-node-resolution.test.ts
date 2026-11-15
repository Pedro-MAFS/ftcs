import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import * as nodeModule from 'node:module'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'ftcs-site-node-userdata-'))
process.env.FTCS_SITE_TEST_USERDATA = userData
const electronStub = `export const app = { getPath() { return process.env.FTCS_SITE_TEST_USERDATA } };`
const { registerHooks } = nodeModule as unknown as { registerHooks: (hooks: { resolve: (specifier: string, context: { parentURL?: string }, next: (specifier: string, context: { parentURL?: string }) => unknown) => unknown }) => void }
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'electron') return { url: `data:text/javascript,${encodeURIComponent(electronStub)}`, shortCircuit: true }
    if (specifier.startsWith('.') && !path.extname(specifier) && context.parentURL?.startsWith('file:')) {
      const candidate = new URL(`${specifier}.ts`, context.parentURL)
      if (fs.existsSync(fileURLToPath(candidate))) return next(candidate.href, context)
    }
    return next(specifier, context)
  },
})
// @ts-expect-error Node's test runner resolves TypeScript extensions at runtime.
const { resolveConfiguredNode } = await import('../runtime/node-paths.ts')
// @ts-expect-error Node's test runner resolves TypeScript extensions at runtime.
const { resolveBestNode } = await import('../runtime/resolve-node.ts')
// @ts-expect-error Node's test runner resolves TypeScript extensions at runtime.
const { SiteRuntime } = await import('./site-runtime.ts')
// @ts-expect-error Node's test runner resolves TypeScript extensions at runtime.
const { createSite } = await import('./site-project.ts')

async function until(check: () => boolean, timeout = 20000) {
  const end = Date.now() + timeout
  while (Date.now() < end) { if (check()) return; await new Promise(resolve => setTimeout(resolve, 100)) }
  throw new Error('等待操作超时')
}

test('site uses the same detected Node as FTCS when private Node was never installed', { timeout: 60000 }, async () => {
  const savedNodePath = process.env.FTCS_NODE_PATH
  const savedPath = process.env.PATH
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ftcs-existing-node-'))
  const runtime = new SiteRuntime(resolveConfiguredNode, () => root, () => {}, async () => (await resolveBestNode()).bestOk)
  try {
    delete process.env.FTCS_NODE_PATH
    process.env.PATH = [path.dirname(process.execPath), savedPath || ''].join(path.delimiter)
    assert.equal(resolveConfiguredNode(), null)
    const detected = (await resolveBestNode()).bestOk
    assert.ok(detected, 'FTCS 应能检测到已有的合格 Node')
    createSite(root, path.resolve('site-template'))
    const project = path.join(root, 'website')
    fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify({ name: 'test-site', version: '1.0.0', scripts: { dev: 'node -v', build: 'node build.cjs' } }))
    fs.writeFileSync(path.join(project, 'build.cjs'), "const f=require('fs');f.mkdirSync('dist',{recursive:true});f.writeFileSync('dist/index.html',process.execPath)")
    runtime.build(root)
    await until(() => ['succeeded', 'failed'].includes(runtime.snapshot(root).build.state), 30000)
    const result = runtime.snapshot(root).build
    assert.equal(result.state, 'succeeded', `${result.message}\n${result.log}`)
    assert.match(result.node || '', new RegExp(detected.source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    assert.equal(fs.realpathSync(fs.readFileSync(path.join(project, 'dist/index.html'), 'utf8')), fs.realpathSync(detected.exe))
  } finally {
    await runtime.shutdown()
    if (savedNodePath === undefined) delete process.env.FTCS_NODE_PATH; else process.env.FTCS_NODE_PATH = savedNodePath
    if (savedPath === undefined) delete process.env.PATH; else process.env.PATH = savedPath
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('a missing bound private Node does not fall back to a system installation', { timeout: 30000 }, async () => {
  const savedNodePath = process.env.FTCS_NODE_PATH
  const savedPath = process.env.PATH
  try {
    delete process.env.FTCS_NODE_PATH
    process.env.PATH = [path.dirname(process.execPath), savedPath || ''].join(path.delimiter)
    fs.writeFileSync(path.join(userData, 'ftcs-prefs.json'), JSON.stringify({ nodePath: path.join(userData, 'node-runtime', 'node.exe') }))
    assert.equal(resolveConfiguredNode(), null)
    assert.equal((await resolveBestNode()).bestOk, null)
  } finally {
    if (savedNodePath === undefined) delete process.env.FTCS_NODE_PATH; else process.env.FTCS_NODE_PATH = savedNodePath
    if (savedPath === undefined) delete process.env.PATH; else process.env.PATH = savedPath
    fs.rmSync(userData, { recursive: true, force: true })
    delete process.env.FTCS_SITE_TEST_USERDATA
  }
})
