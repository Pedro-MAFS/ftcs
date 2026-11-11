import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import type { GithubRepositories, GithubRepository, GithubTreeFile } from '../github/github-repositories'
import { getSiteOutput, getSiteSnapshot } from './site-project'
import { buildSiteSnapshot, collectSiteSnapshot, type PublishSnapshot } from './site-publish-snapshot'

type Target = { id: number; owner: string; name: string; fullName: string; branch: string; private: boolean }
type RecordedFile = { path: string; sha: string; mode: string }
export type ReleaseRecord = { version: 1; createdRepositories: string[]; target?: Target; commitSha?: string; snapshotHash?: string; outputDir?: string; pending?: { target: Target; base: string; files: RecordedFile[]; snapshotHash?: string; outputDir?: string }; pendingPages?: { accountId: string; project: string; commitSha: string }; cloudflare?: { accountId: string; project: string }; history?: Array<{ target: Target; commitSha: string; at: string }>; lastOnline?: { target: Target; commitSha: string; accountId: string; project: string; deploymentId: string; url: string; confirmedAt: string } }
export type PublishPreview = { id: string; target: Target; head: string; hash: string; files: Array<{ path: string; size: number; change: '新增' | '修改' | '未变化' }>; deleted: string[]; log: string; noChanges: boolean }
type Ready = { id: string; root: string; repository: GithubRepository; branch: string; head: string; output: string; snapshot: PublishSnapshot; additions: Array<{ path: string; contents: string }>; deletions: Array<{ path: string }> }

function file(root: string) { return path.join(root, '.ftcs', 'site-release.json') }
function empty(): ReleaseRecord { return { version: 1, createdRepositories: [] } }
export function readRelease(root: string): ReleaseRecord {
  try {
    const stat = fs.lstatSync(file(root))
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('发布记录不是普通文件。')
    const data = JSON.parse(fs.readFileSync(file(root), 'utf8')) as ReleaseRecord
    if (data.version !== 1 || !Array.isArray(data.createdRepositories)) throw new Error('发布记录格式无效。')
    return data
  } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return empty(); throw error }
}
function saveRelease(root: string, record: ReleaseRecord): void {
  const dir = path.join(root, '.ftcs')
  const stat = fs.lstatSync(dir)
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('工作区 .ftcs 目录不可用。')
  try { const target = fs.lstatSync(file(root)); if (!target.isFile() || target.isSymbolicLink()) throw new Error('发布记录不是普通文件。') } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  const temp = path.join(dir, `.site-release-${randomUUID()}.tmp`)
  try { fs.writeFileSync(temp, JSON.stringify(record, null, 2) + '\n', { encoding: 'utf8', flag: 'wx', mode: 0o600 }); fs.renameSync(temp, file(root)) }
  finally { try { fs.unlinkSync(temp) } catch { /* already renamed */ } }
}
function target(repo: GithubRepository, branch: string): Target { return { id: repo.id, owner: repo.owner, name: repo.name, fullName: repo.fullName, branch, private: repo.private } }
function sameFiles(remote: GithubTreeFile[], files: RecordedFile[]): boolean {
  if (remote.length !== files.length) return false
  const expected = new Map(files.map(item => [item.path, item]))
  return remote.every(item => { const desired = expected.get(item.path); return desired?.sha === item.sha && desired.mode === item.mode })
}
function recorded(snapshot: PublishSnapshot): RecordedFile[] { return snapshot.files.map(f => ({ path: f.path, sha: f.gitSha, mode: f.mode.toString(8) })) }
function addHistory(record: ReleaseRecord, repo: Target, sha: string): void {
  const history = record.history || []
  if (!history.some(item => item.target.id === repo.id && item.target.branch === repo.branch && item.commitSha === sha)) history.unshift({ target: repo, commitSha: sha, at: new Date().toISOString() })
  record.history = history.slice(0, 50)
}

export class SitePublish {
  private ready: Ready | null = null
  private busy = false
  private building: { root: string; controller: AbortController } | null = null
  private buildDone: Promise<void> | null = null
  private readonly github: GithubRepositories
  private readonly findNode: () => Promise<{ exe: string; source: string } | null>
  private readonly currentRoot: () => string
  constructor(github: GithubRepositories, findNode: () => Promise<{ exe: string; source: string } | null>, currentRoot: () => string) { this.github = github; this.findNode = findNode; this.currentRoot = currentRoot }
  private assertRoot(root: string): string {
    const normalize = (value: string) => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value)
    if (normalize(root) !== normalize(this.currentRoot())) throw new Error('工作区已改变，请重新操作。')
    if (getSiteSnapshot(root).status !== 'ready') throw new Error('站点尚未就绪，请先创建或恢复站点。')
    return path.resolve(root)
  }
  async markCreated(root: string, fullName: string): Promise<void> {
    if (this.busy) throw new Error('已有发布操作正在进行。')
    root = this.assertRoot(root)
    const record = readRelease(root)
    if (!record.createdRepositories.includes(fullName)) record.createdRepositories.push(fullName)
    saveRelease(root, record)
  }
  async prepare(root: string, repositoryId: number, branch: string, acceptInitialReadme = false): Promise<PublishPreview> {
    if (this.busy) throw new Error('已有发布操作正在进行。')
    this.busy = true; this.ready = null
    const controller = new AbortController()
    this.building = { root: path.resolve(root), controller }
    let finishBuild: () => void = () => {}
    this.buildDone = new Promise(resolve => { finishBuild = resolve })
    const guard = setInterval(() => {
      try { const same = (value: string) => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value); if (same(root) !== same(this.currentRoot())) controller.abort() }
      catch { controller.abort() }
    }, 1000)
    try {
      root = this.assertRoot(root)
      const output = getSiteOutput(root)
      if (!output) throw new Error('请先设置静态产物目录。')
      const snapshot = collectSiteSnapshot(path.join(root, 'website'), output)
      const remote = await this.github.tree(repositoryId, branch)
      this.assertRoot(root)
      if (controller.signal.aborted) throw new Error('构建检查已取消。')
      const record = readRelease(root)
      if (record.pending) throw new Error('上一次提交结果待确认，请先检查发布记录。')
      if (record.pendingPages) throw new Error('Cloudflare 项目创建结果待确认，请先检查发布记录。')
      const bound = record.target?.id === repositoryId && record.target.branch === branch && !!record.commitSha
      if (bound && record.commitSha !== remote.head) throw new Error('GitHub 分支已被其他操作修改，请先协调远端内容。')
      const initialReadme = createHash('sha1').update(`blob ${Buffer.byteLength(`# ${remote.repository.name}\n`)}\0# ${remote.repository.name}\n`).digest('hex')
      const ownInitial = (record.createdRepositories.includes(remote.repository.fullName) || acceptInitialReadme) && remote.files.length === 1 && remote.files[0].path === 'README.md' && remote.files[0].sha === initialReadme
      if (!bound && remote.files.length && !ownInitial && !sameFiles(remote.files, recorded(snapshot))) throw new Error('已有仓库内容与站点不一致，请选择空仓库或先在 GitHub 协调内容。')
      const before = new Map(remote.files.map(f => [f.path, f]))
      const desired = new Set(snapshot.files.map(f => f.path))
      const files = snapshot.files.map(f => ({ path: f.path, size: f.bytes.length, change: (!before.has(f.path) ? '新增' : before.get(f.path)?.sha === f.gitSha ? '未变化' : '修改') as '新增' | '修改' | '未变化' }))
      const additions = snapshot.files.filter(f => before.get(f.path)?.sha !== f.gitSha).map(f => ({ path: f.path, contents: f.bytes.toString('base64') }))
      const deleted = remote.files.filter(f => !desired.has(f.path)).map(f => f.path)
      let log = ''
      try { await buildSiteSnapshot(snapshot, output, await this.findNode(), chunk => { log = (log + chunk).slice(-50000) }, controller.signal) }
      catch (error) { throw new Error(`${error instanceof Error ? error.message : String(error)}${log ? `\n${log.slice(-4000)}` : ''}`) }
      this.assertRoot(root)
      if (getSiteOutput(root) !== output) throw new Error('静态产物目录已变化，请重新检查。')
      const id = randomUUID()
      this.ready = { id, root, repository: remote.repository, branch, head: remote.head, output, snapshot, additions, deletions: deleted.map(path => ({ path })) }
      return { id, target: target(remote.repository, branch), head: remote.head, hash: snapshot.hash, files, deleted, log, noChanges: !additions.length && !deleted.length }
    } finally { clearInterval(guard); this.building = null; this.busy = false; finishBuild(); this.buildDone = null }
  }
  hasActive(): boolean { return this.busy }
  async shutdown(): Promise<boolean> {
    if (!this.building) return !this.busy
    this.building.controller.abort()
    const done = this.buildDone
    if (!done) return false
    let timer: ReturnType<typeof setTimeout> | undefined
    try { return await Promise.race([done.then(() => true), new Promise<false>(resolve => { timer = setTimeout(() => resolve(false), 10000) })]) }
    finally { if (timer) clearTimeout(timer) }
  }
  cancelBuild(root: string): void {
    const same = (value: string) => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value)
    if (!this.building || same(root) !== same(this.building.root)) throw new Error('当前没有可取消的构建检查。')
    this.building.controller.abort()
  }
  async commit(root: string, id: string): Promise<ReleaseRecord> {
    if (this.busy) throw new Error('已有发布操作正在进行。')
    this.busy = true
    try {
      root = this.assertRoot(root)
      const ready = this.ready
      if (!ready || ready.id !== id || ready.root !== root) throw new Error('发布准备已失效，请重新检查。')
      if (getSiteOutput(root) !== ready.output) throw new Error('静态产物目录已变化，请重新检查。')
      const remote = await this.github.tree(ready.repository.id, ready.branch)
      this.assertRoot(root)
      if (getSiteOutput(root) !== ready.output) throw new Error('静态产物目录已变化，请重新检查。')
      if (remote.head !== ready.head || remote.repository.fullName !== ready.repository.fullName) throw new Error('仓库或分支已变化，请重新检查。')
      const record = readRelease(root)
      if (record.pending) throw new Error('上一次提交结果待确认，请先检查发布记录。')
      if (record.pendingPages) throw new Error('Cloudflare 项目创建结果待确认，请先检查发布记录。')
      const nextTarget = target(remote.repository, ready.branch)
      if (!ready.additions.length && !ready.deletions.length) {
        if (record.target?.id !== nextTarget.id || record.target.branch !== nextTarget.branch) delete record.cloudflare
        record.target = nextTarget; record.commitSha = ready.head; record.snapshotHash = ready.snapshot.hash; record.outputDir = ready.output
        addHistory(record, nextTarget, ready.head)
        saveRelease(root, record); this.ready = null; return record
      }
      record.pending = { target: nextTarget, base: ready.head, files: recorded(ready.snapshot), snapshotHash: ready.snapshot.hash, outputDir: ready.output }
      saveRelease(root, record)
      this.ready = null
      const sha = await this.github.commit(remote.repository, ready.branch, ready.head, ready.additions, ready.deletions)
      if (record.target?.id !== nextTarget.id || record.target.branch !== nextTarget.branch) delete record.cloudflare
      record.target = nextTarget; record.commitSha = sha; record.snapshotHash = ready.snapshot.hash; record.outputDir = ready.output; delete record.pending
      addHistory(record, nextTarget, sha)
      saveRelease(root, record)
      return record
    } finally { this.busy = false }
  }
  async recover(root: string): Promise<ReleaseRecord> {
    if (this.busy) throw new Error('已有发布操作正在进行。')
    this.busy = true
    try {
      root = this.assertRoot(root)
      const record = readRelease(root)
      if (!record.pending) return record
      const pending = record.pending
      const remote = await this.github.tree(pending.target.id, pending.target.branch)
      this.assertRoot(root)
      if (sameFiles(remote.files, pending.files)) { if (record.target?.id !== pending.target.id || record.target.branch !== pending.target.branch) delete record.cloudflare; record.target = pending.target; record.commitSha = remote.head; record.snapshotHash = pending.snapshotHash; record.outputDir = pending.outputDir; addHistory(record, pending.target, remote.head); delete record.pending; saveRelease(root, record); return record }
      if (remote.head === pending.base) { delete record.pending; saveRelease(root, record); return record }
      throw new Error('提交结果无法确认：远端分支已变化，请先在 GitHub 核对。')
    } finally { this.busy = false }
  }
  previewFile(root: string, id: string, name: string): { text?: string; message?: string } {
    root = this.assertRoot(root)
    const ready = this.ready
    if (!ready || ready.root !== root || ready.id !== id) throw new Error('发布准备已失效，请重新检查。')
    const file = ready.snapshot.files.find(item => item.path === name)
    if (!file) throw new Error('该文件不在发布快照中。')
    if (file.bytes.length > 256 * 1024 || file.bytes.includes(0)) return { message: '此文件较大或为二进制文件，请在站点目录中查看。' }
    try { return { text: new TextDecoder('utf-8', { fatal: true }).decode(file.bytes) } }
    catch { return { message: '此文件不是 UTF-8 文本，请在站点目录中查看。' } }
  }
  bindPages(root: string, expectedSha: string, targetId: number, branch: string, accountId: string, project: string): ReleaseRecord {
    if (this.busy) throw new Error('已有发布操作正在进行。')
    root = this.assertRoot(root)
    const record = readRelease(root)
    if (!record.target || record.target.id !== targetId || record.target.branch !== branch || record.pending || !record.commitSha || record.commitSha !== expectedSha) throw new Error('发布版本已变化，请刷新后重试。')
    record.cloudflare = { accountId, project }
    delete record.pendingPages
    saveRelease(root, record)
    return record
  }
  beginPages(root: string, expectedSha: string, targetId: number, branch: string, accountId: string, project: string): ReleaseRecord {
    if (this.busy) throw new Error('已有发布操作正在进行。')
    root = this.assertRoot(root)
    const record = readRelease(root)
    if (!record.target || record.target.id !== targetId || record.target.branch !== branch || record.pending || record.pendingPages || record.commitSha !== expectedSha) throw new Error('发布版本已变化或项目创建结果待确认，请刷新后重试。')
    record.pendingPages = { accountId, project, commitSha: expectedSha }
    saveRelease(root, record)
    return record
  }
  clearPendingPages(root: string): ReleaseRecord {
    if (this.busy) throw new Error('已有发布操作正在进行。')
    root = this.assertRoot(root)
    const record = readRelease(root)
    delete record.pendingPages
    saveRelease(root, record)
    return record
  }
  noteOnline(root: string, expectedSha: string, accountId: string, project: string, deploymentId: string, url: string): void {
    if (this.busy) return
    root = this.assertRoot(root)
    const record = readRelease(root)
    if (!record.target || record.commitSha !== expectedSha || record.cloudflare?.accountId !== accountId || record.cloudflare.project !== project) return
    if (record.lastOnline?.deploymentId === deploymentId && record.lastOnline.commitSha === expectedSha && record.lastOnline.project === project && record.lastOnline.accountId === accountId) return
    record.lastOnline = { target: record.target, commitSha: expectedSha, accountId, project, deploymentId, url, confirmedAt: new Date().toISOString() }
    saveRelease(root, record)
  }
}
