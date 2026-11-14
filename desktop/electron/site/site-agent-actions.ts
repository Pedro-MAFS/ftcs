import type { SiteRuntimeSnapshot } from './site-runtime'
import type { PublishPreview, ReleaseRecord } from './site-publish'

type Dependencies = {
  snapshot: (root: string) => SiteRuntimeSnapshot
  startPreview: (root: string) => string
  build: (root: string) => string
  openPreview: (root: string, id: string, stillActive: () => boolean) => Promise<void>
  release: (root: string) => ReleaseRecord
  connections: () => Promise<{ github: boolean; cloudflare: boolean }>
  prepare: (root: string, id: number, branch: string) => Promise<PublishPreview>
  notify: (root: string, preview: PublishPreview) => void
}
const busy = (state: string) => ['starting', 'running', 'address_pending', 'stopping'].includes(state)
const describe = (snapshot: SiteRuntimeSnapshot) => ({
  dependencies: snapshot.dependencies,
  outputDir: snapshot.outputDir,
  preview: { ...snapshot.preview, log: snapshot.preview.log.slice(-4000) },
  build: { ...snapshot.build, log: snapshot.build.log.slice(-4000) },
})

/** A model may prepare a release, but only the page can confirm and commit it. */
export class SiteAgentActions {
  private pending: { root: string; preview: PublishPreview } | null = null
  private readonly deps: Dependencies
  constructor(deps: Dependencies) { this.deps = deps }
  getPending(root: string): PublishPreview | null { return this.pending?.root === root ? this.pending.preview : null }
  clear(root: string): void { if (this.pending?.root === root) this.pending = null }
  reset(): void { this.pending = null }
  async execute(name: string, root: string, stillActive: () => boolean): Promise<unknown> {
    const check = () => { if (!stillActive()) throw new Error('当前站点会话已结束或工作区已变化。') }
    check()
    const state = this.deps.snapshot(root)
    if (name === 'site_status') {
      const release = this.deps.release(root)
      return { ...describe(state), release: { target: release.target?.fullName, branch: release.target?.branch, commitSha: release.commitSha, cloudflareProject: release.cloudflare?.project, pending: !!release.pending, pendingDeployment: !!release.pendingDeployment, message: '云端部署是否完成以独立站页面的 Cloudflare 状态为准。' } }
    }
    if (name === 'site_preview') {
      if (!busy(state.preview.state)) this.deps.startPreview(root)
      return { ...describe(this.deps.snapshot(root)), message: '预览服务已请求启动；请查询实际状态，运行中可打开预览。' }
    }
    if (name === 'site_open_preview') {
      if (state.preview.state !== 'running' || !state.preview.url) throw new Error('预览尚未确认运行，请先启动并查询状态；地址待核对时请在独立站页面处理。')
      await this.deps.openPreview(root, state.preview.id, stillActive)
      return { message: '已在 FTCS 内置浏览器打开预览。', url: state.preview.url }
    }
    if (name === 'site_build') {
      if (!busy(state.build.state)) this.deps.build(root)
      return { ...describe(this.deps.snapshot(root)), message: '构建检查已请求启动；请查询实际状态，不要提前报告成功。' }
    }
    if (name === 'site_publish_prepare') {
      const connected = await this.deps.connections()
      check()
      if (!connected.github || !connected.cloudflare) throw new Error('发布前请先在独立站页面连接 GitHub 和 Cloudflare。')
      const record = this.deps.release(root)
      if (!record.target || !record.commitSha) throw new Error('尚无已确认的发布目标，请先在独立站页面选择仓库和分支。')
      this.clear(root)
      const preview = await this.deps.prepare(root, record.target.id, record.target.branch)
      check()
      this.pending = { root, preview }
      this.deps.notify(root, preview)
      return { message: '发布快照已准备，尚未推送。请在独立站页面核对并确认。', target: preview.target.fullName, branch: preview.target.branch, hash: preview.hash, files: preview.files.length, deleted: preview.deleted.length, noChanges: preview.noChanges }
    }
    throw new Error('未知站点操作。')
  }
}
