import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { registerHooks } from 'node:module'
import { fileURLToPath } from 'node:url'

registerHooks({ resolve(specifier, context, next) {
  if (specifier.startsWith('.') && !path.extname(specifier) && context.parentURL?.startsWith('file:')) {
    const candidate = new URL(`${specifier}.ts`, context.parentURL)
    if (fs.existsSync(fileURLToPath(candidate))) return next(candidate.href, context)
  }
  return next(specifier, context)
} })
const { collectSiteSnapshot, buildSiteSnapshot } = await import('./site-publish-snapshot.ts')
const { SitePublish, readRelease } = await import('./site-publish.ts')
const { SiteDeployment } = await import('./site-deployment.ts')
const { SiteSourceTracker } = await import('./site-source-tracker.ts')
const gitHash = (bytes: Buffer) => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
const make = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ftcs-release-test-'))
  const project = path.join(root, 'website')
  fs.mkdirSync(project); fs.mkdirSync(path.join(root, '.ftcs'))
  fs.writeFileSync(path.join(root, '.ftcs/site.json'), JSON.stringify({ version: 1, projectDir: 'website', buildOutputDir: 'dist' }))
  fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify({ scripts: { dev: 'node dev.cjs', build: 'node build.cjs' } }))
  fs.writeFileSync(path.join(project, 'build.cjs'), "const fs=require('fs');fs.mkdirSync('dist',{recursive:true});fs.writeFileSync('dist/index.html','OK')")
  return { root, project }
}

test('snapshot honors ignore rules, sensitive exclusions, nested exceptions and frozen binary bytes', () => {
  const { root, project } = make()
  try {
    fs.writeFileSync(path.join(project, '.gitignore'), '*.tmp\n.env.*\n!.env.example\n')
    fs.writeFileSync(path.join(project, '.env'), 'secret')
    fs.writeFileSync(path.join(project, '.env.production'), 'secret')
    fs.writeFileSync(path.join(project, '.npmrc'), '//registry.npmjs.org/:_authToken=secret')
    fs.writeFileSync(path.join(project, '.env.example'), 'example')
    fs.mkdirSync(path.join(project, 'src'))
    fs.writeFileSync(path.join(project, 'src/.gitignore'), '!keep.tmp\n')
    fs.writeFileSync(path.join(project, 'src/keep.tmp'), 'keep')
    fs.writeFileSync(path.join(project, 'skip.tmp'), 'skip')
    fs.mkdirSync(path.join(project, 'dist')); fs.writeFileSync(path.join(project, 'dist/index.html'), 'ignored')
    const bytes = Buffer.from([0, 255, 7]); fs.writeFileSync(path.join(project, 'image.png'), bytes)
    const result = collectSiteSnapshot(project, 'dist')
    const names = result.files.map(file => file.path)
    assert.ok(names.includes('src/keep.tmp')); assert.ok(names.includes('.env.example'))
    assert.ok(!names.includes('skip.tmp')); assert.ok(!names.includes('.env')); assert.ok(!names.includes('.env.production')); assert.ok(!names.includes('.npmrc')); assert.ok(!names.includes('dist/index.html'))
    fs.writeFileSync(path.join(project, 'image.png'), 'changed')
    assert.deepEqual(result.files.find(file => file.path === 'image.png')?.bytes, bytes)
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})

test('builds the full default template from its frozen snapshot', { timeout: 300000, skip: process.env.FTCS_SITE_FULL_TEST !== '1' }, async () => {
  const snapshot = collectSiteSnapshot(path.resolve('site-template'), 'dist')
  let log = ''
  await buildSiteSnapshot(snapshot, 'dist', { exe: process.execPath, source: 'test' }, text => { log = (log + text).slice(-10000) })
  assert.match(log, /vite-ssg|generating/i)
})

test('snapshot blocks symlinks and LFS pointers', () => {
  const { root, project } = make()
  try {
    fs.symlinkSync(root, path.join(project, 'link'))
    assert.throws(() => collectSiteSnapshot(project, 'dist'), /符号链接/)
    fs.unlinkSync(path.join(project, 'link'))
    fs.writeFileSync(path.join(project, 'large.bin'), 'version https://git-lfs.github.com/spec/v1\noid sha256:abc\n')
    assert.throws(() => collectSiteSnapshot(project, 'dist'), /Git LFS/)
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})

test('publishes the built frozen snapshot, prevents concurrent overwrite and recovers an uncertain response', { timeout: 30000 }, async () => {
  const { root, project } = make()
  const repo = { id: 1, owner: 'owner', name: 'site', fullName: 'owner/site', private: true, defaultBranch: 'main', writeAccess: 'yes' as const }
  const initial = Buffer.from('# site\n')
  let head = '1'.repeat(40)
  let remote = [{ path: 'README.md', sha: gitHash(initial), mode: '100644' }]
  let throwAfterCommit = false
  let calls = 0
  const github = {
    async tree() { return { repository: repo, head, files: remote.map(file => ({ ...file })) } },
    async commit(_repo: unknown, _branch: string, expected: string, additions: Array<{ path: string; contents: string }>, deletions: Array<{ path: string }>) {
      calls++; assert.equal(expected, head)
      const items = new Map(remote.map(file => [file.path, file]))
      for (const file of deletions) items.delete(file.path)
      for (const file of additions) items.set(file.path, { path: file.path, sha: gitHash(Buffer.from(file.contents, 'base64')), mode: '100644' })
      remote = [...items.values()]; head = '2'.repeat(40)
      if (throwAfterCommit) throw new Error('connection lost')
      return head
    },
  }
  // The publisher depends only on tree/commit; no real remote is contacted.
  const publisher = new SitePublish(github as never, async () => ({ exe: process.execPath, source: 'test' }), () => root)
  try {
    await publisher.markCreated(root, repo.fullName)
    const preview = await publisher.prepare(root, 1, 'main')
    fs.writeFileSync(path.join(project, 'new-after-preview.txt'), 'not in frozen snapshot')
    throwAfterCommit = true
    await assert.rejects(publisher.commit(root, preview.id), /connection lost/)
    assert.ok(readRelease(root).pending)
    assert.ok(!remote.some(file => file.path === 'new-after-preview.txt'))
    const recovered = await publisher.recover(root)
    assert.equal(recovered.commitSha, '2'.repeat(40)); assert.equal(recovered.pending, undefined)
    publisher.beginPages(root, recovered.commitSha!, 1, 'main', 'a'.repeat(32), 'site-pages')
    await assert.rejects(publisher.prepare(root, 1, 'main'), /项目创建结果待确认/)
    assert.throws(() => publisher.bindPages(root, recovered.commitSha!, 2, 'main', 'a'.repeat(32), 'site-pages'), /版本已变化/)
    const bound = publisher.bindPages(root, recovered.commitSha!, 1, 'main', 'a'.repeat(32), 'site-pages')
    assert.equal(bound.pendingPages, undefined); assert.equal(bound.cloudflare?.project, 'site-pages')
    publisher.noteOnline(root, recovered.commitSha!, 'a'.repeat(32), 'site-pages', 'deployment-1', 'https://site-pages.pages.dev')
    assert.equal(readRelease(root).lastOnline?.deploymentId, 'deployment-1')
    assert.equal(readRelease(root).history?.[0].commitSha, recovered.commitSha)
    const second = await publisher.prepare(root, 1, 'main')
    const siteConfig = path.join(root, '.ftcs/site.json')
    fs.writeFileSync(siteConfig, JSON.stringify({ version: 1, projectDir: 'website', buildOutputDir: 'other' }))
    await assert.rejects(publisher.commit(root, second.id), /目录已变化/)
    fs.writeFileSync(siteConfig, JSON.stringify({ version: 1, projectDir: 'website', buildOutputDir: 'dist' }))
    head = '3'.repeat(40)
    await assert.rejects(publisher.commit(root, second.id), /分支已变化/)
    assert.equal(calls, 1)
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})

test('cancelling a build prevents a release from becoming ready', { timeout: 15000 }, async () => {
  const { root, project } = make()
  fs.writeFileSync(path.join(project, 'build.cjs'), 'setInterval(() => {}, 1000)')
  const repo = { id: 1, owner: 'owner', name: 'site', fullName: 'owner/site', private: true, defaultBranch: 'main', writeAccess: 'yes' as const }
  const github = { async tree() { return { repository: repo, head: '1'.repeat(40), files: [] } } }
  const publisher = new SitePublish(github as never, async () => ({ exe: process.execPath, source: 'test' }), () => root)
  try {
    const pending = publisher.prepare(root, 1, 'main')
    await new Promise(resolve => setTimeout(resolve, 300))
    publisher.cancelBuild(root)
    await assert.rejects(pending, /已取消/)
    assert.equal(readRelease(root).pending, undefined)
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})

test('a README-only repository requires consent and other remote files remain protected', async () => {
  const { root, project } = make()
  fs.writeFileSync(path.join(project, 'README.md'), 'site readme')
  const repo = { id: 1, owner: 'owner', name: 'site', fullName: 'owner/site', private: true, defaultBranch: 'main', writeAccess: 'yes' as const }
  let remote = [{ path: 'README.md', sha: gitHash(Buffer.from('user content')), mode: '100644' }]
  const github = { async tree() { return { repository: repo, head: '1'.repeat(40), files: remote } } }
  const publisher = new SitePublish(github as never, async () => ({ exe: process.execPath, source: 'test' }), () => root)
  try {
    await assert.rejects(publisher.prepare(root, 1, 'main'), /已有仓库内容/)
    const ready = await publisher.prepare(root, 1, 'main', true)
    assert.equal(ready.files.find(item => item.path === 'README.md')?.change, '修改')
    remote = [...remote, { path: 'other.txt', sha: gitHash(Buffer.from('preserve')), mode: '100644' }]
    await assert.rejects(publisher.prepare(root, 1, 'main', true), /已有仓库内容/)
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})

test('starts one Cloudflare build for the verified commit and retains uncertain requests', async () => {
  const { root } = make()
  const sha = '1'.repeat(40)
  const target = { id: 1, owner: 'owner', name: 'site', fullName: 'owner/site', private: true, branch: 'main', defaultBranch: 'main', writeAccess: 'yes' as const, contentsAccess: 'write' as const }
  const account = 'a'.repeat(32)
  fs.writeFileSync(path.join(root, '.ftcs/site-release.json'), JSON.stringify({ version: 1, createdRepositories: [], target, commitSha: sha, outputDir: 'dist', cloudflare: { accountId: account, project: 'site-pages' } }))
  let head = sha, requests = 0, state = 'waiting', fail = false
  const github = { async tree() { return { repository: target, head, files: [] } } }
  const pages = {
    async project() { return { project: {} } },
    async status() { return { state } },
    async createDeployment(_account: string, _project: string, branch: string) { requests++; assert.equal(branch, 'main'); if (fail) throw new Error('timeout'); return { id: 'deployment-1', branch, commitSha: sha } },
  }
  const publisher = new SitePublish(github as never, async () => null, () => root)
  const deployer = new SiteDeployment(github as never, pages as never, publisher, () => root, () => {})
  try {
    head = '2'.repeat(40)
    await assert.rejects(deployer.start(root), /分支已变化/)
    assert.equal(requests, 0)
    head = sha
    const started = await deployer.start(root)
    assert.equal(started.pendingDeployment?.deploymentId, 'deployment-1')
    await assert.rejects(deployer.start(root), /构建请求状态/)
    publisher.confirmDeployment(root, sha, account, 'site-pages', 'other-id')
    assert.ok(readRelease(root).pendingDeployment)
    publisher.confirmDeployment(root, sha, account, 'site-pages', 'deployment-1')
    assert.equal(readRelease(root).pendingDeployment, undefined)
    state = 'building'
    await deployer.start(root)
    assert.equal(requests, 1)
    state = 'waiting'; fail = true
    await assert.rejects(deployer.start(root), /timeout/)
    assert.ok(readRelease(root).pendingDeployment)
    await assert.rejects(deployer.start(root), /构建请求状态/)
    assert.equal(requests, 2)
    publisher.confirmDeployment(root, sha, account, 'site-pages', 'old-deployment', '2000-01-01T00:00:00Z')
    assert.ok(readRelease(root).pendingDeployment)
    publisher.confirmDeployment(root, sha, account, 'site-pages', 'new-deployment', new Date().toISOString())
    assert.equal(readRelease(root).pendingDeployment, undefined)
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})

test('site source watcher recomputes published status and rejects a changed workspace', { timeout: 10000 }, async () => {
  const { root, project } = make()
  let current = root
  const snapshots: Array<{ state: string; hash?: string }> = []
  const tracker = new SiteSourceTracker(() => current, snapshot => snapshots.push(snapshot))
  try {
    const initial = tracker.snapshot(root)
    assert.equal(initial.state, 'unpublished'); assert.ok(initial.watching); assert.ok(initial.hash)
    fs.writeFileSync(path.join(root, '.ftcs/site-release.json'), JSON.stringify({ version: 1, createdRepositories: [], commitSha: '1'.repeat(40), snapshotHash: initial.hash }))
    assert.equal(tracker.snapshot(root).state, 'clean')
    fs.writeFileSync(path.join(project, 'content.txt'), 'new content')
    const deadline = Date.now() + 5000
    while (!snapshots.some(item => item.state === 'changed') && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50))
    assert.ok(snapshots.some(item => item.state === 'changed'))
    fs.unlinkSync(path.join(project, 'content.txt'))
    assert.equal(tracker.snapshot(root).state, 'clean')
    current = path.join(root, 'other')
    assert.throws(() => tracker.snapshot(root), /工作区已改变/)
  } finally { tracker.close(); fs.rmSync(root, { recursive: true, force: true }) }
})
