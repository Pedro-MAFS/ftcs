<script setup lang="ts">
import { computed, onActivated, onMounted, onUnmounted, ref, watch } from 'vue'
import Icon from '../components/shared/Icon.vue'
defineOptions({ name: 'SiteView' })
type SiteState = Awaited<ReturnType<NonNullable<Window['ftcs']>['getSite']>>
type SiteRuntimeState = Awaited<ReturnType<NonNullable<Window['ftcs']>['getSiteRuntime']>>
const site = ref<SiteState | null>(null)
const localRun = ref<SiteRuntimeState | null>(null)
const localError = ref('')
const installChoice = ref<'' | 'install' | 'preview'>('')
const addressInput = ref('')
const outputInput = ref('')
const editingOutput = ref(false)
let removeRuntimeListener: (() => void) | undefined
const runBusy = (state?: string) => !!state && ['starting', 'running', 'address_pending', 'stopping'].includes(state)
const labels: Record<string, string> = { idle: '尚未开始', starting: '正在启动', running: '运行中', address_pending: '地址待确认', stopping: '正在停止', succeeded: '已完成', failed: '失败', cancelled: '已停止' }
function applySiteRuntime(snapshot: SiteRuntimeState) {
  if (site.value && snapshot.workspaceRoot !== site.value.workspaceRoot) return
  if (localRun.value?.workspaceRoot === snapshot.workspaceRoot && localRun.value.sequence > snapshot.sequence) return
  localRun.value = snapshot
  if (!editingOutput.value) outputInput.value = snapshot.outputDir || ''
}
async function refreshSiteRuntime() {
  if (!site.value || !window.ftcs?.getSiteRuntime) return
  try { applySiteRuntime(await window.ftcs.getSiteRuntime(site.value.workspaceRoot)) }
  catch { localError.value = '无法读取本地运行状态，请重试。' }
}
async function localAction(action: () => Promise<{ ok: boolean; message?: string }>) {
  localError.value = ''
  try { const result = await action(); if (!result.ok) localError.value = result.message || '操作失败，请重试。' }
  catch (error) { localError.value = error instanceof Error ? error.message : '操作失败，请重试。' }
}
async function startPreview() {
  if (!site.value || !localRun.value || !window.ftcs) return
  if (localRun.value.dependencies === 'missing') { installChoice.value = 'preview'; return }
  await localAction(() => window.ftcs!.startSitePreview(site.value!.workspaceRoot))
}
async function installDependencies() {
  if (!site.value || !localRun.value || !window.ftcs) return
  const root = site.value.workspaceRoot
  const choice = installChoice.value
  const reinstall = localRun.value.dependencies === 'unknown'
  installChoice.value = ''
  if (runBusy(localRun.value.preview.state)) {
    const id = localRun.value.preview.id
    const stopped = await window.ftcs.cancelSiteRun(root, 'preview', id)
    if (!stopped.ok) { localError.value = stopped.message || '无法停止预览。'; return }
    for (let i = 0; i < 60; i++) {
      const snapshot = await window.ftcs.getSiteRuntime(root)
      applySiteRuntime(snapshot)
      if (!runBusy(snapshot.preview.state)) break
      await new Promise(resolve => setTimeout(resolve, 250))
    }
    if (runBusy(localRun.value?.preview.state)) { localError.value = '预览尚未停止，请检查后重试。'; return }
  }
  await localAction(() => window.ftcs!.installSiteDependencies(root, reinstall, choice === 'preview'))
}
async function cancelLocal(kind: 'install' | 'preview' | 'build') {
  if (!site.value || !localRun.value || !window.ftcs) return
  await localAction(() => window.ftcs!.cancelSiteRun(site.value!.workspaceRoot, kind, localRun.value![kind].id))
}
async function openPreview() {
  if (!site.value || !localRun.value || !window.ftcs) return
  await localAction(() => window.ftcs!.openSitePreview(site.value!.workspaceRoot, localRun.value!.preview.id))
}
async function submitAddress() {
  if (!site.value || !localRun.value || !window.ftcs) return
  await localAction(() => window.ftcs!.setSitePreviewAddress(site.value!.workspaceRoot, localRun.value!.preview.id, addressInput.value))
}
async function saveOutput() {
  if (!site.value || !window.ftcs) return
  await localAction(() => window.ftcs!.setSiteOutput(site.value!.workspaceRoot, outputInput.value))
  if (!localError.value) { editingOutput.value = false; await refreshSiteRuntime() }
}
async function buildLocal() {
  if (!site.value || !window.ftcs) return
  await localAction(() => window.ftcs!.buildSite(site.value!.workspaceRoot))
}
const siteBusy = ref(false)
const siteMessage = ref('')
const confirmRecreate = ref(false)
let siteRequest = 0
const siteLabel = computed(() => {
  const labels: Record<SiteState['status'], string> = { not_created: '尚未创建', empty: '目录为空', existing: '发现已有站点', ready: '本地站点已创建', missing: '站点目录不存在', invalid: '项目需要处理', error: '无法读取站点' }
  return site.value ? labels[site.value.status] : '正在检查'
})
async function refreshSite() {
  if (!window.ftcs?.getSite) return
  const request = ++siteRequest
  try {
    const state = await window.ftcs.getSite()
    if (request === siteRequest) { site.value = state; confirmRecreate.value = false; await refreshSiteRuntime(); await refreshRelease() }
  } catch { if (request === siteRequest) siteMessage.value = '无法检查本地站点，请重试。' }
}
async function changeSite(action: 'create' | 'adopt') {
  if (!window.ftcs || !site.value || siteBusy.value) return
  const root = site.value.workspaceRoot
  siteBusy.value = true
  siteMessage.value = ''
  try {
    const result = action === 'create' ? await window.ftcs.createSite(root) : await window.ftcs.adoptSite(root)
    await refreshSite()
    if (site.value?.workspaceRoot === root) siteMessage.value = result.ok ? (action === 'create' ? '站点项目已创建。' : '已使用当前工作区中的站点项目。') : (result.message || '操作失败，请检查后重试。')
  } catch { siteMessage.value = '站点操作失败，请检查后重试。'; await refreshSite() }
  finally { siteBusy.value = false }
}
async function openSiteDirectory(kind: 'project' | 'workspace') {
  if (!site.value) return
  try { const result = await window.ftcs?.openSiteDirectory(kind, site.value.workspaceRoot); if (!result?.ok) siteMessage.value = result?.message || '无法打开目录。' }
  catch { siteMessage.value = '无法打开目录。' }
}
const connected = ref(false)
const login = ref('')
const authorized = ref(false)
const installUrl = ref('')
const busy = ref(false)
const code = ref('')
const message = ref('')
const deviceUrl = 'https://github.com/login/device'
const cfConnected = ref(false)
const cfAuthorized = ref(false)
const cfAccountId = ref('')
const cfAccountName = ref('')
const cfAccounts = ref<Array<{ id: string; name: string }>>([])
const cfChoose = ref(false)
const cfBusy = ref(false)
const cfMessage = ref('')
let cfAttempt = 0
function applyCloudflareState(state: { connected: boolean; authorized?: boolean; accountId?: string; accountName?: string; accounts?: Array<{ id: string; name: string }>; message?: string }) {
  cfConnected.value = state.connected
  cfAuthorized.value = state.authorized ?? false
  cfAccountId.value = state.accountId ?? ''
  cfAccountName.value = state.accountName ?? ''
  cfAccounts.value = state.accounts ?? []
  cfMessage.value = state.message ?? ''
  if (state.connected) cfChoose.value = false
}
async function refreshCloudflare() {
  if (!window.ftcs?.getCloudflareState) return
  const current = cfAttempt
  try { const state = await window.ftcs.getCloudflareState(); if (current === cfAttempt) applyCloudflareState(state) }
  catch { cfMessage.value = '无法检查 Cloudflare 连接，请重试。' }
}
async function connectCloudflare() {
  if (!window.ftcs?.connectCloudflare || cfBusy.value) return
  const current = ++cfAttempt
  cfBusy.value = true
  cfMessage.value = ''
  try {
    let result = await window.ftcs.connectCloudflare()
    if (current !== cfAttempt) return
    if (result.needsPageAuthorization) {
      cfMessage.value = '账号授权完成，请在浏览器继续确认 Pages 权限。'
      result = await window.ftcs.connectCloudflare()
    }
    if (current === cfAttempt) applyCloudflareState(result)
  }
  catch { if (current === cfAttempt) cfMessage.value = 'Cloudflare 连接失败，请重试。' }
  finally { if (current === cfAttempt) cfBusy.value = false }
}
async function cancelCloudflare() {
  cfAttempt++
  try { await window.ftcs!.cancelCloudflareAuth() } finally { cfBusy.value = false; cfMessage.value = '已取消 Cloudflare 授权。' }
}
async function chooseCloudflareAccount(accountId: string) {
  if (!accountId || cfBusy.value) return
  const current = ++cfAttempt
  cfBusy.value = true
  try { const result = await window.ftcs!.selectCloudflareAccount(accountId); if (current === cfAttempt) applyCloudflareState(result) }
  catch { cfMessage.value = '无法选择 Cloudflare 账号，请重试。' }
  finally { if (current === cfAttempt) cfBusy.value = false }
}
async function disconnectCloudflare() {
  cfAttempt++
  try { await window.ftcs!.disconnectCloudflare(); applyCloudflareState({ connected: false, message: '已移除本机 Cloudflare 授权。' }); cfBusy.value = false }
  catch { cfMessage.value = '移除 Cloudflare 授权失败，请重试。' }
}
async function refreshAll() { await Promise.all([refresh(), refreshCloudflare(), refreshSite()]) }
let timer: ReturnType<typeof setTimeout> | undefined
let attempt = 0
async function refresh() {
  if (!window.ftcs?.getGithubState) return
  const state = await window.ftcs.getGithubState()
  connected.value = state.connected
  authorized.value = state.authorized ?? false
  installUrl.value = state.installUrl ?? ''
  login.value = state.login ?? ''
  message.value = state.message ?? ''
}
function poll(current: number, interval: number) {
  timer = setTimeout(async () => {
    if (current !== attempt) return
    try {
      const result = await window.ftcs!.pollGithubAuth()
      if (current !== attempt) return
      if (result.status === 'pending') { poll(current, result.interval ?? interval); return }
      busy.value = false
      code.value = ''
      if (result.status === 'connected') { await refresh() }
      else message.value = result.message ?? 'GitHub 授权失败，请重试。'
    } catch { busy.value = false; code.value = ''; message.value = '无法检查 GitHub 授权，请重试。' }
  }, interval * 1000)
}
async function connect() {
  if (busy.value) return
  message.value = ''
  busy.value = true
  const current = ++attempt
  try {
    const result = await window.ftcs!.startGithubAuth()
    if (current !== attempt) return
    if (!result.ok || !result.userCode) { busy.value = false; message.value = result.message ?? '无法启动授权。'; return }
    code.value = result.userCode
    poll(current, result.interval ?? 5)
    const opened = await window.ftcs!.openExternal(deviceUrl)
    if (!opened.ok) message.value = '无法打开浏览器，请点击下方链接打开 GitHub。'
  } catch { busy.value = false; message.value = '无法启动 GitHub 授权，请重试。' }
}
async function cancel() {
  attempt++
  if (timer) clearTimeout(timer)
  await window.ftcs!.cancelGithubAuth()
  busy.value = false
  code.value = ''
  message.value = ''
}
async function disconnect() {
  try { await window.ftcs!.disconnectGithub(); connected.value = false; authorized.value = false; installUrl.value = ''; login.value = ''; message.value = '已移除本机 GitHub 授权。' }
  catch { message.value = '移除授权失败，请重试。' }
}
async function openDevice() { await window.ftcs!.openExternal(deviceUrl) }
async function openInstall() { if (installUrl.value) await window.ftcs!.openExternal(installUrl.value) }
async function copyCode() {
  try { await navigator.clipboard.writeText(code.value); message.value = '授权码已复制。' }
  catch { message.value = '无法复制，请手动输入授权码。' }
}
async function openGithubNewRepository() { await window.ftcs?.openExternal('https://github.com/new') }
async function openGithubInstallations() { await window.ftcs?.openExternal('https://github.com/settings/installations') }
type Repository = NonNullable<Awaited<ReturnType<NonNullable<Window['ftcs']>['listGithubRepositories']>>['repositories']>[number]
type Branch = NonNullable<Awaited<ReturnType<NonNullable<Window['ftcs']>['listGithubBranches']>>['branches']>[number]
const publishOpen = ref(false)
const publishStarting = ref(false)
const publishBusy = ref(false)
const preparingRelease = ref(false)
const cancellingRelease = ref(false)
const publishError = ref('')
const repositories = ref<Repository[]>([])
const selectedRepository = ref<number | null>(null)
const branches = ref<Branch[]>([])
const selectedBranch = ref('')
const repoSearch = ref('')
const createRepoOpen = ref(false)
const newRepoName = ref('')
const newRepoPrivate = ref(true)
const acceptInitialReadme = ref(false)
const previewFileName = ref('')
const previewFileText = ref('')
type Release = Extract<Awaited<ReturnType<NonNullable<Window['ftcs']>['getSiteRelease']>>, { ok: true }>['value']
type Preview = Extract<Awaited<ReturnType<NonNullable<Window['ftcs']>['prepareSiteRelease']>>, { ok: true }>['value']
type Pages = Extract<Awaited<ReturnType<NonNullable<Window['ftcs']>['listSitePages']>>, { ok: true }>['value']['projects']
type Deployment = Extract<Awaited<ReturnType<NonNullable<Window['ftcs']>['getSitePagesStatus']>>, { ok: true }>['value']
const release = ref<Release | null>(null)
const preview = ref<Preview | null>(null)
const pageProjects = ref<Pages>([])
const selectedPage = ref('')
const showPages = ref(false)
const createPageOpen = ref(false)
const pageName = ref('')
const pageNodeVersion = ref('24')
const confirmClearPage = ref(false)
const confirmClearDeployment = ref(false)
const deployment = ref<Deployment | null>(null)
const deploymentError = ref('')
let checkingDeployment = false
let deploymentTimer: ReturnType<typeof setInterval> | undefined
let publishRequest = 0
const filteredRepositories = computed(() => repositories.value.filter(repo => repo.fullName.toLowerCase().includes(repoSearch.value.toLowerCase().trim())))
const chosenRepository = computed(() => repositories.value.find(repo => repo.id === selectedRepository.value))
const chosenBranch = computed(() => branches.value.find(branch => branch.name === selectedBranch.value))
async function loadRepositories() {
  if (!site.value || !window.ftcs || publishBusy.value) return
  const root = site.value.workspaceRoot
  const request = ++publishRequest
  publishBusy.value = true
  publishError.value = ''
  selectedRepository.value = null
  selectedBranch.value = ''
  branches.value = []
  preview.value = null
  try {
    const result = await window.ftcs.listGithubRepositories(root)
    if (request !== publishRequest || site.value?.workspaceRoot !== root) return
    if (!result.ok) { repositories.value = []; publishError.value = result.message || '无法读取 GitHub 仓库。'; return }
    repositories.value = result.repositories || []
  } catch { if (request === publishRequest) publishError.value = '无法读取 GitHub 仓库，请检查网络后重试。' }
  finally { if (request === publishRequest) publishBusy.value = false }
}
async function chooseRepository(id: number) {
  if (!site.value || !window.ftcs || publishBusy.value) return
  selectedRepository.value = id
  acceptInitialReadme.value = false
  selectedBranch.value = ''
  branches.value = []
  publishError.value = ''
  preview.value = null
  const repo = repositories.value.find(item => item.id === id)
  if (!repo) return
  const root = site.value.workspaceRoot
  const request = ++publishRequest
  publishBusy.value = true
  try {
    const result = await window.ftcs.listGithubBranches(root, id)
    if (request !== publishRequest || site.value?.workspaceRoot !== root) return
    if (!result.ok) { publishError.value = result.message || '无法读取分支。'; return }
    branches.value = result.branches || []
    selectedBranch.value = branches.value.find(branch => branch.name === repo.defaultBranch)?.name || ''
  } catch { if (request === publishRequest) publishError.value = '无法读取分支，请重试。' }
  finally { if (request === publishRequest) publishBusy.value = false }
}
async function refreshRelease() {
  if (!site.value || !window.ftcs) return
  const root = site.value.workspaceRoot
  const result = await window.ftcs.getSiteRelease(root)
  if (site.value?.workspaceRoot !== root) return
  if (result.ok) {
    release.value = result.value
    if (result.value.cloudflare) await refreshDeployment()
    else { deployment.value = null; deploymentError.value = '' }
  }
}
async function refreshDeployment() {
  if (!site.value || !release.value?.cloudflare || !window.ftcs || checkingDeployment) return
  const root = site.value.workspaceRoot
  checkingDeployment = true
  try {
    const result = await window.ftcs.getSitePagesStatus(root)
    if (site.value?.workspaceRoot !== root) return
    if (result.ok) {
      deployment.value = result.value; deploymentError.value = ''
      if (result.value.deploymentId) {
        const latest = await window.ftcs.getSiteRelease(root)
        if (latest.ok && site.value?.workspaceRoot === root) release.value = latest.value
      }
    }
    else { deploymentError.value = result.message; deployment.value = null }
  } catch { deploymentError.value = '无法查询 Cloudflare 部署状态。'; deployment.value = null }
  finally { checkingDeployment = false }
}
async function prepareRelease() {
  if (!site.value || !window.ftcs || !chosenRepository.value || !selectedBranch.value || publishBusy.value) return
  const root = site.value.workspaceRoot
  const request = ++publishRequest
  publishBusy.value = true; preparingRelease.value = true; publishError.value = ''; preview.value = null
  try {
    const result = await window.ftcs.prepareSiteRelease(root, chosenRepository.value.id, selectedBranch.value, acceptInitialReadme.value)
    if (request !== publishRequest || site.value?.workspaceRoot !== root) return
    if (result.ok) preview.value = result.value
    else publishError.value = result.message
  } catch { if (request === publishRequest) publishError.value = '构建检查未完成，请检查后重试。' }
  finally { if (request === publishRequest) { publishBusy.value = false; preparingRelease.value = false; cancellingRelease.value = false } }
}
async function cancelReleaseBuild() {
  if (!site.value || !window.ftcs || cancellingRelease.value) return
  cancellingRelease.value = true
  try { const result = await window.ftcs.cancelSiteRelease(site.value.workspaceRoot); if (!result.ok) { publishError.value = result.message; cancellingRelease.value = false } }
  catch { publishError.value = '无法取消构建检查，请重试。'; cancellingRelease.value = false }
}
async function showPreviewFile(name: string) {
  if (!site.value || !window.ftcs || !preview.value) return
  const root = site.value.workspaceRoot, id = preview.value.id
  try {
    const result = await window.ftcs.getSiteReleaseFile(root, id, name)
    if (site.value?.workspaceRoot !== root || preview.value?.id !== id) return
    previewFileName.value = name
    previewFileText.value = result.ok ? result.value.text ?? result.value.message ?? '' : result.message
  } catch { previewFileName.value = name; previewFileText.value = '无法读取快照文件。' }
}
async function commitRelease() {
  if (!site.value || !window.ftcs || !preview.value || publishBusy.value) return
  const root = site.value.workspaceRoot
  const request = ++publishRequest
  publishBusy.value = true; publishError.value = ''
  try {
    const result = await window.ftcs.commitSiteRelease(root, preview.value.id)
    if (request !== publishRequest || site.value?.workspaceRoot !== root) return
    preview.value = null
    if (result.ok) { release.value = result.value; deployment.value = null; deploymentError.value = ''; publishOpen.value = false; await refreshDeployment() }
    else { publishError.value = `${result.message} 请先检查发布记录中的提交状态。`; await refreshRelease() }
  } catch { if (request === publishRequest) { publishError.value = '提交结果未知，请先检查发布记录。'; await refreshRelease() } }
  finally { if (request === publishRequest) publishBusy.value = false }
}
async function recoverRelease() {
  if (!site.value || !window.ftcs || publishBusy.value) return
  publishBusy.value = true; publishError.value = ''
  try { const result = await window.ftcs.recoverSiteRelease(site.value.workspaceRoot); if (result.ok) { release.value = result.value; deployment.value = null; deploymentError.value = ''; await refreshDeployment(); message.value = '已根据 GitHub 的当前状态检查提交结果。' } else message.value = result.message }
  catch { message.value = '无法确认提交结果，请检查 GitHub 后重试。' }
  finally { publishBusy.value = false }
}
async function loadPages() {
  if (!site.value || !window.ftcs || publishBusy.value) return
  const root = site.value.workspaceRoot
  publishBusy.value = true; deploymentError.value = ''; showPages.value = true
  try { const result = await window.ftcs.listSitePages(root); if (site.value?.workspaceRoot !== root) return; if (result.ok) { pageProjects.value = result.value.projects; if (release.value?.pendingPages?.accountId === result.value.accountId && pageProjects.value.some(p => p.name === release.value?.pendingPages?.project)) selectedPage.value = release.value.pendingPages.project } else deploymentError.value = result.message }
  catch { deploymentError.value = '无法读取 Cloudflare Pages 项目。' }
  finally { publishBusy.value = false }
}
async function createPages() {
  if (!site.value || !window.ftcs || publishBusy.value) return
  const root = site.value.workspaceRoot
  publishBusy.value = true; deploymentError.value = ''
  try {
    const result = await window.ftcs.createSitePages(root, pageName.value.trim(), pageNodeVersion.value)
    if (site.value?.workspaceRoot !== root) return
    if (result.ok) { release.value = result.value; createPageOpen.value = false; await refreshDeployment(); if (result.value.buildNotice) deploymentError.value = result.value.buildNotice }
    else { await refreshRelease(); deploymentError.value = `${result.message} 请检查项目创建结果；如需授权 GitHub，请在 Cloudflare 控制台完成。` }
  } catch { await refreshRelease(); deploymentError.value = '项目创建结果未知，请先检查 Cloudflare，避免重复创建。' }
  finally { publishBusy.value = false }
}
async function clearPendingPage() {
  if (!site.value || !window.ftcs || publishBusy.value) return
  publishBusy.value = true
  try { const result = await window.ftcs.clearPendingSitePages(site.value.workspaceRoot); if (result.ok) { release.value = result.value; confirmClearPage.value = false; deploymentError.value = '' } else deploymentError.value = result.message }
  catch { deploymentError.value = '无法清除待确认状态。' }
  finally { publishBusy.value = false }
}
async function bindPages() {
  if (!site.value || !window.ftcs || !selectedPage.value || publishBusy.value) return
  const root = site.value.workspaceRoot
  publishBusy.value = true; deploymentError.value = ''
  try {
    const result = await window.ftcs.bindSitePages(root, selectedPage.value)
    if (site.value?.workspaceRoot !== root) return
    if (result.ok) { release.value = result.value; showPages.value = false; await refreshDeployment(); if (result.value.buildNotice) deploymentError.value = result.value.buildNotice }
    else deploymentError.value = result.message
  } catch { deploymentError.value = '无法关联 Cloudflare Pages 项目。' }
  finally { publishBusy.value = false }
}
async function startDeployment() {
  if (!site.value || !window.ftcs || publishBusy.value) return
  const root = site.value.workspaceRoot
  publishBusy.value = true; deploymentError.value = ''
  try {
    const result = await window.ftcs.startSiteDeployment(root)
    if (site.value?.workspaceRoot !== root) return
    if (result.ok) { release.value = result.value; await refreshDeployment() }
    else { await refreshRelease(); deploymentError.value = result.message }
  } catch { await refreshRelease(); deploymentError.value = '构建请求结果未知，请先到 Cloudflare 检查。' }
  finally { publishBusy.value = false }
}
async function clearPendingDeployment() {
  if (!site.value || !window.ftcs || publishBusy.value) return
  publishBusy.value = true
  try { const result = await window.ftcs.clearSitePendingDeployment(site.value.workspaceRoot); if (result.ok) { release.value = result.value; confirmClearDeployment.value = false; deploymentError.value = ''; await refreshDeployment() } else deploymentError.value = result.message }
  catch { deploymentError.value = '无法清除待确认状态。' }
  finally { publishBusy.value = false }
}
async function openCloudflarePages() {
  if (!/^[a-f0-9]{32}$/i.test(cfAccountId.value)) { deploymentError.value = '请先连接并选择 Cloudflare 账号。'; return }
  await window.ftcs?.openExternal(`https://dash.cloudflare.com/${cfAccountId.value}/pages`)
}
async function openOnlineSite(url: string) {
  try { const parsed = new URL(url); if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('.pages.dev')) throw new Error('invalid'); await window.ftcs?.openExternal(parsed.href) }
  catch { deploymentError.value = '网站地址无效，请在 Cloudflare 控制台查看。' }
}
async function createRepository() {
  if (!site.value || !window.ftcs || publishBusy.value) return
  const root = site.value.workspaceRoot
  const request = ++publishRequest
  publishBusy.value = true
  publishError.value = ''
  try {
    const result = await window.ftcs.createGithubRepository(root, newRepoName.value.trim(), newRepoPrivate.value)
    if (request !== publishRequest || site.value?.workspaceRoot !== root) return
    if (!result.ok) { publishError.value = `${result.message || '创建请求未完成。'} 请先到 GitHub 检查仓库是否已创建，再决定是否重试。`; return }
    createRepoOpen.value = false
    newRepoName.value = ''
    publishBusy.value = false
    preparingRelease.value = false
    cancellingRelease.value = false
    await loadRepositories()
    if (site.value?.workspaceRoot !== root) return
    const created = repositories.value.find(repo => repo.fullName === result.repository?.fullName)
    if (created) await chooseRepository(created.id)
    else publishError.value = `仓库 ${result.repository?.fullName || ''} 已创建。如列表中没有它，请在 GitHub 为 FTCS App 授权该仓库后刷新。`
  } catch { if (request === publishRequest) publishError.value = '创建结果未知，请先到 GitHub 检查仓库是否已创建，再决定是否重试。' }
  finally { if (request === publishRequest) publishBusy.value = false }
}
async function publish() {
  if (publishStarting.value || publishBusy.value) return
  message.value = ''
  publishStarting.value = true
  try {
    await refreshAll()
    if (site.value?.status !== 'ready') { message.value = '发布前请先创建或恢复本地站点。'; return }
    if (!localRun.value?.outputDir) { message.value = '发布前请先在构建检查中设置静态产物目录。'; return }
    if (!connected.value || !cfConnected.value) {
      const missing = [!connected.value ? 'GitHub' : '', !cfConnected.value ? 'Cloudflare' : ''].filter(Boolean).join(' 和 ')
      message.value = `发布前请先连接 ${missing}。`
      return
    }
    publishOpen.value = true
    await loadRepositories()
  } catch { message.value = '无法检查发布条件，请检查连接后重试。' }
  finally { publishStarting.value = false }
}
watch(() => site.value?.workspaceRoot, (next, previous) => {
  if (previous && next !== previous) {
    publishRequest++
    publishOpen.value = false
    publishBusy.value = false
    repositories.value = []
    selectedRepository.value = null
    branches.value = []
    selectedBranch.value = ''
    createRepoOpen.value = false
    publishError.value = ''
    release.value = null
    preview.value = null
    deployment.value = null
    pageProjects.value = []
    showPages.value = false
  }
})
onMounted(() => { removeRuntimeListener = window.ftcs?.onSiteRuntime?.(applySiteRuntime); void refreshAll(); window.addEventListener('focus', refreshSite); deploymentTimer = setInterval(() => void refreshDeployment(), 15000) })
onActivated(() => { void refreshSite() })
onUnmounted(() => { removeRuntimeListener?.(); siteRequest++; publishRequest++; window.removeEventListener('focus', refreshSite); cfAttempt++; attempt++; if (timer) clearTimeout(timer); if (deploymentTimer) clearInterval(deploymentTimer); void window.ftcs?.cancelGithubAuth?.(); void window.ftcs?.cancelCloudflareAuth?.() })
</script>

<template>
  <div class="site-page">
    <header class="page-header"><div><h1>独立站</h1><p>创建、预览并发布属于你的品牌网站</p></div><div class="header-actions"><button class="btn secondary" type="button" @click="refreshAll"><Icon name="refresh-cw" /> 刷新</button><button class="btn primary" type="button" :disabled="publishStarting || publishBusy" @click="publish">{{ publishStarting ? '正在检查…' : '发布网站' }}</button></div></header>
    <div class="connections" aria-label="账号连接">
      <div class="connection"><button v-if="!connected && !authorized" class="btn secondary" type="button" :disabled="busy" @click="connect"><Icon name="plus" /> {{ busy ? '正在连接 GitHub' : '连接 GitHub' }}</button><template v-else><span class="connection-status"><span class="dot" /> GitHub · {{ login }} · {{ connected ? '已连接' : '待完成安装' }}</span><button v-if="installUrl" class="text-button" type="button" @click="openInstall">安装 GitHub App</button><button class="text-button" type="button" @click="disconnect">断开</button></template></div>
      <div class="connection"><button v-if="!cfConnected" class="btn secondary" type="button" :disabled="cfBusy" @click="connectCloudflare"><Icon name="plus" /> {{ cfBusy ? '正在连接 Cloudflare' : '连接 Cloudflare' }}</button><span v-else class="connection-status" :title="cfAccountId"><span class="dot" /> Cloudflare · {{ cfAccountName }} · 已连接</span><button v-if="cfConnected && cfAccounts.length > 1" class="text-button" type="button" @click="cfChoose = !cfChoose">切换账号</button><button v-if="cfAuthorized" class="text-button" type="button" @click="disconnectCloudflare">断开</button></div>
      <span class="context">当前工作区的站点连接</span>
    </div>
    <div v-if="code" class="auth-panel" role="status"><div><strong>在 GitHub 完成授权</strong><p>在浏览器输入下方授权码，并按 GitHub 提示选择账号和授权范围。</p></div><div class="auth-actions"><code>{{ code }}</code><button class="btn secondary" type="button" @click="copyCode">复制</button><button class="btn secondary" type="button" @click="openDevice">打开 GitHub</button><button class="text-button" type="button" @click="cancel">取消</button></div><p>等待 GitHub 确认授权…</p></div>
    <div v-if="cfBusy" class="auth-panel" role="status"><strong>等待 Cloudflare 授权</strong><p>请在浏览器登录并授权，完成后返回 FTCS。</p><div class="auth-actions"><button class="btn secondary" type="button" @click="cancelCloudflare">取消</button></div></div>
    <div v-if="(!cfConnected || cfChoose) && cfAccounts.length > 1" class="auth-panel"><strong>选择 Cloudflare 账号</strong><p>请选择用于独立站的账号。</p><div class="auth-actions"><button v-for="account in cfAccounts" :key="account.id" class="btn secondary" type="button" :disabled="cfBusy" @click="chooseCloudflareAccount(account.id)">{{ account.name }}</button></div></div>
    <p v-if="cfMessage" class="notice" role="status">{{ cfMessage }}</p>
    <p v-if="message" class="notice" role="status">{{ message }}</p>
    <p v-if="siteMessage" class="notice" role="status">{{ siteMessage }}</p>
    <section v-if="publishOpen" class="publish-panel" aria-label="发布准备">
      <div class="section-header"><div><h2>发布准备 · 选择 GitHub 仓库</h2><p>选择网站源码的目标仓库和生产分支。当前步骤不会上传站点或发布网站。</p></div><button class="text-button" type="button" :disabled="publishBusy" @click="publishOpen = false">关闭</button></div>
      <p v-if="publishError" class="notice" role="alert">{{ publishError }}</p>
      <div class="site-actions"><input v-model="repoSearch" class="local-input" placeholder="搜索已授权的仓库" aria-label="搜索仓库" /><button class="btn secondary" type="button" :disabled="publishBusy" @click="loadRepositories">刷新仓库</button><button class="btn secondary" type="button" :disabled="publishBusy" @click="createRepoOpen = !createRepoOpen">创建个人仓库</button><button class="text-button" type="button" @click="openGithubNewRepository">在 GitHub 创建</button><button class="text-button" type="button" @click="openGithubInstallations">管理仓库授权</button></div>
      <div v-if="createRepoOpen" class="inline-box"><strong>创建 {{ login }} 的个人仓库</strong><p>将在 GitHub 创建仓库并用 README 初始化分支；不会上传站点。即使仓库为私有，网站发布后仍可能公开访问。</p><div class="site-actions"><input v-model="newRepoName" class="local-input" placeholder="仓库名称" aria-label="新仓库名称" /><label><input v-model="newRepoPrivate" type="checkbox" /> 私有仓库</label><button class="btn primary" type="button" :disabled="publishBusy || !newRepoName.trim()" @click="createRepository">确认创建</button><button class="btn secondary" type="button" :disabled="publishBusy" @click="createRepoOpen = false">取消</button></div></div>
      <p v-if="publishBusy">正在处理，请稍候；依赖安装和构建可能需要几分钟… <button v-if="preparingRelease" class="text-button" type="button" :disabled="cancellingRelease" @click="cancelReleaseBuild">{{ cancellingRelease ? '正在取消…' : '取消构建检查' }}</button></p>
      <p v-else-if="!filteredRepositories.length">没有找到已授权的仓库。请在 GitHub 创建仓库，或调整 FTCS GitHub App 的仓库授权后刷新。</p>
      <div v-if="filteredRepositories.length" class="repo-list"><button v-for="repo in filteredRepositories" :key="repo.id" type="button" class="repo-item" :class="{ selected: selectedRepository === repo.id }" :disabled="publishBusy" @click="chooseRepository(repo.id)"><span>{{ repo.fullName }} · {{ repo.private ? '私有' : '公开' }}</span><span>{{ repo.writeAccess === 'yes' ? '安装权限允许写入，令牌待验证' : repo.writeAccess === 'no' ? '无写入权限' : '写入权限待确认' }}</span></button></div>
      <div v-if="chosenRepository" class="inline-box"><strong>{{ chosenRepository.fullName }}</strong><p v-if="chosenRepository.writeAccess !== 'yes'">当前无法确认仓库可写。请检查 GitHub 用户权限以及 FTCS App 的 Contents 写入权限和仓库授权。</p><div v-if="branches.length" class="site-actions"><label for="site-branch">生产分支</label><select id="site-branch" v-model="selectedBranch" class="local-input" :disabled="publishBusy" @change="preview = null"><option value="" disabled>请选择分支</option><option v-for="branch in branches" :key="branch.name" :value="branch.name">{{ branch.name }}{{ branch.protected ? '（受保护）' : '' }}</option></select></div><p v-if="chosenBranch?.protected">该分支受保护，提交可能需要额外权限或通过 GitHub 审核。</p><p v-if="!branches.length && !publishBusy">没有可选分支时，请先在 GitHub 初始化仓库。</p><p><label><input v-model="acceptInitialReadme" type="checkbox" :disabled="publishBusy" @change="preview = null" /> 如果仓库只包含 README.md，同意用站点文件替换或删除该文件</label></p><p>检查会复制站点源码，使用 FTCS 的 Node 联网安装依赖并运行构建脚本，不修改原站点。检查通过后还需确认才会推送。</p><div class="site-actions"><button class="btn primary" type="button" :disabled="publishBusy || !selectedBranch || chosenRepository.writeAccess !== 'yes' || !!release?.pending" @click="prepareRelease">检查源码并构建</button></div></div>
      <div v-if="preview" class="inline-box"><strong>确认发布 {{ preview.target.fullName }} · {{ preview.target.branch }}</strong><p>{{ preview.target.private ? '私有仓库' : '公开仓库' }}；下列源码会被推送，网站仍可能公开访问。推送后 Cloudflare 可能立即自动部署。</p><p>源码快照 {{ preview.hash.slice(0, 12) }} · 构建通过<span v-if="preview.noChanges"> · 源码没有变化，不创建新提交</span></p><details><summary>查看 {{ preview.files.length }} 个源码文件和 {{ preview.deleted.length }} 个删除项</summary><div class="file-list"><div v-for="item in preview.files" :key="item.path"><button class="text-button" type="button" @click="showPreviewFile(item.path)">{{ item.change }} · {{ item.path }} · {{ item.size }} B</button></div><div v-for="item in preview.deleted" :key="item">删除 · {{ item }}</div></div><div v-if="previewFileName"><strong>{{ previewFileName }}</strong><pre>{{ previewFileText }}</pre></div></details><details><summary>构建日志</summary><pre>{{ preview.log }}</pre></details><div class="site-actions"><button class="btn primary" type="button" :disabled="publishBusy" @click="commitRelease">{{ preview.noChanges ? '确认使用此版本' : '确认推送到 GitHub' }}</button><button class="btn secondary" type="button" :disabled="publishBusy" @click="preview = null">取消</button></div></div>
    </section>
    <section class="site-card">
      <div class="site-card-title"><div class="site-icon"><Icon name="globe" :size="20" /></div><div><h2>工作区独立站</h2><p>一个工作区对应一个全局站点</p></div><span class="badge">{{ siteLabel }}</span></div>
      <div class="site-details"><div><span>线上地址</span><strong>{{ deployment?.productionUrl || '尚未确认' }}</strong></div><div><span>最近发布</span><strong>{{ deployment?.message || (release?.commitSha ? '已推送，等待关联 Cloudflare' : '—') }}</strong></div><div><span>本地站点</span><strong>{{ siteLabel }}</strong></div></div>
      <div v-if="site" class="site-local">
        <p>{{ site.message }}</p><p class="site-path" :title="site.projectPath">{{ site.projectPath }}</p>
        <div class="site-actions">
          <button v-if="site.status === 'not_created' || site.status === 'empty'" class="btn primary" type="button" :disabled="siteBusy" @click="changeSite('create')">{{ siteBusy ? '正在创建…' : site.status === 'empty' ? '在此初始化' : '创建站点' }}</button>
          <button v-if="site.status === 'existing'" class="btn primary" type="button" :disabled="siteBusy" @click="changeSite('adopt')">使用此站点</button>
          <button v-if="site.status === 'missing' && !confirmRecreate" class="btn secondary" type="button" :disabled="siteBusy" @click="confirmRecreate = true">重新创建</button>
          <button v-if="['ready', 'existing', 'empty', 'invalid'].includes(site.status)" class="btn secondary" type="button" @click="openSiteDirectory('project')">打开站点目录</button>
          <button v-if="['missing', 'invalid', 'error'].includes(site.status)" class="btn secondary" type="button" @click="openSiteDirectory('workspace')">打开工作区</button>
          <button v-if="site.status !== 'ready' && site.status !== 'not_created'" class="btn secondary" type="button" :disabled="siteBusy" @click="refreshSite">重新检查</button>
        </div>
        <div v-if="confirmRecreate" class="recreate-confirm"><p>将创建新的站点模板。原站点如有备份，可先恢复到此目录；重新创建后需检查原有发布关联。</p><div class="site-actions"><button class="btn primary" type="button" :disabled="siteBusy" @click="changeSite('create')">确认重新创建</button><button class="btn secondary" type="button" @click="confirmRecreate = false">取消</button></div></div>
      </div>
    </section>
    <p v-if="localError" class="notice" role="alert">{{ localError }}</p>
    <section class="section">
      <div class="section-header"><div><h2>本地预览</h2><p>在发布前查看当前工作区的网站</p></div></div>
      <div v-if="site?.status !== 'ready' || !localRun" class="empty-preview"><Icon name="globe" :size="28" /><strong>还没有可预览的站点</strong><p>请先创建或恢复站点。</p></div>
      <div v-else class="local-panel">
        <div class="local-row"><div><strong>项目依赖</strong><p>{{ localRun.dependencies === 'missing' ? '尚未安装' : localRun.dependencies === 'not_required' ? '项目未声明依赖' : '状态待验证' }}<span v-if="localRun.install.message"> · {{ localRun.install.message }}</span></p></div><div class="site-actions"><button v-if="!runBusy(localRun.install.state) && localRun.dependencies !== 'not_required'" class="btn secondary" type="button" :disabled="runBusy(localRun.build.state)" @click="installChoice = 'install'">{{ localRun.dependencies === 'missing' ? '安装依赖' : '重新安装依赖' }}</button><button v-if="runBusy(localRun.install.state)" class="btn secondary" type="button" @click="cancelLocal('install')">取消安装</button></div></div>
        <div v-if="installChoice" class="inline-box"><strong>{{ installChoice === 'preview' ? '安装依赖并启动预览' : '安装项目依赖' }}</strong><p>将使用 FTCS 的 Node/npm 在站点目录安装依赖，可能联网并执行项目及依赖的安装脚本。</p><p v-if="localRun.dependencies === 'unknown'">项目已有依赖目录，使用锁文件重装时 npm 会先清理 node_modules。</p><p v-if="runBusy(localRun.preview.state)">安装前会先停止当前预览。</p><div class="site-actions"><button class="btn primary" type="button" @click="installDependencies">确认安装</button><button class="btn secondary" type="button" @click="installChoice = ''">取消</button></div></div>
        <div class="local-row"><div><strong>开发服务 · {{ labels[localRun.preview.state] }}</strong><p>{{ localRun.preview.message || '启动后可在 FTCS 中浏览网站。' }}</p><p v-if="localRun.preview.url" class="site-path">{{ localRun.preview.url }}</p><p v-if="localRun.preview.node">{{ localRun.preview.node }}</p></div><div class="site-actions"><button v-if="!runBusy(localRun.preview.state)" class="btn primary" type="button" :disabled="runBusy(localRun.install.state)" @click="startPreview">启动预览</button><button v-if="localRun.preview.url && ['running', 'address_pending'].includes(localRun.preview.state)" class="btn primary" type="button" @click="openPreview">{{ localRun.preview.state === 'address_pending' ? '打开地址核对' : '打开预览' }}</button><button v-if="runBusy(localRun.preview.state)" class="btn secondary" type="button" :disabled="localRun.preview.state === 'stopping'" @click="cancelLocal('preview')">{{ localRun.preview.state === 'starting' ? '取消启动' : '停止预览' }}</button></div></div>
        <div v-if="localRun.preview.state === 'address_pending'" class="site-actions"><input v-model="addressInput" class="local-input" placeholder="http://127.0.0.1:端口/" aria-label="本地预览地址" /><button class="btn secondary" type="button" @click="submitAddress">检查地址</button></div>
        <details v-if="localRun.install.log"><summary>安装日志</summary><pre>{{ localRun.install.log }}</pre></details>
        <details v-if="localRun.preview.log"><summary>预览日志</summary><pre>{{ localRun.preview.log }}</pre></details>
      </div>
    </section>
    <section class="section"><div class="section-header"><div><h2>构建检查</h2><p>生成并检查可发布的静态文件</p></div></div>
      <div v-if="site?.status === 'ready' && localRun" class="local-panel">
        <div class="local-row"><div><strong>静态产物目录</strong><p>{{ localRun.outputDir || '尚未设置' }}</p></div><button v-if="!editingOutput" class="btn secondary" type="button" :disabled="runBusy(localRun.build.state)" @click="editingOutput = true">{{ localRun.outputDir ? '修改' : '设置目录' }}</button></div>
        <div v-if="editingOutput" class="site-actions"><input v-model="outputInput" class="local-input" placeholder="站点内的相对目录，例如 dist" aria-label="静态产物目录" /><button class="btn primary" type="button" @click="saveOutput">保存</button><button class="btn secondary" type="button" @click="editingOutput = false; outputInput = localRun.outputDir || ''">取消</button></div>
        <div class="local-row"><div><strong>构建 · {{ labels[localRun.build.state] }}</strong><p>{{ localRun.build.message || '尚未执行构建。' }}</p><p v-if="localRun.build.finishedAt">完成时间：{{ new Date(localRun.build.finishedAt).toLocaleString() }}</p><p v-if="localRun.build.node">{{ localRun.build.node }}</p></div><div class="site-actions"><button v-if="!runBusy(localRun.build.state)" class="btn primary" type="button" :disabled="runBusy(localRun.install.state) || !localRun.outputDir" @click="buildLocal">检查构建</button><button v-else class="btn secondary" type="button" :disabled="localRun.build.state === 'stopping'" @click="cancelLocal('build')">取消构建</button></div></div>
        <details v-if="localRun.build.log"><summary>构建日志</summary><pre>{{ localRun.build.log }}</pre></details>
      </div><div v-else class="empty-record">创建站点后可以检查构建。</div>
    </section>
    <section class="section">
      <div class="section-header"><div><h2>发布记录</h2><p>查看网站发布和部署状态</p></div></div>
      <div v-if="!release?.commitSha && !release?.pending" class="empty-record">暂无发布记录</div>
      <div v-else class="local-panel">
        <div v-if="release?.pending" class="inline-box"><strong>GitHub 提交结果待确认</strong><p>上次请求可能已完成，先检查远端状态，不要重复创建提交。</p><div class="site-actions"><button class="btn secondary" :disabled="publishBusy" @click="recoverRelease">检查提交状态</button></div></div>
        <template v-if="release?.commitSha && release.target">
          <div class="local-row"><div><strong>GitHub · 已推送</strong><p>{{ release.target.fullName }} · {{ release.target.branch }}</p><p>版本：{{ release.commitSha }}</p></div></div>
          <div class="local-row"><div><strong>Cloudflare Pages · {{ release.cloudflare?.project || '尚未关联' }}</strong><p>{{ deployment?.message || (release.cloudflare ? '等待查询部署状态。' : '创建或选择关联相同仓库的 Pages 项目。') }}</p><p v-if="deploymentError" role="alert">{{ deploymentError }}</p><p v-if="deployment?.deploymentId">部署 ID：{{ deployment.deploymentId }}</p></div><div class="site-actions"><button class="btn secondary" :disabled="publishBusy" @click="openCloudflarePages">打开 Cloudflare</button><button class="btn secondary" :disabled="publishBusy || !!release.pendingPages" @click="createPageOpen = !createPageOpen">创建 Pages 项目</button><button class="btn secondary" :disabled="publishBusy" @click="loadPages">选择 Pages 项目</button><button v-if="release.cloudflare" class="btn secondary" @click="refreshDeployment">刷新状态</button><button v-if="release.cloudflare && !release.pendingDeployment && (deployment?.state === 'waiting' || deployment?.state === 'failed' || deployment?.state === 'skipped')" class="btn primary" :disabled="publishBusy" @click="startDeployment">{{ deployment?.state === 'waiting' ? '开始构建' : '重新构建' }}</button><button v-if="deployment?.productionUrl" class="btn primary" @click="openOnlineSite(deployment.productionUrl)">打开网站</button></div></div>
          <div v-if="release.pendingDeployment" class="inline-box"><strong>Cloudflare 构建请求待确认</strong><p>请先刷新状态或在 Cloudflare 检查部署记录，避免重复触发。{{ release.pendingDeployment.deploymentId ? `部署 ID：${release.pendingDeployment.deploymentId}` : '' }}</p><button class="text-button" :disabled="publishBusy" @click="confirmClearDeployment = true">我已检查，重新操作</button><div v-if="confirmClearDeployment"><p>请确认 Cloudflare 没有尚在处理的对应部署。清除后可以重新触发，不会删除云端部署。</p><div class="site-actions"><button class="btn secondary" :disabled="publishBusy" @click="clearPendingDeployment">确认清除待检查状态</button><button class="btn secondary" @click="confirmClearDeployment = false">取消</button></div></div></div>
          <div v-if="release.pendingPages" class="inline-box"><strong>项目 {{ release.pendingPages.project }} 的创建结果待确认</strong><p>请先刷新项目列表或到 Cloudflare 查看。若项目存在，选择并确认关联；未确认结果前不会自动重复创建。</p><div class="site-actions"><button class="btn secondary" :disabled="publishBusy" @click="loadPages">检查项目列表</button><button class="text-button" :disabled="publishBusy" @click="confirmClearPage = true">我已检查，重新操作</button></div><div v-if="confirmClearPage"><p>请确认已在 Cloudflare 检查项目是否创建。清除后可以重新尝试，但不会删除任何云端项目。</p><button class="btn secondary" :disabled="publishBusy" @click="clearPendingPage">确认清除待检查状态</button></div></div>
          <div v-if="createPageOpen && !release.pendingPages" class="inline-box"><strong>创建 Cloudflare Pages 项目</strong><p>将创建 GitHub 集成项目，关联 {{ release.target.fullName }} · {{ release.target.branch }}；构建命令 npm run build，产物目录 {{ localRun?.outputDir }}。创建后可能立即公开部署。</p><p>Cloudflare 需要独立获准访问 GitHub 仓库；如创建失败，请先在官方页面完成授权。</p><div class="site-actions"><input v-model="pageName" class="local-input" placeholder="小写项目名，例如 my-site" aria-label="Pages 项目名称" /><label>Node <select v-model="pageNodeVersion"><option>22</option><option>24</option><option>26</option></select></label><button class="btn primary" :disabled="publishBusy || !pageName.trim()" @click="createPages">确认创建并关联</button><button class="btn secondary" :disabled="publishBusy" @click="createPageOpen = false">取消</button></div></div>
          <div v-if="showPages" class="inline-box"><strong>关联 Cloudflare Pages 项目</strong><p>请在 Cloudflare 授权 GitHub 仓库并创建 Git 集成项目；生产分支为 {{ release.target.branch }}，构建命令为 npm run build，产物目录为 {{ localRun?.outputDir }}。创建或关联时可能立即开始部署。</p><p>默认模板建议设置 NODE_VERSION 为 24。完成后返回并刷新项目。</p><div class="site-actions"><select v-model="selectedPage" class="local-input"><option value="" disabled>选择 Pages 项目</option><option v-for="project in pageProjects" :key="project.name" :value="project.name">{{ project.name }} · {{ project.owner }}/{{ project.repo }}</option></select><button class="btn secondary" :disabled="publishBusy" @click="loadPages">刷新项目</button><button class="btn primary" :disabled="publishBusy || !selectedPage" @click="bindPages">确认关联</button><button class="btn secondary" :disabled="publishBusy" @click="showPages = false; selectedPage = ''">取消</button></div></div>
          <div v-if="release.lastOnline" class="inline-box"><strong>最近确认上线的版本</strong><p>{{ release.lastOnline.project }} · {{ release.lastOnline.commitSha.slice(0, 12) }} · {{ new Date(release.lastOnline.confirmedAt).toLocaleString() }}</p><p>地址：{{ release.lastOnline.url }}。当前线上版本以 Cloudflare 最新状态为准。</p></div>
          <p v-if="deployment?.state === 'success'">默认模板需要在 Cloudflare 构建环境中设置 SITE_URL 并重新部署，才能按正式地址生成 sitemap。</p>
          <details v-if="release.history?.length"><summary>查看 GitHub 推送记录</summary><p v-for="item in release.history" :key="`${item.target.fullName}-${item.target.branch}-${item.commitSha}`">{{ new Date(item.at).toLocaleString() }} · {{ item.target.fullName }} · {{ item.target.branch }} · {{ item.commitSha.slice(0, 12) }}</p></details>
        </template>
      </div>
    </section>
  </div>
</template>

<style scoped>
.site-page{width:100%;flex:1;min-height:0;overflow-y:auto;max-width:1100px;margin:0 auto;padding:32px 36px 56px;color:var(--text)}
.page-header,.section-header,.site-card-title,.connections,.header-actions,.connection,.auth-actions{display:flex;align-items:center}
.page-header,.section-header{justify-content:space-between;gap:16px}.page-header h1{font-size:24px;margin:0 0 6px}.page-header p,.section p,.site-card-title p,.auth-panel p{color:var(--text-secondary);font-size:12px;margin:4px 0 0}.header-actions,.connections,.auth-actions,.connection{gap:10px}.connections{margin:24px 0;flex-wrap:wrap}.context{color:var(--text-muted);font-size:12px}.btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;border-radius:6px;padding:8px 12px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap}.btn:disabled{opacity:.5;cursor:not-allowed}.secondary{color:var(--text);background:var(--bg-elevated);border:1px solid var(--border)}.primary{color:white;background:var(--accent);border:1px solid var(--accent)}.text-button{color:var(--accent);background:none;border:0;cursor:pointer;font-size:12px}.connection-status{font-size:12px;color:var(--text);padding:8px 10px;border:1px solid var(--border);border-radius:6px}.dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--success);margin-right:4px}.site-card,.auth-panel,.empty-record{border:1px solid var(--border);background:var(--bg-panel);border-radius:8px}.site-card-title{padding:18px 20px;gap:12px;border-bottom:1px solid var(--border)}.site-card-title h2,.section h2{font-size:15px;margin:0}.site-icon{display:grid;place-items:center;width:38px;height:38px;border-radius:8px;color:var(--accent);background:var(--accent-muted)}.badge{margin-left:auto;color:var(--text-secondary);background:var(--bg-hover);border-radius:5px;padding:5px 8px;font-size:11px}.site-details{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;padding:20px}.site-details div{display:grid;gap:8px;font-size:12px}.site-details span{color:var(--text-secondary)}.site-details strong{font-weight:500}.section{margin-top:28px}.section-header{margin-bottom:14px}.empty-preview{height:200px;border:1px solid var(--border);border-radius:8px;background:var(--bg-panel);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:var(--text-secondary)}.empty-preview strong{color:var(--text);font-size:13px}.empty-record{padding:24px;text-align:center;color:var(--text-secondary);font-size:12px}.auth-panel{padding:16px;margin-bottom:16px}.auth-actions{margin-top:14px;flex-wrap:wrap}.auth-actions code{font-size:18px;letter-spacing:.1em;color:var(--text)}.notice{margin:0 0 16px;color:var(--text-secondary);font-size:12px}@media(max-width:700px){.site-page{padding:24px 18px}.page-header{align-items:flex-start}.site-details{grid-template-columns:1fr}.context{width:100%}}
.site-local{border-top:1px solid var(--border);padding:16px 20px;font-size:12px;color:var(--text-secondary)}.site-local p{margin:0 0 8px}.site-path{overflow-wrap:anywhere}.site-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.recreate-confirm{margin-top:14px;padding:12px;background:var(--bg-hover);border-radius:6px}
.local-panel{border:1px solid var(--border);background:var(--bg-panel);border-radius:8px;padding:4px 20px 18px;font-size:12px}.local-row{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:16px 0;border-bottom:1px solid var(--border)}.local-row .site-actions{margin:0}.local-row p,.inline-box p{margin-top:6px;color:var(--text-secondary);overflow-wrap:anywhere}.inline-box{margin-top:12px;padding:14px;border-radius:6px;background:var(--bg-hover)}.local-input{min-width:220px;flex:1;border:1px solid var(--border);border-radius:6px;background:var(--bg-elevated);color:var(--text);padding:8px}.local-panel details{margin-top:12px;color:var(--text-secondary)}.local-panel summary{cursor:pointer}.local-panel pre{max-height:240px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;background:var(--bg-hover);padding:10px;border-radius:6px;font-size:11px}
.publish-panel{margin:0 0 20px;padding:20px;border:1px solid var(--border);border-radius:8px;background:var(--bg-panel);font-size:12px}.publish-panel h2{font-size:15px;margin:0}.publish-panel p{color:var(--text-secondary)}.repo-list{display:grid;gap:6px;max-height:260px;overflow-y:auto;margin-top:14px}.repo-item{display:flex;justify-content:space-between;gap:12px;text-align:left;border:1px solid var(--border);background:var(--bg-elevated);color:var(--text);border-radius:6px;padding:10px;cursor:pointer}.repo-item.selected{border-color:var(--accent);background:var(--accent-muted)}.repo-item:disabled{opacity:.6;cursor:wait}
.publish-panel .notice{white-space:pre-wrap}.publish-panel details{margin-top:12px}.publish-panel summary{cursor:pointer}.publish-panel pre,.file-list{max-height:240px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;background:var(--bg-panel);padding:10px;border-radius:6px;font-size:11px}.file-list button{text-align:left;white-space:normal;overflow-wrap:anywhere}
</style>
