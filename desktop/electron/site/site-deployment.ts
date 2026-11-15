import path from 'node:path'
import type { GithubRepositories } from '../github/github-repositories'
import type { CloudflarePages, PagesProject } from '../cloudflare/cloudflare-pages'
import { readRelease, type ReleaseRecord, type SitePublish } from './site-publish'

export class SiteDeployment {
  private active = false
  private readonly github: GithubRepositories
  private readonly pages: CloudflarePages
  private readonly publisher: SitePublish
  private readonly currentRoot: () => string
  private readonly verify: (record: ReleaseRecord, project: PagesProject, root: string) => void
  constructor(github: GithubRepositories, pages: CloudflarePages, publisher: SitePublish, currentRoot: () => string, verify: (record: ReleaseRecord, project: PagesProject, root: string) => void) { this.github = github; this.pages = pages; this.publisher = publisher; this.currentRoot = currentRoot; this.verify = verify }
  isActive(): boolean { return this.active }
  async start(root: string): Promise<ReleaseRecord> {
    if (this.active) throw new Error('构建请求正在进行，请稍候。')
    this.active = true
    const assertRoot = () => {
      const same = (value: string) => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value)
      if (same(root) !== same(this.currentRoot())) throw new Error('工作区已变化，请重新检查。')
    }
    try {
      assertRoot()
      const record = readRelease(root)
      if (!record.cloudflare || !record.target || !record.commitSha || record.pending || record.pendingPages || record.pendingDeployment) throw new Error('请先确认发布目标及之前的构建请求状态。')
      const { accountId, project } = record.cloudflare
      const config = await this.pages.project(accountId, project); assertRoot(); this.verify(record, config.project, root)
      const status = await this.pages.status(accountId, project, record.target.branch, record.commitSha); assertRoot()
      if (status.state === 'building' || status.state === 'success') return readRelease(root)
      if (status.state !== 'waiting' && status.state !== 'failed' && status.state !== 'skipped') throw new Error('现有部署状态尚不明确，请先到 Cloudflare 检查。')
      const current = await this.github.tree(record.target.id, record.target.branch); assertRoot()
      if (current.head !== record.commitSha || current.repository.fullName !== record.target.fullName) throw new Error('GitHub 分支已变化，请重新检查并发布，避免构建错误的版本。')
      this.verify(readRelease(root), config.project, root)
      this.publisher.beginDeployment(root, record.commitSha, record.target.id, record.target.branch, accountId, project)
      const deployment = await this.pages.createDeployment(accountId, project, record.target.branch)
      // A response is recorded even if the branch changed while Cloudflare was starting.
      this.publisher.noteDeployment(root, record.commitSha, accountId, project, deployment.id)
      if (deployment.branch && deployment.branch !== record.target.branch || deployment.commitSha && deployment.commitSha !== record.commitSha) throw new Error('Cloudflare 返回的部署版本与 FTCS 不一致，请到 Cloudflare 核对。')
      return readRelease(root)
    } finally { this.active = false }
  }
}
