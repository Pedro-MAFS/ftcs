<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import Icon from '../components/shared/Icon.vue'
defineOptions({ name: 'SiteView' })
const connected = ref(false)
const login = ref('')
const authorized = ref(false)
const installUrl = ref('')
const busy = ref(false)
const code = ref('')
const message = ref('')
const deviceUrl = 'https://github.com/login/device'
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
  message.value = connected.value ? '发布前请先连接 Cloudflare；发布功能将在后续开发中提供。' : '发布前请先连接 GitHub 和 Cloudflare。'
}
onMounted(() => { void refresh() })
onUnmounted(() => { attempt++; if (timer) clearTimeout(timer); void window.ftcs?.cancelGithubAuth?.() })
</script>

<template>
  <div class="site-page">
    <header class="page-header"><div><h1>独立站</h1><p>创建、预览并发布属于你的品牌网站</p></div><div class="header-actions"><button class="btn secondary" type="button" @click="refresh"><Icon name="refresh-cw" /> 刷新</button><button class="btn primary" type="button" @click="publish">发布网站</button></div></header>
    <div class="connections" aria-label="账号连接">
      <div class="connection"><button v-if="!connected && !authorized" class="btn secondary" type="button" :disabled="busy" @click="connect"><Icon name="plus" /> {{ busy ? '正在连接 GitHub' : '连接 GitHub' }}</button><template v-else><span class="connection-status"><span class="dot" /> GitHub · {{ login }} · {{ connected ? '已连接' : '待完成安装' }}</span><button v-if="installUrl" class="text-button" type="button" @click="openInstall">安装 GitHub App</button><button class="text-button" type="button" @click="disconnect">断开</button></template></div>
      <button class="btn secondary" type="button" @click="message = 'Cloudflare 连接将在后续开发中提供。'"><Icon name="plus" /> 连接 Cloudflare</button>
      <span class="context">当前工作区的站点连接</span>
    </div>
    <div v-if="code" class="auth-panel" role="status"><div><strong>在 GitHub 完成授权</strong><p>在浏览器输入下方授权码，并按 GitHub 提示选择账号和授权范围。</p></div><div class="auth-actions"><code>{{ code }}</code><button class="btn secondary" type="button" @click="copyCode">复制</button><button class="btn secondary" type="button" @click="openDevice">打开 GitHub</button><button class="text-button" type="button" @click="cancel">取消</button></div><p>等待 GitHub 确认授权…</p></div>
    <p v-if="message" class="notice" role="status">{{ message }}</p>
    <section class="site-card"><div class="site-card-title"><div class="site-icon"><Icon name="globe" :size="20" /></div><div><h2>工作区独立站</h2><p>一个工作区对应一个全局站点</p></div><span class="badge">尚未创建</span></div><div class="site-details"><div><span>线上地址</span><strong>尚未发布</strong></div><div><span>最近发布</span><strong>—</strong></div><div><span>本地站点</span><strong>尚未创建</strong></div></div></section>
    <section class="section"><div class="section-header"><div><h2>本地预览</h2><p>在发布前查看当前工作区的网站</p></div><button class="btn secondary" type="button" disabled>打开预览</button></div><div class="empty-preview"><Icon name="globe" :size="28" /><strong>还没有站点</strong><p>站点创建功能将在后续开发中提供。</p></div></section>
    <section class="section"><div class="section-header"><div><h2>发布记录</h2><p>查看网站发布和部署状态</p></div></div><div class="empty-record">暂无发布记录</div></section>
  </div>
</template>

<style scoped>
.site-page{width:100%;flex:1;min-height:0;overflow-y:auto;max-width:1100px;margin:0 auto;padding:32px 36px 56px;color:var(--text)}
.page-header,.section-header,.site-card-title,.connections,.header-actions,.connection,.auth-actions{display:flex;align-items:center}
.page-header,.section-header{justify-content:space-between;gap:16px}.page-header h1{font-size:24px;margin:0 0 6px}.page-header p,.section p,.site-card-title p,.auth-panel p{color:var(--text-secondary);font-size:12px;margin:4px 0 0}.header-actions,.connections,.auth-actions,.connection{gap:10px}.connections{margin:24px 0;flex-wrap:wrap}.context{color:var(--text-muted);font-size:12px}.btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;border-radius:6px;padding:8px 12px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap}.btn:disabled{opacity:.5;cursor:not-allowed}.secondary{color:var(--text);background:var(--bg-elevated);border:1px solid var(--border)}.primary{color:white;background:var(--accent);border:1px solid var(--accent)}.text-button{color:var(--accent);background:none;border:0;cursor:pointer;font-size:12px}.connection-status{font-size:12px;color:var(--text);padding:8px 10px;border:1px solid var(--border);border-radius:6px}.dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--success);margin-right:4px}.site-card,.auth-panel,.empty-record{border:1px solid var(--border);background:var(--bg-panel);border-radius:8px}.site-card-title{padding:18px 20px;gap:12px;border-bottom:1px solid var(--border)}.site-card-title h2,.section h2{font-size:15px;margin:0}.site-icon{display:grid;place-items:center;width:38px;height:38px;border-radius:8px;color:var(--accent);background:var(--accent-muted)}.badge{margin-left:auto;color:var(--text-secondary);background:var(--bg-hover);border-radius:5px;padding:5px 8px;font-size:11px}.site-details{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;padding:20px}.site-details div{display:grid;gap:8px;font-size:12px}.site-details span{color:var(--text-secondary)}.site-details strong{font-weight:500}.section{margin-top:28px}.section-header{margin-bottom:14px}.empty-preview{height:200px;border:1px solid var(--border);border-radius:8px;background:var(--bg-panel);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:var(--text-secondary)}.empty-preview strong{color:var(--text);font-size:13px}.empty-record{padding:24px;text-align:center;color:var(--text-secondary);font-size:12px}.auth-panel{padding:16px;margin-bottom:16px}.auth-actions{margin-top:14px;flex-wrap:wrap}.auth-actions code{font-size:18px;letter-spacing:.1em;color:var(--text)}.notice{margin:0 0 16px;color:var(--text-secondary);font-size:12px}@media(max-width:700px){.site-page{padding:24px 18px}.page-header{align-items:flex-start}.site-details{grid-template-columns:1fr}.context{width:100%}}
</style>
