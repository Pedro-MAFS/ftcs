import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import * as nodeModule from 'node:module'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import http from 'node:http'

const { registerHooks } = nodeModule as unknown as { registerHooks: (hooks: { resolve: (specifier: string, context: { parentURL?: string }, next: (specifier: string, context: { parentURL?: string }) => unknown) => unknown }) => void }
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('.') && !path.extname(specifier) && context.parentURL?.startsWith('file:')) {
      const candidate = new URL(`${specifier}.ts`, context.parentURL)
      if (fs.existsSync(fileURLToPath(candidate))) return next(candidate.href, context)
    }
    return next(specifier, context)
  },
})
// @ts-expect-error Node's test runner resolves TypeScript extensions at runtime.
const { createSite, resolveSiteOutput, setSiteOutput } = await import('./site-project.ts')
// @ts-expect-error Node's test runner resolves TypeScript extensions at runtime.
const { SiteRuntime } = await import('./site-runtime.ts')
// @ts-expect-error Node's test runner resolves TypeScript extensions at runtime.
const { localPreviewUrl, siteEnv } = await import('./site-process.ts')

async function until(check: () => boolean, timeout = 15000) {
  const end = Date.now() + timeout
  while (Date.now() < end) { if (check()) return; await new Promise(resolve => setTimeout(resolve, 100)) }
  throw new Error('等待操作超时')
}

test('runs, opens and stops a real local preview while building a separate static output', { timeout: 30000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ftcs-runtime 测试-'))
  const project = path.join(root, 'website')
  const runtime = new SiteRuntime(() => ({ exe: process.execPath, source: 'test' }), () => root, () => {})
  try {
    createSite(root, path.resolve('site-template'))
    fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify({ name: 'test-site', version: '1.0.0', scripts: { dev: 'node server.cjs', build: 'node build.cjs' } }))
    fs.writeFileSync(path.join(project, 'server.cjs'), "const h=require('http');const s=h.createServer((q,r)=>r.end(q.url==='/node'?process.execPath:'test'));s.listen(0,'127.0.0.1',()=>console.log('http://127.0.0.1:'+s.address().port+'/'))")
    fs.writeFileSync(path.join(project, 'build.cjs'), "const f=require('fs');f.mkdirSync('dist',{recursive:true});f.writeFileSync('dist/index.html','hello')")
    const previewId = runtime.startPreview(root)
    await until(() => ['running', 'address_pending', 'failed'].includes(runtime.snapshot(root).preview.state))
    const preview = runtime.snapshot(root).preview
    assert.equal(preview.state, 'running', `${preview.message}\n${preview.log}`)
    assert.equal(await (await fetch(preview.url!)).text(), 'test')
    assert.equal(await (await fetch(`${preview.url}node`)).text(), process.execPath)
    assert.throws(() => runtime.startPreview(root), /正在进行/)
    assert.throws(() => runtime.setPreviewUrl(root, previewId, 'https://example.com:443/'), /本地/)
    runtime.build(root)
    await until(() => ['succeeded', 'failed'].includes(runtime.snapshot(root).build.state))
    assert.equal(runtime.snapshot(root).build.state, 'succeeded', runtime.snapshot(root).build.message)
    assert.equal(fs.readFileSync(path.join(project, 'dist/index.html'), 'utf8'), 'hello')
    const recordPath = path.join(root, '.ftcs/site.json')
    const record = JSON.parse(fs.readFileSync(recordPath, 'utf8'))
    fs.writeFileSync(recordPath, JSON.stringify({ ...record, futureAssociation: 'preserve' }))
    runtime.setOutput(root, 'other-dist')
    assert.equal(runtime.snapshot(root).build.state, 'idle')
    assert.equal(JSON.parse(fs.readFileSync(recordPath, 'utf8')).futureAssociation, 'preserve')
    await runtime.cancel(root, 'preview', previewId)
    await until(() => runtime.snapshot(root).preview.state === 'cancelled')
    await assert.rejects(fetch(preview.url!))
  } finally { await runtime.shutdown(); fs.rmSync(root, { recursive: true, force: true }) }
})

test('never identifies an unrelated listening server as the project preview', { timeout: 30000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ftcs-foreign-'))
  const project = path.join(root, 'website')
  const runtime = new SiteRuntime(() => ({ exe: process.execPath, source: 'test' }), () => root, () => {})
  const other = http.createServer((_request, response) => response.end('unrelated'))
  await new Promise<void>(resolve => other.listen(0, '127.0.0.1', resolve))
  const address = other.address()
  if (!address || typeof address === 'string') throw new Error('invalid server address')
  const url = `http://127.0.0.1:${address.port}/`
  try {
    createSite(root, path.resolve('site-template'))
    fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify({ name: 'test-site', version: '1.0.0', scripts: { dev: 'node spoof.cjs', build: 'node -v' } }))
    fs.writeFileSync(path.join(project, 'spoof.cjs'), `console.log('${url}');setInterval(()=>{},1000)`)
    const id = runtime.startPreview(root)
    await until(() => ['running', 'address_pending', 'failed'].includes(runtime.snapshot(root).preview.state))
    assert.equal(runtime.snapshot(root).preview.state, 'address_pending')
    await runtime.cancel(root, 'preview', id)
    await until(() => runtime.snapshot(root).preview.state === 'cancelled')
    assert.equal(await (await fetch(url)).text(), 'unrelated')
  } finally { await runtime.shutdown(); await new Promise<void>(resolve => other.close(() => resolve())); fs.rmSync(root, { recursive: true, force: true }) }
})

test('workspace changes stop the old preview instead of attaching it to the new workspace', { timeout: 30000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ftcs-before-'))
  const nextRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ftcs-after-'))
  let current = root
  const runtime = new SiteRuntime(() => ({ exe: process.execPath, source: 'test' }), () => current, () => {})
  try {
    createSite(root, path.resolve('site-template'))
    const project = path.join(root, 'website')
    fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify({ name: 'test-site', version: '1.0.0', scripts: { dev: 'node server.cjs', build: 'node -v' } }))
    fs.writeFileSync(path.join(project, 'server.cjs'), "require('http').createServer((q,r)=>r.end('test')).listen(0,'127.0.0.1',function(){console.log('http://127.0.0.1:'+this.address().port+'/')})")
    runtime.startPreview(root)
    await until(() => runtime.snapshot(root).preview.state === 'running')
    const url = runtime.snapshot(root).preview.url!
    current = nextRoot
    await until(() => !runtime.hasActive())
    assert.equal(runtime.snapshot(nextRoot).preview.state, 'idle')
    await assert.rejects(fetch(url))
  } finally { await runtime.shutdown(); fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(nextRoot, { recursive: true, force: true }) }
})

test('requires explicit reinstall and preserves an existing output on a failed build', { timeout: 30000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ftcs-runtime-'))
  const project = path.join(root, 'website')
  const runtime = new SiteRuntime(() => ({ exe: process.execPath, source: 'test' }), () => root, () => {})
  try {
    createSite(root, path.resolve('site-template'))
    fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify({ name: 'test-site', version: '1.0.0', scripts: { dev: 'node -v', build: 'node -e "process.exit(3)"' } }))
    fs.mkdirSync(path.join(project, 'node_modules'))
    fs.writeFileSync(path.join(project, 'node_modules/user-file'), 'keep')
    assert.throws(() => runtime.install(root, false, false), /明确确认/)
    assert.equal(fs.readFileSync(path.join(project, 'node_modules/user-file'), 'utf8'), 'keep')
    fs.mkdirSync(path.join(project, 'dist'))
    fs.writeFileSync(path.join(project, 'dist/index.html'), 'old')
    runtime.build(root)
    await until(() => ['succeeded', 'failed'].includes(runtime.snapshot(root).build.state))
    assert.equal(runtime.snapshot(root).build.state, 'failed')
    assert.equal(fs.readFileSync(path.join(project, 'dist/index.html'), 'utf8'), 'old')
    assert.throws(() => setSiteOutput(root, '../other'), /上级/)
    fs.symlinkSync(os.tmpdir(), path.join(project, 'linked'), 'junction')
    assert.throws(() => resolveSiteOutput(project, 'linked/out'), /普通目录/)
  } finally { await runtime.shutdown(); fs.rmSync(root, { recursive: true, force: true }) }
})

test('an explicitly confirmed reinstall uses the lockfile', { timeout: 30000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ftcs-reinstall-'))
  const project = path.join(root, 'website')
  const runtime = new SiteRuntime(() => ({ exe: process.execPath, source: 'test' }), () => root, () => {})
  try {
    createSite(root, path.resolve('site-template'))
    const pkg = { name: 'test-site', version: '1.0.0', scripts: { dev: 'node -v', build: 'node -v' } }
    fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify(pkg))
    const lock = JSON.stringify({ name: pkg.name, version: pkg.version, lockfileVersion: 3, requires: true, packages: { '': { name: pkg.name, version: pkg.version } } })
    fs.writeFileSync(path.join(project, 'package-lock.json'), lock)
    fs.mkdirSync(path.join(project, 'node_modules'))
    fs.writeFileSync(path.join(project, 'node_modules/sentinel'), 'old')
    assert.throws(() => runtime.install(root, false, false), /明确确认/)
    runtime.install(root, true, false)
    await until(() => ['succeeded', 'failed'].includes(runtime.snapshot(root).install.state))
    const result = runtime.snapshot(root).install
    assert.equal(result.state, 'succeeded', `${result.message}\n${result.log}`)
    assert.ok(result.log.includes('npm ci'))
    assert.equal(fs.existsSync(path.join(project, 'node_modules/sentinel')), false)
    assert.equal(fs.readFileSync(path.join(project, 'package-lock.json'), 'utf8'), lock)
  } finally { await runtime.shutdown(); fs.rmSync(root, { recursive: true, force: true }) }
})

test('limits preview addresses and does not inherit FTCS credentials', () => {
  assert.equal(localPreviewUrl('http://127.0.0.1:1234/'), 'http://127.0.0.1:1234/')
  assert.equal(localPreviewUrl('https://example.com:443/'), null)
  assert.equal(localPreviewUrl('http://user:pass@localhost:1234/'), null)
  process.env.FTCS_TEST_SECRET = 'secret'
  try { assert.equal(siteEnv(process.execPath).FTCS_TEST_SECRET, undefined) }
  finally { delete process.env.FTCS_TEST_SECRET }
})

test('uses the existing FTCS Node resolver when no private runtime is configured', { timeout: 30000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ftcs-site-node-fallback-'))
  let fallbackCalls = 0
  const runtime = new SiteRuntime(() => null, () => root, () => {}, async () => {
    fallbackCalls++
    return { exe: process.execPath, source: 'registry InstallPath' }
  })
  try {
    createSite(root, path.resolve('site-template'))
    const project = path.join(root, 'website')
    fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify({ name: 'test-site', version: '1.0.0', scripts: { dev: 'node -v', build: 'node build.cjs' } }))
    fs.writeFileSync(path.join(project, 'build.cjs'), "const f=require('fs');f.mkdirSync('dist',{recursive:true});f.writeFileSync('dist/index.html',process.execPath)")
    runtime.build(root)
    await until(() => ['succeeded', 'failed'].includes(runtime.snapshot(root).build.state))
    const result = runtime.snapshot(root).build
    assert.equal(result.state, 'succeeded', `${result.message}\n${result.log}`)
    assert.match(result.node || '', /registry InstallPath/)
    assert.equal(fs.readFileSync(path.join(project, 'dist/index.html'), 'utf8'), process.execPath)
    assert.equal(fallbackCalls, 1)
  } finally { await runtime.shutdown(); fs.rmSync(root, { recursive: true, force: true }) }
})

test('configured Node takes precedence and a missing fallback reports a clear error', { timeout: 30000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ftcs-site-node-priority-'))
  let fallbackCalls = 0
  const runtime = new SiteRuntime(() => ({ exe: process.execPath, source: 'private' }), () => root, () => {}, async () => {
    fallbackCalls++
    throw new Error('不应调用回退解析')
  })
  try {
    createSite(root, path.resolve('site-template'))
    const project = path.join(root, 'website')
    fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify({ name: 'test-site', version: '1.0.0', scripts: { dev: 'node -v', build: 'node build.cjs' } }))
    fs.writeFileSync(path.join(project, 'build.cjs'), "const f=require('fs');f.mkdirSync('dist',{recursive:true});f.writeFileSync('dist/index.html','ok')")
    runtime.build(root)
    await until(() => ['succeeded', 'failed'].includes(runtime.snapshot(root).build.state))
    assert.equal(runtime.snapshot(root).build.state, 'succeeded')
    assert.match(runtime.snapshot(root).build.node || '', /private/)
    assert.equal(fallbackCalls, 0)

    const missing = new SiteRuntime(() => null, () => root, () => {}, async () => null)
    try {
      missing.build(root)
      await until(() => missing.snapshot(root).build.state === 'failed')
      assert.match(missing.snapshot(root).build.message, /未找到可用的 Node/)
    } finally { await missing.shutdown() }
  } finally { await runtime.shutdown(); fs.rmSync(root, { recursive: true, force: true }) }
})

test('default template installs from its lockfile, previews and builds', { timeout: 180000, skip: process.env.FTCS_SITE_FULL_TEST !== '1' }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ftcs-site-full-'))
  const runtime = new SiteRuntime(() => ({ exe: process.execPath, source: 'test' }), () => root, () => {})
  try {
    createSite(root, path.resolve('site-template'))
    runtime.install(root, false, true)
    await until(() => ['succeeded', 'failed'].includes(runtime.snapshot(root).install.state), 120000)
    const installation = runtime.snapshot(root).install
    assert.equal(installation.state, 'succeeded', `${installation.message}\n${installation.log}`)
    await until(() => ['running', 'address_pending', 'failed'].includes(runtime.snapshot(root).preview.state), 30000)
    const preview = runtime.snapshot(root).preview
    assert.equal(preview.state, 'running', `${preview.message}\n${preview.log}`)
    assert.equal(runtime.snapshot(root).install.state, 'succeeded', '启动预览不应把安装状态误判为变更')
    assert.ok((await (await fetch(preview.url!)).text()).includes('/src/main.ts'))
    runtime.build(root)
    await until(() => ['succeeded', 'failed'].includes(runtime.snapshot(root).build.state), 30000)
    const build = runtime.snapshot(root).build
    assert.equal(build.state, 'succeeded', `${build.message}\n${build.log}`)
    assert.ok(fs.readFileSync(path.join(root, 'website/dist/index.html'), 'utf8').includes('欢迎来到我的独立站'))
    await runtime.cancel(root, 'preview', preview.id)
    await until(() => runtime.snapshot(root).preview.state === 'cancelled')
  } finally { await runtime.shutdown(); fs.rmSync(root, { recursive: true, force: true }) }
})
