<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{ root: string; accountId: string; project: string }>()
type Data = Extract<Awaited<ReturnType<NonNullable<Window['ftcs']>['listSiteDomains']>>, { ok: true }>['value']
type Domain = Data['domains'][number]
const data = ref<Data | null>(null)
const busy = ref(false)
const error = ref('')
const note = ref('')
const open = ref(false)
const name = ref('')
const kind = ref<'root' | 'subdomain' | ''>('')
const selected = ref<Domain | null>(null)
const checkedAt = ref('')
const showRetry = ref(false)
let sequence = 0
const current = () => `${props.root}\0${props.accountId}\0${props.project}`
function label(status: string): string {
  return ({ initializing: '初始化中', pending: '验证中', active: 'Cloudflare 已激活', deactivated: '未启用', blocked: '已阻止', error: '验证异常' } as Record<string, string>)[status] || '状态待确认'
}
async function refresh() {
  if (!window.ftcs || !props.root || !props.accountId || !props.project || busy.value) return
  const context = current(), request = ++sequence
  busy.value = true; error.value = ''; showRetry.value = false
  try {
    const result = await window.ftcs.listSiteDomains(props.root)
    if (request !== sequence || context !== current()) return
    if (!result.ok) { error.value = result.message; return }
    if (result.value.accountId !== props.accountId || result.value.project !== props.project) { error.value = 'Cloudflare 账号或项目已变化，请刷新页面。'; return }
    data.value = result.value; checkedAt.value = new Date().toLocaleString()
    if (selected.value) selected.value = result.value.domains.find(item => item.name === selected.value?.name) || selected.value
    showRetry.value = !!result.value.pending && !result.value.domains.some(item => item.name === result.value.pending?.name)
  } catch { if (request === sequence) error.value = '无法查询 Cloudflare 域名列表，请重试。' }
  finally { if (request === sequence) busy.value = false }
}
async function add() {
  if (!window.ftcs || busy.value || !name.value.trim() || !kind.value) return
  const context = current(), request = ++sequence
  busy.value = true; error.value = ''; note.value = ''; selected.value = null
  try {
    const result = await window.ftcs.addSiteDomain(props.root, name.value, kind.value)
    if (request !== sequence || context !== current()) return
    if (result.ok) { selected.value = result.value.domain; name.value = result.value.domain.name; note.value = '域名已添加；是否生效以 Cloudflare 状态为准。' }
    else error.value = result.message
  } catch { if (request === sequence) error.value = '添加结果待确认，请刷新域名列表后再操作。' }
  finally { if (request === sequence) busy.value = false }
  if (request === sequence && context === current()) {
    const addError = error.value
    await refresh()
    if (addError && context === current()) error.value = addError
  }
}
async function check() {
  if (!window.ftcs || !selected.value || busy.value) return
  const context = current(), request = ++sequence, domainName = selected.value.name
  busy.value = true; error.value = ''
  try {
    const result = await window.ftcs.checkSiteDomain(props.root, domainName)
    if (request !== sequence || context !== current()) return
    if (result.ok) { selected.value = result.value; checkedAt.value = new Date().toLocaleString(); if (data.value) data.value.domains = data.value.domains.map(item => item.name === domainName ? result.value : item) }
    else error.value = result.message
  } catch { if (request === sequence) error.value = '无法检查域名状态，请重试。' }
  finally { if (request === sequence) busy.value = false }
}
async function retryPending() {
  if (!window.ftcs || busy.value || !data.value?.pending) return
  const context = current(), request = ++sequence
  busy.value = true; error.value = ''
  try {
    const result = await window.ftcs.clearPendingSiteDomain(props.root)
    if (request !== sequence || context !== current()) return
    if (!result.ok) error.value = result.message
    else note.value = '已确认本次列表中没有该域名，可以重新添加。'
  } catch { if (request === sequence) error.value = '无法检查待确认状态，请重试。' }
  finally { if (request === sequence) busy.value = false }
  if (request === sequence && context === current()) {
    const retryError = error.value
    await refresh()
    if (retryError && context === current()) error.value = retryError
  }
}
function showDomain(domain: Domain) { selected.value = domain; name.value = domain.name; kind.value = ''; open.value = true; error.value = ''; note.value = '' }
async function openDomain(domain: Domain) { if (domain.status === 'active' && /^[a-z0-9.-]+$/.test(domain.name)) await window.ftcs?.openExternal(`https://${domain.name}`) }
async function connectDns() {
  if (!window.ftcs) return
  const account = /^[a-f0-9]{32}$/i.test(props.accountId) ? `/${props.accountId}` : ''
  await window.ftcs.openExternal(`https://dash.cloudflare.com${account}`)
}
async function copy(value: string) { try { await navigator.clipboard.writeText(value); note.value = '已复制。' } catch { note.value = '无法复制，请手动复制。' } }
watch(() => [props.root, props.accountId, props.project], () => { sequence++; data.value = null; busy.value = false; selected.value = null; open.value = false; error.value = ''; note.value = ''; checkedAt.value = ''; showRetry.value = false; void refresh() }, { immediate: true })
</script>

<template>
  <div class="inline-box">
    <div class="section-header"><div><strong>自有域名</strong><p>Cloudflare Pages · {{ project }}<span v-if="data?.subdomain"> · {{ data.subdomain }}</span></p></div><div class="site-actions"><button class="btn secondary" :disabled="busy" @click="refresh">刷新列表</button><button class="btn primary" :disabled="busy" @click="open = true; selected = null; name = ''; kind = ''; error = ''; note = ''">添加域名</button></div></div>
    <p v-if="error" role="alert">{{ error }}</p><p v-if="checkedAt">最近检查：{{ checkedAt }}</p>
    <p v-if="data && !data.domains.length">尚未添加自有域名。</p>
    <div v-for="domain in data?.domains" :key="domain.name" class="local-row"><div><strong>{{ domain.name }}</strong><p>{{ label(domain.status) }}<span v-if="domain.validation?.error"> · {{ domain.validation.error }}</span><span v-if="domain.verification?.error"> · {{ domain.verification.error }}</span></p></div><div class="site-actions"><button class="btn secondary" @click="showDomain(domain)">查看配置</button><button class="btn secondary" :disabled="busy" @click="showDomain(domain); check()">检查配置</button><button v-if="domain.status === 'active'" class="btn secondary" @click="openDomain(domain)">打开网站</button></div></div>
    <div v-if="data?.pending" class="inline-box"><strong>域名 {{ data.pending.name }} 的添加结果待确认</strong><p>请先刷新列表或到 Cloudflare 控制台检查；确认不存在后可重新添加。</p><button v-if="showRetry" class="btn secondary" :disabled="busy" @click="retryPending">我已检查，允许重新添加</button></div>
    <Teleport to="body"><div v-if="open" class="domain-overlay" @keydown.esc="!busy && (open = false)"><div class="domain-dialog" role="dialog" aria-modal="true" aria-label="自有域名配置">
      <strong>{{ selected ? '域名配置' : '添加自有域名' }}</strong>
      <template v-if="!selected"><p>填写完整域名，并选择域名类型。</p><div class="site-actions"><input v-model="name" class="local-input" placeholder="www.example.com" aria-label="完整域名" :disabled="busy" /><select v-model="kind" class="local-input" :disabled="busy"><option value="" disabled>选择域名类型</option><option value="subdomain">子域名，例如 www.example.com</option><option value="root">根域名，例如 example.com</option></select><button class="btn primary" :disabled="busy || !name.trim() || !kind || !!data?.pending" @click="add">添加域名</button></div></template>
      <p v-else><label>选择域名类型以查看指引： <select v-model="kind" class="local-input"><option value="" disabled>选择域名类型</option><option value="subdomain">子域名</option><option value="root">根域名</option></select></label></p>
      <p v-if="error" role="alert">{{ error }}</p><p v-if="note" role="status">{{ note }}</p>
      <template v-if="kind === 'root'"><p>根域名需要先接入当前 Cloudflare 账号的 DNS。请在 Cloudflare 添加域名、核对已有 DNS 记录，再到注册商按 Cloudflare 提供的地址修改 nameserver。域名可继续在原注册商续费。</p><p>返回后，如添加未成功，请重新添加；已添加的域名可在列表检查状态。</p><button class="btn primary" @click="connectDns">去连接域名</button></template>
      <template v-else-if="selected"><p>请在当前 DNS 服务商添加以下记录（部分服务商只需填写主机记录部分）：</p><p>类型：CNAME</p><p>名称：{{ selected.name }} <button class="text-button" @click="copy(selected.name)">复制</button></p><p>记录值：{{ data?.subdomain || '请刷新列表确认' }} <button v-if="data?.subdomain" class="text-button" @click="copy(data.subdomain)">复制</button></p><p>同名记录存在时请先核对现有业务，FTCS 不会修改 DNS。</p></template>
      <template v-if="selected"><p>Cloudflare 状态：{{ label(selected.status) }}</p><p v-if="selected.validation?.status">验证状态：{{ selected.validation.status }} {{ selected.validation.error }}</p><p v-if="selected.verification?.status">所有权状态：{{ selected.verification.status }} {{ selected.verification.error }}</p><template v-if="selected.validation?.method === 'txt' && selected.validation.txtName && selected.validation.txtValue"><p>TXT 名称：{{ selected.validation.txtName }} <button class="text-button" @click="copy(selected.validation.txtName!)">复制</button></p><p>TXT 值：{{ selected.validation.txtValue }} <button class="text-button" @click="copy(selected.validation.txtValue!)">复制</button></p></template><p v-if="selected.status === 'active'">Cloudflare 已激活；各地 DNS 生效情况可能不同。默认模板如需 sitemap，请设置 SITE_URL 并重新构建。</p><button v-if="kind === 'subdomain'" class="btn secondary" :disabled="busy" @click="check">检查配置</button></template>
      <button class="btn secondary" :disabled="busy" @click="open = false">关闭</button>
    </div></div></Teleport>
  </div>
</template>

<style scoped>
.domain-overlay { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 24px; background: rgba(0, 0, 0, .45); }
.domain-dialog { width: min(620px, 100%); max-height: 90vh; overflow-y: auto; border-radius: 12px; padding: 24px; background: var(--surface, #fff); color: var(--text, #242424); box-shadow: 0 16px 48px rgba(0, 0, 0, .22); }
</style>
