type Credentials = { accessToken: string; accountId: string }
type CloudflareResponse<T> = { success?: boolean; result?: T; result_info?: { total_pages?: number }; errors?: Array<{ code?: unknown; message?: unknown }> }
type Deployment = { id?: string; environment?: string; url?: string; latest_stage?: { name?: string; status?: string }; deployment_trigger?: { metadata?: { commit_hash?: string; branch?: string } } }
type Project = { name?: string; subdomain?: string; production_branch?: string; source?: { type?: string; config?: { owner?: string; repo_name?: string; repo_id?: string | number; production_branch?: string; production_deployments_enabled?: boolean } }; build_config?: { build_command?: string; destination_dir?: string; root_dir?: string }; canonical_deployment?: Deployment }
export type PagesProject = { name: string; subdomain: string; owner: string; repo: string; repoId: string; branch: string; buildCommand: string; output: string; rootDir: string; autoDeploy: boolean | null; type: string }
export type PagesStatus = { state: 'waiting' | 'building' | 'success' | 'failed' | 'unknown'; message: string; deploymentId?: string; deploymentUrl?: string; productionUrl?: string; productionCurrent?: boolean }

export function verifyPagesProject(project: PagesProject, expected: { id: number; owner: string; name: string; branch: string; output: string }): void {
  if (project.type !== 'github' || project.owner.toLowerCase() !== expected.owner.toLowerCase() || project.repo.toLowerCase() !== expected.name.toLowerCase() || project.repoId && project.repoId !== String(expected.id)) throw new Error('Cloudflare 项目关联的 GitHub 仓库不匹配，请在控制台调整或选择其他项目。')
  if (project.branch !== expected.branch) throw new Error('Cloudflare 生产分支与 GitHub 发布分支不一致。')
  const normalize = (value: string) => value.replace(/^\.\//, '').replace(/\/$/, '')
  if (project.buildCommand !== 'npm run build' || normalize(project.output) !== normalize(expected.output) || !['', '/', '.'].includes(project.rootDir)) throw new Error('Cloudflare 构建命令、目录或根目录与站点配置不一致，请先在控制台调整。')
  if (project.autoDeploy === false) throw new Error('Cloudflare 项目的生产分支自动部署已关闭，请先在控制台开启。')
}

export class CloudflarePages {
  private readonly credentials: () => Promise<Credentials>
  constructor(credentials: () => Promise<Credentials>) { this.credentials = credentials }
  private async request<T>(accountId: string, suffix: string, init?: RequestInit): Promise<{ result: T; result_info?: { total_pages?: number } }> {
    const credentials = await this.credentials()
    if (credentials.accountId !== accountId) throw new Error('Cloudflare 账号已变化，请重新选择项目。')
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/pages${suffix}`, { ...init, headers: { Authorization: `Bearer ${credentials.accessToken}`, Accept: 'application/json', ...(init?.body ? { 'Content-Type': 'application/json' } : {}) }, signal: AbortSignal.timeout(15000), redirect: 'error' })
    let data: CloudflareResponse<T> | undefined
    try { data = await response.json() as CloudflareResponse<T> } catch { /* Some error responses are not JSON. */ }
    if (!response.ok || data?.success === false) {
      const details = Array.isArray(data?.errors) ? data.errors.slice(0, 3).map(error => {
        const code = typeof error?.code === 'number' && Number.isSafeInteger(error.code) ? `代码 ${error.code}` : ''
        const message = typeof error?.message === 'string' ? error.message.split(credentials.accessToken).join('[已隐藏]').replace(/\bBearer\s+\S+/gi, 'Bearer [已隐藏]').replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, 300).trim() : ''
        return [code, message].filter(Boolean).join('：')
      }).filter(Boolean).join('；') : ''
      const summary = response.status === 401 || response.status === 403 ? 'Cloudflare 授权无效或缺少所需权限' : 'Cloudflare 请求失败'
      throw new Error(`${summary}（HTTP ${response.status}）${details ? `：${details}` : '。'}`)
    }
    if (!data?.success || !data.result) throw new Error('Cloudflare 返回的数据不完整。')
    return { result: data.result, result_info: data.result_info }
  }
  private parse(project: Project): PagesProject {
    const config = project.source?.config
    if (typeof project.name !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(project.name)) throw new Error('Cloudflare 项目信息无效。')
    return { name: project.name, subdomain: project.subdomain || '', owner: config?.owner || '', repo: config?.repo_name || '', repoId: config?.repo_id ? String(config.repo_id) : '', branch: project.production_branch || config?.production_branch || '', buildCommand: project.build_config?.build_command || '', output: project.build_config?.destination_dir || '', rootDir: project.build_config?.root_dir || '', autoDeploy: config?.production_deployments_enabled ?? null, type: project.source?.type || '' }
  }
  async list(accountId: string): Promise<PagesProject[]> {
    const result: PagesProject[] = []
    for (let page = 1; page <= 100; page++) {
      const data = await this.request<Project[]>(accountId, `/projects?per_page=100&page=${page}`)
      if (!Array.isArray(data.result)) throw new Error('Cloudflare 项目列表无效。')
      result.push(...data.result.map(project => this.parse(project)))
      const total = data.result_info?.total_pages
      if (typeof total === 'number' ? page >= total : data.result.length < 100) return result
    }
    throw new Error('Cloudflare 项目过多，无法完整读取。')
  }
  async project(accountId: string, name: string): Promise<{ project: PagesProject; raw: Project }> {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) throw new Error('Cloudflare 项目名称无效。')
    const data = await this.request<Project>(accountId, `/projects/${encodeURIComponent(name)}`)
    return { project: this.parse(data.result), raw: data.result }
  }
  async create(accountId: string, name: string, repo: { id: number; owner: string; name: string; branch: string }, output: string, nodeVersion: string): Promise<PagesProject> {
    if (!/^[a-z0-9][a-z0-9-]{0,57}$/.test(name) || !/^(?:22|24|26)$/.test(nodeVersion)) throw new Error('项目名只能包含小写字母、数字和横线；Node 版本请选择 22、24 或 26。')
    const body = { name, production_branch: repo.branch, build_config: { build_command: 'npm run build', destination_dir: output, root_dir: '' }, source: { type: 'github', config: { owner: repo.owner, repo_name: repo.name, repo_id: String(repo.id), production_branch: repo.branch, production_deployments_enabled: true } }, deployment_configs: { production: { env_vars: { NODE_VERSION: { type: 'plain_text', value: nodeVersion } } }, preview: { env_vars: { NODE_VERSION: { type: 'plain_text', value: nodeVersion } } } } }
    const data = await this.request<Project>(accountId, '/projects', { method: 'POST', body: JSON.stringify(body) })
    return this.parse(data.result)
  }
  async status(accountId: string, name: string, branch: string, sha: string): Promise<PagesStatus> {
    const { project, raw } = await this.project(accountId, name)
    const matches: Deployment[] = []
    for (let page = 1; page <= 20; page++) {
      const data = await this.request<Deployment[]>(accountId, `/projects/${encodeURIComponent(name)}/deployments?per_page=100&page=${page}`)
      if (!Array.isArray(data.result)) throw new Error('Cloudflare 部署列表无效。')
      matches.push(...data.result.filter(item => item.environment === 'production' && item.deployment_trigger?.metadata?.commit_hash === sha && item.deployment_trigger.metadata.branch === branch))
      const total = data.result_info?.total_pages
      if (matches.length || (typeof total === 'number' ? page >= total : data.result.length < 100)) break
      if (page === 20) throw new Error('Cloudflare 部署记录过多，请到控制台查看。')
    }
    const latest = matches[0]
    if (!latest) return { state: 'waiting', message: '已推送，等待 Cloudflare 创建此版本的生产部署。' }
    const status = latest.latest_stage?.status
    const stage = latest.latest_stage?.name
    const state = status === 'success' && stage === 'deploy' ? 'success' : status === 'failure' || status === 'canceled' ? 'failed' : status === 'active' || status === 'idle' || status === 'success' && !!stage ? 'building' : 'unknown'
    const canonical = raw.canonical_deployment?.id
    const productionCurrent = canonical && latest.id ? canonical === latest.id : undefined
    const productionUrl = /^[a-z0-9.-]+\.pages\.dev$/i.test(project.subdomain) ? `https://${project.subdomain}` : undefined
    return { state, message: state === 'success' ? (productionCurrent === true ? '该版本已部署，并且是当前线上版本。' : productionCurrent === false ? '该版本部署成功，但不是当前线上版本。' : '该版本部署成功，当前线上版本待确认。') : state === 'building' ? 'Cloudflare 正在构建或部署。' : state === 'failed' ? 'Cloudflare 构建或部署失败，请在控制台查看日志。' : 'Cloudflare 部署状态待确认。', deploymentId: latest.id, deploymentUrl: latest.url, productionUrl, productionCurrent }
  }
}
