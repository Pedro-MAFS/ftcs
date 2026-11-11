import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import type { ChildProcess } from 'node:child_process'
import { getSiteOutput, getSiteSnapshot, resolveSiteOutput, setSiteOutput } from './site-project'
import { localPreviewUrl, ownsPort, reservePort, resolveSiteNode, responds, spawnNpm, stopProcess, type NodeRuntime } from './site-process'

export type RunKind = 'install' | 'preview' | 'build'
export type RunState = 'idle' | 'starting' | 'running' | 'address_pending' | 'stopping' | 'succeeded' | 'failed' | 'cancelled'
export interface SiteRun { id: string; state: RunState; message: string; log: string; url?: string; startedAt?: string; finishedAt?: string; node?: string; output?: string }
export interface SiteRuntimeSnapshot { workspaceRoot: string; sequence: number; outputDir: string | null; dependencies: 'missing' | 'unknown' | 'not_required'; install: SiteRun; preview: SiteRun; build: SiteRun }
type Active = { id: string; child?: ChildProcess; cancelled: boolean; poll?: ReturnType<typeof setInterval>; guard?: ReturnType<typeof setInterval>; timeout?: ReturnType<typeof setTimeout>; checking?: boolean; port?: number; candidate?: string }

const emptyRun = (): SiteRun => ({ id: '', state: 'idle', message: '', log: '' })
function cleanLog(value: string): string { return value.replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '').replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '') }

export class SiteRuntime {
  private root = ''
  private sequence = 0
  private runs: Record<RunKind, SiteRun> = { install: emptyRun(), preview: emptyRun(), build: emptyRun() }
  private active: Partial<Record<RunKind, Active>> = {}
  private installFingerprint = ''
  private configuredNode: () => { exe: string; source: string } | null
  private currentRoot: () => string
  private publish: (snapshot: SiteRuntimeSnapshot) => void
  constructor(configuredNode: () => { exe: string; source: string } | null, currentRoot: () => string, publish: (snapshot: SiteRuntimeSnapshot) => void) {
    this.configuredNode = configuredNode
    this.currentRoot = currentRoot
    this.publish = publish
  }

  private assertRoot(root: string) {
    const normalized = path.resolve(root)
    const same = (a: string, b: string) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b
    if (!same(normalized, path.resolve(this.currentRoot()))) throw new Error('当前工作区已改变，请刷新后重试。')
    if (this.root && !same(this.root, normalized) && Object.values(this.active).some(Boolean)) throw new Error('其他工作区仍有站点操作运行，请先停止。')
    if (!this.root || !same(this.root, normalized)) {
      this.root = normalized
      this.runs = { install: emptyRun(), preview: emptyRun(), build: emptyRun() }
      this.installFingerprint = ''
    }
    return normalized
  }
  private project(root: string) {
    const site = getSiteSnapshot(root)
    if (site.status !== 'ready') throw new Error('站点尚未就绪，请先创建或修复站点。')
    return site.projectPath
  }
  private dependencies(project: string): SiteRuntimeSnapshot['dependencies'] {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(project, 'package.json'), 'utf8'))
      if (!Object.keys(pkg.dependencies || {}).length && !Object.keys(pkg.devDependencies || {}).length && !Object.keys(pkg.optionalDependencies || {}).length) return 'not_required'
      return fs.existsSync(path.join(project, 'node_modules')) ? 'unknown' : 'missing'
    } catch { return 'unknown' }
  }
  private dependencyFingerprint(root: string): string {
    try {
      const project = path.join(root, 'website')
      const hash = createHash('sha256')
      for (const name of ['package.json', 'package-lock.json', 'npm-shrinkwrap.json']) {
        try { hash.update(fs.readFileSync(path.join(project, name))) } catch { hash.update(`missing:${name}`) }
      }
      fs.statSync(path.join(project, 'node_modules'))
      try { hash.update(fs.readFileSync(path.join(project, 'node_modules', '.package-lock.json'))) } catch { hash.update('no-installed-lock') }
      const node = this.configuredNode()?.exe || ''
      hash.update(node)
      try { hash.update(String(fs.statSync(node).mtimeMs)) } catch { hash.update('missing-node') }
      return hash.digest('hex')
    } catch { return '' }
  }
  snapshot(root: string): SiteRuntimeSnapshot {
    root = this.assertRoot(root)
    const site = getSiteSnapshot(root)
    let outputDir: string | null = null
    try { outputDir = getSiteOutput(root) } catch { /* site is unavailable */ }
    const install = { ...this.runs.install }
    if (install.state === 'succeeded' && this.installFingerprint !== this.dependencyFingerprint(root)) {
      install.state = 'idle'; install.message = '项目依赖或运行环境已变化，状态待验证。'
    }
    return { workspaceRoot: root, sequence: this.sequence, outputDir, dependencies: site.status === 'ready' ? this.dependencies(site.projectPath) : 'unknown', install, preview: { ...this.runs.preview }, build: { ...this.runs.build } }
  }
  private emit() { this.sequence++; try { this.publish(this.snapshot(this.root)) } catch { /* window or workspace changed */ } }
  private newRun(kind: RunKind, message: string): Active {
    if (this.active[kind]) throw new Error('该操作正在进行中。')
    const run: Active = { id: randomUUID(), cancelled: false }
    this.active[kind] = run
    this.runs[kind] = { id: run.id, state: 'starting', message, log: '', startedAt: new Date().toISOString() }
    const root = this.root
    run.guard = setInterval(() => {
      if (run.cancelled || this.active[kind] !== run) return
      try { this.assertCurrent(root, run) } catch {
        run.cancelled = true
        this.update(kind, run, { state: 'stopping', message: '工作区或站点不可用，正在停止操作。' })
        if (run.child) void stopProcess(run.child).then(ok => { if (!ok) this.update(kind, run, { state: 'running', message: '停止未确认，请检查并重试。' }) })
      }
    }, 1500)
    this.emit()
    return run
  }
  private update(kind: RunKind, run: Active, patch: Partial<SiteRun>) {
    if (this.active[kind] !== run) return
    Object.assign(this.runs[kind], patch); this.emit()
  }
  private log(kind: RunKind, run: Active, text: string) {
    if (this.active[kind] !== run) return
    const current = this.runs[kind].log + cleanLog(text)
    this.runs[kind].log = current.length > 100_000 ? `…日志已截断…\n${current.slice(-95_000)}` : current
    this.emit()
  }
  private end(kind: RunKind, run: Active, state: RunState, message: string, extra: Partial<SiteRun> = {}) {
    if (this.active[kind] !== run) return
    if (run.poll) clearInterval(run.poll)
    if (run.guard) clearInterval(run.guard)
    if (run.timeout) clearTimeout(run.timeout)
    Object.assign(this.runs[kind], { state, message, finishedAt: new Date().toISOString(), ...extra })
    delete this.active[kind]
    this.emit()
  }
  private assertCurrent(root: string, run: Active) {
    if (run.cancelled) throw new Error('操作已取消。')
    this.assertRoot(root)
    this.project(root)
  }
  private async runtime(root: string, run: Active, kind: RunKind): Promise<NodeRuntime> {
    this.assertCurrent(root, run)
    const runtime = await resolveSiteNode(this.configuredNode(), this.project(root))
    this.assertCurrent(root, run)
    this.update(kind, run, { node: `${runtime.version} · npm ${runtime.npmVersion} · ${runtime.source}` })
    return runtime
  }
  private launch(kind: RunKind, run: Active, runtime: NodeRuntime, project: string, args: string[]): Promise<number> {
    this.log(kind, run, `> npm ${args.join(' ')}\n> 工作目录: ${project}\n`)
    const child = spawnNpm(runtime, project, args); run.child = child
    for (const stream of [child.stdout, child.stderr]) stream?.on('data', chunk => {
      const text = String(chunk); this.log(kind, run, text)
      if (kind === 'preview') {
        for (const match of cleanLog(text).matchAll(/https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]):\d+(?:\/[^\s]*)?/gi)) {
          const url = localPreviewUrl(match[0]); if (url) { run.candidate = url; void this.checkPreview(run) }
        }
      }
    })
    return new Promise((resolve, reject) => {
      child.once('error', reject)
      child.once('exit', (code, signal) => resolve(code ?? (signal ? 1 : -1)))
    })
  }
  install(root: string, reinstall: boolean, thenPreview: boolean): string {
    root = this.assertRoot(root); const project = this.project(root)
    if (this.active.preview || this.active.build) throw new Error('请先停止预览或等待构建完成。')
    if (fs.existsSync(path.join(project, 'node_modules')) && !reinstall) throw new Error('项目已有依赖目录，重新安装需要明确确认。')
    const run = this.newRun('install', '正在检查运行环境…')
    void (async () => {
      try {
        const runtime = await this.runtime(root, run, 'install')
        const hasLock = ['package-lock.json', 'npm-shrinkwrap.json'].some(name => fs.existsSync(path.join(project, name)))
        const args = hasLock ? ['ci'] : ['install']
        this.assertCurrent(root, run)
        if (!reinstall && fs.existsSync(path.join(project, 'node_modules'))) throw new Error('项目依赖目录已出现，重新安装需要明确确认。')
        this.update('install', run, { state: 'running', message: '正在安装依赖…' })
        const code = await this.launch('install', run, runtime, project, args)
        if (run.cancelled) { this.end('install', run, 'cancelled', '安装已取消。'); return }
        if (code !== 0) throw new Error(`依赖安装失败（退出码 ${code}）。`)
        this.installFingerprint = this.dependencyFingerprint(root)
        this.end('install', run, 'succeeded', '本次依赖安装成功。')
        if (thenPreview && path.resolve(this.currentRoot()) === root) {
          try { this.startPreview(root) } catch (error) { this.runs.preview = { ...emptyRun(), state: 'failed', message: error instanceof Error ? error.message : String(error) }; this.emit() }
        }
      } catch (error) { this.end('install', run, run.cancelled ? 'cancelled' : 'failed', run.cancelled ? '安装已取消。' : error instanceof Error ? error.message : String(error)) }
    })()
    return run.id
  }
  startPreview(root: string): string {
    root = this.assertRoot(root); const project = this.project(root)
    if (this.active.install) throw new Error('依赖正在安装，请等待完成。')
    if (this.dependencies(project) === 'missing') throw new Error('尚未安装项目依赖，请先安装依赖。')
    const run = this.newRun('preview', '正在检查运行环境…')
    void (async () => {
      try {
        const runtime = await this.runtime(root, run, 'preview')
        const pkg = JSON.parse(fs.readFileSync(path.join(project, 'package.json'), 'utf8'))
        const args = ['run', 'dev']
        if (pkg?.scripts?.dev === 'vite --host 127.0.0.1' && (pkg?.devDependencies?.vite || pkg?.dependencies?.vite)) {
          const port = await reservePort(); this.assertCurrent(root, run)
          run.port = port; run.candidate = `http://127.0.0.1:${port}/`
          args.push('--', '--port', String(port), '--strictPort')
        }
        this.update('preview', run, { message: '正在启动开发服务…' })
        const result = this.launch('preview', run, runtime, project, args)
        run.poll = setInterval(() => void this.checkPreview(run), 1000)
        run.timeout = setTimeout(() => this.update('preview', run, { state: 'address_pending', message: '启动等待超时，请检查日志、填写本地地址或停止服务。' }), 60000)
        const code = await result
        if (run.cancelled) this.end('preview', run, 'cancelled', '预览已停止。', { url: undefined })
        else this.end('preview', run, 'failed', `开发服务已退出（退出码 ${code}）。`, { url: undefined })
      } catch (error) { this.end('preview', run, run.cancelled ? 'cancelled' : 'failed', run.cancelled ? '预览已停止。' : error instanceof Error ? error.message : String(error), { url: undefined }) }
    })()
    return run.id
  }
  private async checkPreview(run: Active) {
    if (this.active.preview !== run || run.checking || run.cancelled || !run.child?.pid || !run.candidate) return
    run.checking = true
    try {
      const url = localPreviewUrl(run.candidate)
      if (!url) return
      const port = Number(new URL(url).port)
      const [up, owned] = await Promise.all([responds(url), ownsPort(run.child.pid, port)])
      if (this.active.preview !== run || run.cancelled) return
      if (up && owned) {
        if (run.timeout) { clearTimeout(run.timeout); run.timeout = undefined }
        if (this.runs.preview.state !== 'running' || this.runs.preview.url !== url) this.update('preview', run, { state: 'running', url, message: '开发服务正在运行。' })
      } else if (up && !owned && this.runs.preview.state !== 'address_pending') {
        this.update('preview', run, { state: 'address_pending', url, message: '地址可访问，但无法确认它属于当前站点。请核对日志后手动打开。' })
      } else if (!up && this.runs.preview.state === 'running') {
        this.update('preview', run, { state: 'address_pending', url, message: '开发服务暂时无法访问，请检查日志。' })
      }
    } finally { run.checking = false }
  }
  setPreviewUrl(root: string, id: string, input: string) {
    this.assertRoot(root); const run = this.active.preview
    if (!run || run.id !== id || run.cancelled) throw new Error('预览状态已变化，请重新检查。')
    const url = localPreviewUrl(input)
    if (!url) throw new Error('请输入带端口的本地 HTTP(S) 地址。')
    run.candidate = url
    this.update('preview', run, { state: 'address_pending', url, message: '正在确认地址归属；无法确认时请自行核对。' })
    void this.checkPreview(run)
  }
  previewUrl(root: string, id: string): string {
    this.assertRoot(root)
    const run = this.active.preview, state = this.runs.preview
    if (!run || run.id !== id || !['running', 'address_pending'].includes(state.state) || !state.url) throw new Error('预览地址不可用，请先启动或确认。')
    return state.url
  }
  setOutput(root: string, relative: string) {
    root = this.assertRoot(root)
    if (this.active.build) throw new Error('构建期间不能修改产物目录。')
    const previous = getSiteOutput(root)
    setSiteOutput(root, relative)
    if (previous !== getSiteOutput(root)) this.runs.build = { ...emptyRun(), message: '产物目录已变更，请重新构建。' }
    this.emit()
  }
  build(root: string): string {
    root = this.assertRoot(root); const project = this.project(root)
    if (this.active.install) throw new Error('依赖正在安装，请等待完成。')
    if (this.dependencies(project) === 'missing') throw new Error('尚未安装项目依赖，请先安装依赖。')
    const output = getSiteOutput(root)
    if (!output) throw new Error('请先设置静态产物目录。')
    resolveSiteOutput(project, output)
    const run = this.newRun('build', '正在检查运行环境…')
    void (async () => {
      try {
        const runtime = await this.runtime(root, run, 'build')
        const index = path.join(resolveSiteOutput(project, output), 'index.html')
        let previous = ''
        try { const s = fs.statSync(index); previous = `${s.size}:${s.mtimeMs}` } catch { /* no previous build */ }
        this.update('build', run, { state: 'running', message: '正在构建…', output })
        const code = await this.launch('build', run, runtime, project, ['run', 'build'])
        if (run.cancelled) { this.end('build', run, 'cancelled', '构建已取消。'); return }
        if (code !== 0) throw new Error(`构建失败（退出码 ${code}）。`)
        this.assertCurrent(root, run)
        const currentOutput = resolveSiteOutput(project, output)
        const stat = fs.lstatSync(path.join(currentOutput, 'index.html'))
        if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('产物目录缺少普通文件 index.html。')
        const unchanged = previous && previous === `${stat.size}:${stat.mtimeMs}`
        this.end('build', run, 'succeeded', unchanged ? '本次构建通过；产物未检测到变化，请检查构建输出。' : '本次构建通过。', { output })
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        this.end('build', run, run.cancelled ? 'cancelled' : 'failed', run.cancelled ? '构建已取消。' : code === 'ENOENT' ? '构建产物目录或 index.html 不存在。' : error instanceof Error ? error.message : String(error))
      }
    })()
    return run.id
  }
  async cancel(root: string, kind: RunKind, id: string): Promise<void> {
    this.assertRoot(root)
    const run = this.active[kind]
    if (!run || run.id !== id) throw new Error('操作状态已变化，请重新检查。')
    run.cancelled = true
    this.update(kind, run, { state: 'stopping', message: kind === 'preview' ? '正在停止预览…' : '正在取消…' })
    if (!run.child) return
    if (!await stopProcess(run.child)) this.update(kind, run, { state: 'running', message: '停止未确认，请检查并重试。' })
  }
  hasActive(): boolean { return Object.values(this.active).some(Boolean) }
  async shutdown(): Promise<boolean> {
    let stopped = true
    await Promise.all(Object.entries(this.active).map(async ([kind, run]) => {
      if (!run) return
      run.cancelled = true
      this.update(kind as RunKind, run, { state: 'stopping', message: '正在停止站点操作…' })
      if (run.poll) clearInterval(run.poll)
      if (run.guard) clearInterval(run.guard)
      if (run.timeout) clearTimeout(run.timeout)
      if (run.child && !await stopProcess(run.child)) {
        stopped = false
        this.update(kind as RunKind, run, { state: 'running', message: '停止未确认，请检查并重试。' })
        console.error(`[site] ${kind} 进程停止未确认`)
      }
    }))
    const deadline = Date.now() + 10000
    while (this.hasActive() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50))
    return stopped && !this.hasActive()
  }
}
