import type { SiteRuntimeSnapshot } from './site-runtime'
import type { PublishPreview, ReleaseRecord } from './site-publish'

type Dependencies = {
  snapshot: (root: string) => SiteRuntimeSnapshot
  startPreview: (root: string) => string
  stopPreview: (root: string, id: string) => Promise<void>
  build: (root: string) => string
  openPreview: (root: string, id: string, stillActive: () => boolean) => Promise<void>
  release: (root: string) => ReleaseRecord
  connections: () => Promise<{ github: boolean; cloudflare: boolean }>
  prepare: (root: string, id: number, branch: string) => Promise<PublishPreview>
  commit: (root: string, id: string) => Promise<ReleaseRecord>
  notify: (root: string, running: boolean) => void
  domains?: (name: string, root: string, args: Record<string, unknown>, stillActive: () => boolean) => Promise<unknown>
}
const busy = (state: string) => ['starting', 'running', 'address_pending', 'stopping'].includes(state)
const describe = (snapshot: SiteRuntimeSnapshot) => ({
  dependencies: snapshot.dependencies,
  outputDir: snapshot.outputDir,
  preview: { ...snapshot.preview, log: snapshot.preview.log.slice(-4000) },
  build: { ...snapshot.build, log: snapshot.build.log.slice(-4000) },
})

export class SiteAgentActions {
  private publishing: string | null = null
  private readonly deps: Dependencies
  constructor(deps: Dependencies) { this.deps = deps }
  isPublishing(root: string): boolean { return this.publishing === root }
  async execute(name: string, root: string, stillActive: () => boolean, args: Record<string, unknown> = {}): Promise<unknown> {
    const check = () => { if (!stillActive()) throw new Error('当前站点会话已结束或工作区已变化。') }
    check()
    if (['site_domains_list', 'site_domain_check', 'site_domain_add', 'site_domain_delete'].includes(name)) {
      if (!this.deps.domains) throw new Error('域名管理不可用。')
      return this.deps.domains(name, root, args, stillActive)
    }
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
    if (name === 'site_stop_preview') {
      if (['starting', 'running', 'address_pending'].includes(state.preview.state)) {
        await this.deps.stopPreview(root, state.preview.id)
        check()
      }
      const current = this.deps.snapshot(root)
      const message = current.preview.state === 'stopping' ? '正在停止预览服务；请查询实际状态。'
        : busy(current.preview.state) ? '预览服务仍在运行或停止未确认；请检查状态后重试。'
          : '预览服务未运行。'
      return { ...describe(current), message }
    }
    if (name === 'site_build') {
      if (!busy(state.build.state)) this.deps.build(root)
      return { ...describe(this.deps.snapshot(root)), message: '构建检查已请求启动；请查询实际状态，不要提前报告成功。' }
    }
    if (name === 'site_publish') {
      const connected = await this.deps.connections()
      check()
      if (!connected.github || !connected.cloudflare) throw new Error('发布前请先在独立站页面连接 GitHub 和 Cloudflare。')
      const record = this.deps.release(root)
      if (!record.target || !record.commitSha) throw new Error('尚无已确认的发布目标，请先在独立站页面选择仓库和分支。')
      if (this.publishing) throw new Error('已有智能体发布操作正在进行。')
      this.publishing = root
      this.deps.notify(root, true)
      try {
        const preview = await this.deps.prepare(root, record.target.id, record.target.branch)
        check()
        let result: ReleaseRecord
        try { result = await this.deps.commit(root, preview.id) }
        catch (error) {
          const message = error instanceof Error ? error.message : '提交失败。'
          throw new Error(`${message} 请先检查独立站页面发布记录中的提交状态。`)
        }
        const message = preview.noChanges ? '站点源码没有变化，已确认当前发布版本。' : '已推送到 GitHub。'
        return { message: `${message}${result.cloudflare ? ' Cloudflare 部署结果请在独立站页面查看。' : ' 请在独立站页面关联 Cloudflare Pages。'}`, target: result.target?.fullName, branch: result.target?.branch, commitSha: result.commitSha, noChanges: preview.noChanges, cloudflareProject: result.cloudflare?.project, cloudflareLinked: !!result.cloudflare }
      } finally {
        this.publishing = null
        this.deps.notify(root, false)
      }
    }
    throw new Error('未知站点操作。')
  }
}
