<script setup lang="ts">
import { computed, onActivated, onMounted, onUnmounted, ref } from 'vue'
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
    if (request === siteRequest) { site.value = state; confirmRecreate.value = false; await refreshSiteRuntime() }
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
function publish() {
  if (!connected.value || !cfConnected.value) {
    const missing = [!connected.value ? 'GitHub' : '', !cfConnected.value ? 'Cloudflare' : ''].filter(Boolean).join(' 和 ')
    message.value = `发布前请先连接 ${missing}。`
  } else message.value = '发布功能将在后续开发中提供。'
}
onMounted(() => { removeRuntimeListener = window.ftcs?.onSiteRuntime?.(applySiteRuntime); void refreshAll(); window.addEventListener('focus', refreshSite) })
onActivated(() => { void refreshSite() })
onUnmounted(() => { removeRuntimeListener?.(); siteRequest++; window.removeEventListener('focus', refreshSite); cfAttempt++; attempt++; if (timer) clearTimeout(timer); void window.ftcs?.cancelGithubAuth?.(); void window.ftcs?.cancelCloudflareAuth?.() })
</script>

<template>
  <div class="site-page">
    <header class="page-header"><div><h1>独立站</h1><p>创建、预览并发布属于你的品牌网站</p></div><div class="header-actions"><button class="btn secondary" type="button" @click="refreshAll"><Icon name="refresh-cw" /> 刷新</button><button class="btn primary" type="button" @click="publish">发布网站</button></div></header>
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
    <section class="site-card">
      <div class="site-card-title"><div class="site-icon"><Icon name="globe" :size="20" /></div><div><h2>工作区独立站</h2><p>一个工作区对应一个全局站点</p></div><span class="badge">{{ siteLabel }}</span></div>
      <div class="site-details"><div><span>线上地址</span><strong>尚未发布</strong></div><div><span>最近发布</span><strong>—</strong></div><div><span>本地站点</span><strong>{{ siteLabel }}</strong></div></div>
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
    <section class="section"><div class="section-header"><div><h2>发布记录</h2><p>查看网站发布和部署状态</p></div></div><div class="empty-record">暂无发布记录</div></section>
  </div>
</template>

<style scoped>
.site-page{width:100%;flex:1;min-height:0;overflow-y:auto;max-width:1100px;margin:0 auto;padding:32px 36px 56px;color:var(--text)}
.page-header,.section-header,.site-card-title,.connections,.header-actions,.connection,.auth-actions{display:flex;align-items:center}
.page-header,.section-header{justify-content:space-between;gap:16px}.page-header h1{font-size:24px;margin:0 0 6px}.page-header p,.section p,.site-card-title p,.auth-panel p{color:var(--text-secondary);font-size:12px;margin:4px 0 0}.header-actions,.connections,.auth-actions,.connection{gap:10px}.connections{margin:24px 0;flex-wrap:wrap}.context{color:var(--text-muted);font-size:12px}.btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;border-radius:6px;padding:8px 12px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap}.btn:disabled{opacity:.5;cursor:not-allowed}.secondary{color:var(--text);background:var(--bg-elevated);border:1px solid var(--border)}.primary{color:white;background:var(--accent);border:1px solid var(--accent)}.text-button{color:var(--accent);background:none;border:0;cursor:pointer;font-size:12px}.connection-status{font-size:12px;color:var(--text);padding:8px 10px;border:1px solid var(--border);border-radius:6px}.dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--success);margin-right:4px}.site-card,.auth-panel,.empty-record{border:1px solid var(--border);background:var(--bg-panel);border-radius:8px}.site-card-title{padding:18px 20px;gap:12px;border-bottom:1px solid var(--border)}.site-card-title h2,.section h2{font-size:15px;margin:0}.site-icon{display:grid;place-items:center;width:38px;height:38px;border-radius:8px;color:var(--accent);background:var(--accent-muted)}.badge{margin-left:auto;color:var(--text-secondary);background:var(--bg-hover);border-radius:5px;padding:5px 8px;font-size:11px}.site-details{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;padding:20px}.site-details div{display:grid;gap:8px;font-size:12px}.site-details span{color:var(--text-secondary)}.site-details strong{font-weight:500}.section{margin-top:28px}.section-header{margin-bottom:14px}.empty-preview{height:200px;border:1px solid var(--border);border-radius:8px;background:var(--bg-panel);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:var(--text-secondary)}.empty-preview strong{color:var(--text);font-size:13px}.empty-record{padding:24px;text-align:center;color:var(--text-secondary);font-size:12px}.auth-panel{padding:16px;margin-bottom:16px}.auth-actions{margin-top:14px;flex-wrap:wrap}.auth-actions code{font-size:18px;letter-spacing:.1em;color:var(--text)}.notice{margin:0 0 16px;color:var(--text-secondary);font-size:12px}@media(max-width:700px){.site-page{padding:24px 18px}.page-header{align-items:flex-start}.site-details{grid-template-columns:1fr}.context{width:100%}}
.site-local{border-top:1px solid var(--border);padding:16px 20px;font-size:12px;color:var(--text-secondary)}.site-local p{margin:0 0 8px}.site-path{overflow-wrap:anywhere}.site-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.recreate-confirm{margin-top:14px;padding:12px;background:var(--bg-hover);border-radius:6px}
.local-panel{border:1px solid var(--border);background:var(--bg-panel);border-radius:8px;padding:4px 20px 18px;font-size:12px}.local-row{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:16px 0;border-bottom:1px solid var(--border)}.local-row .site-actions{margin:0}.local-row p,.inline-box p{margin-top:6px;color:var(--text-secondary);overflow-wrap:anywhere}.inline-box{margin-top:12px;padding:14px;border-radius:6px;background:var(--bg-hover)}.local-input{min-width:220px;flex:1;border:1px solid var(--border);border-radius:6px;background:var(--bg-elevated);color:var(--text);padding:8px}.local-panel details{margin-top:12px;color:var(--text-secondary)}.local-panel summary{cursor:pointer}.local-panel pre{max-height:240px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;background:var(--bg-hover);padding:10px;border-radius:6px;font-size:11px}
</style>
