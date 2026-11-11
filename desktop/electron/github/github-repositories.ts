export type GithubRepository = {
  id: number
  owner: string
  name: string
  fullName: string
  private: boolean
  defaultBranch: string
  writeAccess: 'yes' | 'no' | 'unknown'
}
export type GithubBranch = { name: string; protected: boolean }
export type GithubTreeFile = { path: string; sha: string; mode: string }

type Installation = { id: number; permissions?: { contents?: string } }
type ApiRepo = {
  id: number; name: string; full_name: string; private: boolean; default_branch: string
  owner: { login: string }; permissions?: { push?: boolean; admin?: boolean }
}

/** API-only client: caller supplies credentials in the main process. */
export class GithubRepositories {
  private readonly accessToken: () => Promise<string>
  constructor(accessToken: () => Promise<string>) { this.accessToken = accessToken }

  private async request<T>(endpoint: string, init?: RequestInit): Promise<T> {
    const token = await this.accessToken()
    const response = await fetch(`https://api.github.com${endpoint}`, {
      ...init,
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'User-Agent': 'FTCS-Desktop', 'X-GitHub-Api-Version': '2022-11-28', ...(init?.body ? { 'Content-Type': 'application/json' } : {}) },
      signal: AbortSignal.timeout(15000), redirect: 'error',
    })
    if (!response.ok) {
      if (response.status === 401) throw new Error('GitHub 授权已失效，请重新连接。')
      if (response.status === 403) throw new Error('GitHub 拒绝了请求，请检查应用权限、组织策略或请求次数限制。')
      if (response.status === 404) throw new Error('未找到仓库，或 FTCS App 尚未获准访问该仓库。')
      if (response.status === 409) throw new Error('该仓库尚无分支，请先在 GitHub 初始化仓库。')
      if (response.status === 422) throw new Error('GitHub 未接受请求，请检查仓库名称是否可用。')
      throw new Error(`GitHub 请求失败（${response.status}），请稍后重试。`)
    }
    return await response.json() as T
  }

  private async pages<T>(endpoint: string, extract: (value: unknown) => T[]): Promise<T[]> {
    const all: T[] = []
    for (let page = 1; page <= 100; page++) {
      const separator = endpoint.includes('?') ? '&' : '?'
      const value = await this.request<unknown>(`${endpoint}${separator}per_page=100&page=${page}`)
      const items = extract(value)
      if (!Array.isArray(items)) throw new Error('GitHub 返回的数据不完整，请重试。')
      all.push(...items)
      if (items.length < 100) return all
    }
    throw new Error('GitHub 返回的结果过多，无法完整读取，请稍后重试。')
  }

  async list(): Promise<GithubRepository[]> {
    const installations = await this.pages<Installation>('/user/installations', value => (value as { installations: Installation[] }).installations)
    const repos = new Map<number, GithubRepository>()
    for (const installation of installations) {
      if (!Number.isSafeInteger(installation.id) || installation.id <= 0) throw new Error('GitHub 返回的应用安装信息无效。')
      const items = await this.pages<ApiRepo>(`/user/installations/${installation.id}/repositories`, value => (value as { repositories: ApiRepo[] }).repositories)
      for (const repo of items) {
        if (!Number.isSafeInteger(repo.id) || typeof repo.owner?.login !== 'string' || typeof repo.name !== 'string' || typeof repo.full_name !== 'string' || typeof repo.private !== 'boolean') throw new Error('GitHub 返回的仓库信息不完整。')
        const appContents = installation.permissions?.contents
        const push = repo.permissions?.push
        const writeAccess = appContents === undefined || push === undefined ? 'unknown' : appContents === 'write' && push ? 'yes' : 'no'
        repos.set(repo.id, { id: repo.id, owner: repo.owner.login, name: repo.name, fullName: repo.full_name, private: repo.private, defaultBranch: repo.default_branch || '', writeAccess })
      }
    }
    return [...repos.values()].sort((a, b) => a.fullName.localeCompare(b.fullName))
  }

  async branches(repositoryId: number): Promise<GithubBranch[]> {
    if (!Number.isSafeInteger(repositoryId) || repositoryId <= 0) throw new Error('无效的仓库。')
    const repo = (await this.list()).find(item => item.id === repositoryId)
    if (!repo) throw new Error('仓库不可用，请刷新列表并检查 FTCS App 授权范围。')
    const endpoint = `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/branches`
    const items = await this.pages<GithubBranch>(endpoint, value => value as GithubBranch[])
    return items.map(branch => {
      if (typeof branch.name !== 'string' || typeof branch.protected !== 'boolean') throw new Error('GitHub 返回的分支信息不完整。')
      return { name: branch.name, protected: branch.protected }
    })
  }

  async create(name: string, privateRepo: boolean): Promise<{ fullName: string }> {
    if (typeof name !== 'string' || !/^[a-zA-Z0-9._-]{1,100}$/.test(name) || name === '.' || name === '..' || typeof privateRepo !== 'boolean') throw new Error('仓库名称只能包含英文字母、数字、点、横线或下划线。')
    const repo = await this.request<ApiRepo>('/user/repos', { method: 'POST', body: JSON.stringify({ name, private: privateRepo, auto_init: true }) })
    if (typeof repo.full_name !== 'string' || !repo.full_name) throw new Error('仓库创建结果不完整，请到 GitHub 检查后刷新。')
    return { fullName: repo.full_name }
  }

  async tree(repositoryId: number, branch: string): Promise<{ repository: GithubRepository; head: string; files: GithubTreeFile[] }> {
    const repository = (await this.list()).find(item => item.id === repositoryId)
    if (!repository || repository.writeAccess !== 'yes') throw new Error('仓库不可写或授权已变化，请检查 GitHub 权限。')
    if (typeof branch !== 'string' || !branch || branch.length > 255) throw new Error('请选择有效的分支。')
    const base = `/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}`
    const result = await this.request<{ commit?: { sha?: string; commit?: { tree?: { sha?: string } } }; protected?: boolean }>(`${base}/branches/${encodeURIComponent(branch)}`)
    const head = result.commit?.sha
    const treeSha = result.commit?.commit?.tree?.sha
    if (!head || !/^[a-f0-9]{40}$/i.test(head) || !treeSha || !/^[a-f0-9]{40}$/i.test(treeSha)) throw new Error('无法确认 GitHub 分支版本。')
    const tree = await this.request<{ truncated?: boolean; tree?: Array<{ path: string; sha: string; type: string; mode: string }> }>(`${base}/git/trees/${treeSha}?recursive=1`)
    if (tree.truncated || !Array.isArray(tree.tree)) throw new Error('仓库文件过多或返回不完整，无法安全发布。')
    const files: GithubTreeFile[] = []
    for (const item of tree.tree) {
      if (item.type === 'tree') continue
      if (item.type !== 'blob' || !['100644', '100755'].includes(item.mode) || typeof item.path !== 'string' || !/^[a-f0-9]{40}$/i.test(item.sha)) throw new Error(`仓库包含暂不支持的文件：${item.path || '未知路径'}`)
      files.push({ path: item.path, sha: item.sha, mode: item.mode })
    }
    return { repository, head, files }
  }

  async commit(repository: GithubRepository, branch: string, expectedHead: string, additions: Array<{ path: string; contents: string }>, deletions: Array<{ path: string }>): Promise<string> {
    if (!/^[a-f0-9]{40}$/i.test(expectedHead) || !branch) throw new Error('提交基线无效。')
    const query = `mutation($input: CreateCommitOnBranchInput!) { createCommitOnBranch(input: $input) { commit { oid } } }`
    const input = { branch: { repositoryNameWithOwner: repository.fullName, branchName: branch }, expectedHeadOid: expectedHead, message: { headline: 'Publish website from FTCS' }, fileChanges: { additions, deletions } }
    const result = await this.request<{ data?: { createCommitOnBranch?: { commit?: { oid?: string } } }; errors?: Array<{ message?: string }> }>('/graphql', { method: 'POST', body: JSON.stringify({ query, variables: { input } }) })
    const sha = result.data?.createCommitOnBranch?.commit?.oid
    if (result.errors?.length || !sha || !/^[a-f0-9]{40}$/i.test(sha)) throw new Error('GitHub 未确认提交。分支可能已变化、受保护或授权不足；请刷新并检查仓库后重试。')
    return sha
  }
}
