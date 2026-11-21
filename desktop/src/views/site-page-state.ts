import type { SiteResult } from '../types/electron'

type SiteApi = Pick<NonNullable<Window['ftcs']>, 'getSite' | 'getGithubState' | 'getCloudflareState' | 'getSiteRelease' | 'getSiteRuntime' | 'getSiteSource' | 'getAgentSiteRelease' | 'getSitePagesStatus' | 'listSiteDomains'>

async function query<T>(label: string, read: () => Promise<T>): Promise<T> {
  try {
    return await read()
  } catch (error) {
    throw new Error(`${label}读取失败${error instanceof Error ? '：' + error.message : '。'}`)
  }
}

function unwrap<T>(result: SiteResult<T>): T {
  if (!result.ok) throw new Error(result.message)
  return result.value
}

function connection<T extends { checkFailed?: boolean; message?: string }>(state: T): T {
  if (state.checkFailed) throw new Error(state.message || '无法确认连接状态。')
  return state
}

export async function readSitePage(api: SiteApi) {
  const [github, cloudflare, local] = await Promise.all([
    query('GitHub 连接状态', async () => connection(await api.getGithubState())),
    query('Cloudflare 连接状态', async () => connection(await api.getCloudflareState())),
    query('本地站点', async () => {
      const site = await api.getSite()
      if (site.status === 'error') throw new Error(site.message)
      const root = site.workspaceRoot
      const [runtime, source, release] = await Promise.all([
        api.getSiteRuntime(root), api.getSiteSource(root),
        api.getSiteRelease(root).then(unwrap),
      ])
      return { site, runtime, source, release }
    }),
  ])
  const binding = local.release.cloudflare
  const linked = !!(binding && local.release.target && local.release.commitSha && cloudflare.connected && binding.accountId === cloudflare.accountId)
  const root = local.site.workspaceRoot
  const [deployment, domains] = linked ? await Promise.all([
    query('Cloudflare 部署状态', () => api.getSitePagesStatus(root).then(unwrap)),
    query('Cloudflare 域名', () => api.listSiteDomains(root).then(unwrap)),
  ]) : [null, null]
  // Checking a deployment can update the persisted release record.
  if (deployment?.deploymentId) local.release = await query('发布记录', () => api.getSiteRelease(root).then(unwrap))
  if (domains && (domains.project !== local.release.cloudflare?.project || domains.accountId !== local.release.cloudflare?.accountId)) {
    throw new Error('Cloudflare 项目已变化，请重新加载。')
  }
  // The main process checks the workspace root again after the remote requests.
  const agentRunning = await query('工作区发布状态', () => api.getAgentSiteRelease(root))
  return { ...local, github, cloudflare, deployment, domains, agentRunning }
}
