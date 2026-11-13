import fs from 'node:fs'
import path from 'node:path'
import { getSiteOutput, getSiteSnapshot } from './site-project'
import { collectSiteSnapshot } from './site-publish-snapshot'
import { readRelease } from './site-publish'

export type SiteSourceSnapshot = { workspaceRoot: string; sequence: number; state: 'not_ready' | 'unpublished' | 'clean' | 'changed' | 'unknown'; hash?: string; message: string; watching: boolean }

/** Watch notifications only trigger a fresh comparison; they never establish file state. */
export class SiteSourceTracker {
  private root = ''
  private watcher: fs.FSWatcher | null = null
  private parentWatcher: fs.FSWatcher | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private sequence = 0
  private watchGeneration = 0
  private watchError = ''
  private readonly currentRoot: () => string
  private readonly publish: (snapshot: SiteSourceSnapshot) => void
  private readonly onChange: (root: string) => void
  constructor(currentRoot: () => string, publish: (snapshot: SiteSourceSnapshot) => void, onChange: (root: string) => void = () => {}) { this.currentRoot = currentRoot; this.publish = publish; this.onChange = onChange }
  private closeWatcher(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    if (this.watcher) { this.watcher.close(); this.watcher = null; this.watchGeneration++ }
    this.parentWatcher?.close(); this.parentWatcher = null
  }
  close(): void { this.closeWatcher(); this.root = ''; this.watchError = '' }
  watchToken(root: string): number | null { return this.watcher && this.sameRoot(root, this.root) ? this.watchGeneration : null }
  private sameRoot(a: string, b: string): boolean {
    const comparable = (value: string) => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value)
    return comparable(a) === comparable(b)
  }
  private ignored(filename: string | Buffer | null, root: string): boolean {
    if (!filename) return false
    const rel = String(filename).replace(/\\/g, '/').replace(/^\.\//, '')
    if (rel.split('/').some(part => ['node_modules', '.git', '.ftcs'].includes(part.toLowerCase()))) return true
    const output = getSiteOutput(root)?.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '')
    return !!output && (rel === output || rel.startsWith(`${output}/`))
  }
  private watch(root: string, project: string, retry: boolean): void {
    if (this.watcher) return
    if (this.watchError && !retry) return
    try {
      const watcher = fs.watch(project, { recursive: true }, (_event, filename) => {
        if (this.root !== root || !this.sameRoot(root, this.currentRoot())) return
        try { if (this.ignored(filename, root)) return } catch { /* Recheck state on errors. */ }
        this.onChange(root)
        if (this.timer) clearTimeout(this.timer)
        this.timer = setTimeout(() => { this.timer = null; if (this.root === root && this.sameRoot(root, this.currentRoot())) this.emit(root) }, 350)
      })
      this.watcher = watcher; this.watchGeneration++; this.watchError = ''
      const parent = fs.watch(root, (_event, filename) => {
        if (filename && String(filename).toLowerCase() !== 'website') return
        if (this.root !== root || !this.sameRoot(root, this.currentRoot())) return
        this.onChange(root)
        this.closeWatcher()
        this.timer = setTimeout(() => { this.timer = null; if (this.root === root && this.sameRoot(root, this.currentRoot())) this.emit(root, true) }, 350)
      })
      this.parentWatcher = parent
      parent.on('error', () => { if (this.parentWatcher !== parent) return; this.closeWatcher(); this.watchError = '站点文件监听不可用，可手动刷新检查。'; this.emit(root) })
      watcher.on('error', () => {
        if (this.watcher !== watcher) return
        this.closeWatcher(); this.watchError = '站点文件监听不可用，可手动刷新检查。'
        if (this.root === root && this.sameRoot(root, this.currentRoot())) this.emit(root)
      })
    } catch { this.closeWatcher(); this.watchError = '站点文件监听不可用，可手动刷新检查。' }
  }
  snapshot(root: string, retryWatcher = true): SiteSourceSnapshot {
    root = path.resolve(root)
    if (!this.sameRoot(root, this.currentRoot())) throw new Error('当前工作区已改变，请刷新后重试。')
    if (!this.root || !this.sameRoot(root, this.root)) { this.close(); this.root = root }
    const site = getSiteSnapshot(root)
    if (site.status !== 'ready') { this.closeWatcher(); return { workspaceRoot: root, sequence: ++this.sequence, state: 'not_ready', message: '站点尚未就绪。', watching: false } }
    this.watch(root, site.projectPath, retryWatcher)
    try {
      const output = getSiteOutput(root)
      if (!output) throw new Error('请先设置静态产物目录。')
      const hash = collectSiteSnapshot(site.projectPath, output).hash
      const release = readRelease(root)
      if (!this.watcher) return { workspaceRoot: root, sequence: ++this.sequence, state: 'unknown', hash, message: this.watchError || '站点文件监听不可用，可手动刷新检查。', watching: false }
      if (!release.commitSha) return { workspaceRoot: root, sequence: ++this.sequence, state: 'unpublished', hash, message: '尚未发布。', watching: !!this.watcher }
      if (!release.snapshotHash) return { workspaceRoot: root, sequence: ++this.sequence, state: 'unknown', hash, message: '缺少上次推送的源码摘要，请重新检查并发布。', watching: !!this.watcher }
      const state = hash === release.snapshotHash ? 'clean' : 'changed'
      return { workspaceRoot: root, sequence: ++this.sequence, state, hash, message: state === 'clean' ? '本地与上次推送一致。' : '本地有未发布修改。', watching: !!this.watcher }
    } catch (error) { return { workspaceRoot: root, sequence: ++this.sequence, state: 'unknown', message: error instanceof Error ? error.message : '无法检查站点源码。', watching: !!this.watcher } }
  }
  private emit(root: string, retryWatcher = false): void {
    try { this.publish(this.snapshot(root, retryWatcher)) } catch { /* workspace changed or renderer unavailable */ }
  }
}
