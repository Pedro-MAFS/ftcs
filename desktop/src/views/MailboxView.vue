<script setup lang="ts">
import { computed, onActivated, onDeactivated, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { Connection, Endpoint, MailAction, Snapshot } from '../../electron/mailbox/types'
import { key } from '../../electron/mailbox/types'
import { mailProvider, mailSetupQuestion } from '../components/mailbox/setup-help'
import { useWorkspace } from '../composables/useWorkspace'
import { useWorkspaceLayout } from '../composables/useWorkspaceLayout'
import { showToast } from '../composables/useToast'
import { RUNTIME_NOT_READY } from '../config/user-facing'

import MailConversations from '../components/mailbox/MailConversations.vue'
import Icon from '../components/shared/Icon.vue'
const route = useRoute(), router = useRouter()
const settingsOpen = ref(false)
const settingsDialog = ref<HTMLDialogElement>()
const helpDialog = ref<HTMLDialogElement>()
const helpInput = ref('')
const helpError = ref('')
const provider = computed(() => mailProvider(helpInput.value))
const { dialogueBusy, generating, pendingPermission, awaitingUserReply } = useWorkspace()
const { fill, agentCollapsed, exitFill, toggleAgentCollapsed } = useWorkspaceLayout()
const helpBusy = computed(() => dialogueBusy.value || generating.value || !!pendingPermission.value || !!awaitingUserReply.value)
const api = window.ftcs?.mailbox
const state = ref<Snapshot>()
const error = ref('')
const busy = ref(false)
const advanced = ref(false)
const editing = ref(false)
const chosen = ref('')
const confirmation = ref<MailAction>()
const protocols = ['imap', 'smtp'] as const
const endpoint = (host = '', port = 993, username = ''): Endpoint => ({
  host,
  port,
  username,
  security: 'tls',
})
const fresh = (): Connection => ({
  email: '',
  password: '',
  mode: 'last_30_days',
  imap: endpoint(),
  smtp: endpoint('', 465),
})
const form = ref(fresh())
const saved = computed(() => state.value?.accounts.find((a) => key(a.email) === key(form.value.email)))
const active = computed(() => state.value?.accounts.find((a) => a.id === state.value?.active))
function openHelp(email: string) {
  helpError.value = ''
  helpInput.value = mailProvider(email) || helpInput.value
  helpDialog.value?.showModal()
}
async function askForHelp() {
  if (!provider.value || helpBusy.value) return
  const send = window.ftcs?.sendAgentMessage
  if (!send) {
    helpError.value = RUNTIME_NOT_READY
    return
  }
  const question = mailSetupQuestion(provider.value)
  dialogueBusy.value = true
  try {
    helpDialog.value?.close()
    settingsDialog.value?.close()
    if (fill.value === 'main') exitFill()
    if (fill.value === 'none' && agentCollapsed.value) toggleAgentCollapsed()
    const result = await send(question)
    if (!result.ok || !result.accepted)
      showToast(result.message || '这次提问未发送，请稍后重试。', { tone: 'error' })
  } catch (e) {
    showToast(e instanceof Error ? e.message : RUNTIME_NOT_READY, { tone: 'error' })
  } finally {
    dialogueBusy.value = false
  }
}
watch(settingsDialog, dialog => { if (!dialog) settingsOpen.value = false })
watch([settingsDialog, () => route.name, () => route.query.settings], ([dialog, page, open]) => {
  if (dialog && page === 'mailbox' && open === '1') {
    settingsOpen.value = true
    dialog.showModal()
    const { settings: _, ...query } = route.query
    void router.replace({query})
  }
}, {flush: 'post'})
const presetHosts: Record<string, [string, string]> = {
  'gmail.com': ['imap.gmail.com', 'smtp.gmail.com'],
  'qq.com': ['imap.qq.com', 'smtp.qq.com'],
  '163.com': ['imap.163.com', 'smtp.163.com'],
  '126.com': ['imap.126.com', 'smtp.126.com'],
}
let configured = ''
function configure() {
  const email = form.value.email.trim()
  if (configured === email) return
  if (configured) form.value.password = ''
  configured = email
  if (saved.value) {
    for (const p of protocols) form.value[p] = { ...saved.value[p] }
    advanced.value = false
  } else {
    const hosts = presetHosts[email.split('@')[1]?.toLowerCase()]
    form.value.imap = endpoint(hosts?.[0], 993, email)
    form.value.smtp = endpoint(hosts?.[1], 465, email)
    advanced.value = !hosts
  }
}
function confirmDisconnect() {
  settingsDialog.value?.close()
  confirmation.value = { kind: 'disconnect' }
}
function reconnect(email: string) {
  form.value.password = ''
  editing.value = true
  form.value.email = email
  configured = ''
  configure()
}
function clearForm() {
  helpDialog.value?.close()
  helpInput.value = ''
  form.value = fresh()
  configured = ''
  advanced.value = false
  editing.value = false
  chosen.value = ''
  confirmation.value = undefined
}
watch(
  () => state.value?.context.root,
  (a, b) => {
    if (b && a !== b) {
      clearForm()
      error.value = ''
    }
  },
)
let sequence = 0
async function refresh() {
  const seq = ++sequence
  try {
    const next = await api?.snapshot()
    if (seq === sequence) state.value = next
  } catch (e) {
    if (seq === sequence) error.value = String(e)
  }
}
let unsubscribe: (() => void) | undefined
function listen() {
  if (!unsubscribe && api) {
    unsubscribe = api.changed(refresh)
    void refresh()
  }
}
function leave() {
  helpDialog.value?.close()
  settingsDialog.value?.close()
  unsubscribe?.()
  unsubscribe = undefined
  form.value.password = ''
  confirmation.value = undefined
  sequence++
}
onMounted(listen)
onActivated(listen)
onDeactivated(leave)
onUnmounted(leave)
async function act(action: MailAction) {
  if (!state.value || !api || busy.value) return
  busy.value = true
  error.value = ''
  try {
    await api.act({ ...state.value.context }, JSON.parse(JSON.stringify(action)))
    clearForm()
  } catch (e) {
    error.value = (e as Error).message.replace(/^Error invoking remote method '[^']+': Error: /, '')
    if (action.kind === 'connect') advanced.value = true
  } finally {
    busy.value = false
    confirmation.value = undefined
    await refresh()
  }
}
</script>

<template>
  <section class="mail-page" :class="{ connected: active && !editing }">
    <p v-if="error && active && !editing" role="alert">{{ error }}</p>
    <p v-if="!state">正在读取邮箱设置…</p>
    <template v-else-if="!active || editing">
      <div class="setup">
        <header class="setup-intro">
          <div class="setup-mark"><Icon name="message-square" :size="24" /></div>
          <div>
            <h1>像聊微信一样使用邮箱</h1>
            <p>连接邮箱后，和同一联系人的往来邮件会按时间排在一起。</p>
          </div>
        </header>
        <form class="setup-form" @submit.prevent="act({ kind: 'connect', form })">
          <h2>{{ saved ? '重新连接邮箱' : '连接邮箱' }}</h2>
          <label
            >邮箱地址<input
              v-model.trim="form.email"
              type="email"
              placeholder="name@example.com"
              autocomplete="email"
              required
              :readonly="!!active"
              @blur="configure"
          /></label>
          <div class="auth-field">
            <div class="auth-label">
              <label for="mail-auth-code">邮箱授权码</label>
              <button type="button" class="help-link" @click="openHelp(form.email)">如何获取授权码？</button>
            </div>
            <input id="mail-auth-code" v-model="form.password" type="password" placeholder="输入邮箱服务商生成的授权码" autocomplete="off" required />
          </div>
          <button class="server-toggle" type="button" :aria-expanded="advanced" @click="advanced = !advanced">
            <Icon name="sliders" :size="14" />服务器设置<Icon name="chevron-down" :size="14" />
          </button>
          <small v-if="!advanced && form.imap.host">{{ form.imap.host }} · {{ form.smtp.host }}</small>
          <div v-if="advanced" class="servers">
            <fieldset v-for="p in protocols" :key="p">
              <legend>{{ p === 'imap' ? 'IMAP 收信' : 'SMTP 发信' }}</legend>
              <label>服务器<input v-model.trim="form[p].host" required /></label>
              <label
                >端口<input v-model.number="form[p].port" type="number" min="1" max="65535" required
              /></label>
              <label
                >加密方式<select v-model="form[p].security">
                  <option value="tls">TLS</option>
                  <option value="starttls">STARTTLS</option>
                </select></label
              >
              <label>登录名<input v-model="form[p].username" required /></label>
            </fieldset>
          </div>
          <p v-if="saved">将从上次进度继续同步。</p>
          <fieldset v-else class="sync-options">
            <legend>同步范围</legend>
            <label class="choice"
              ><input v-model="form.mode" type="radio" value="last_30_days" />同步最近 30 天的邮件往来</label
            >
            <label class="choice"
              ><input v-model="form.mode" type="radio" value="from_connection" />仅同步今后的邮件</label
            >
          </fieldset>
          <p v-if="error" class="setup-error" role="alert">{{ error }}</p>
          <div class="setup-actions">
            <button class="primary" :disabled="busy">{{ busy ? '正在验证收信和发信…' : '连接邮箱' }}</button>
            <button v-if="editing" type="button" :disabled="busy" @click="clearForm">取消</button>
          </div>
        </form>
        <section v-if="!active && state.accounts.length" class="saved-accounts">
          <h2>本机保留的邮箱</h2>
          <div v-for="a in state.accounts" :key="a.id" class="row">
            {{ a.email }}
            <button :disabled="busy" @click="reconnect(a.email)">重新连接</button>
            <button :disabled="busy" @click="confirmation = { kind: 'delete', id: a.id }">删除本地数据</button>
          </div>
        </section>
      </div>
    </template>
    <template v-else>
      <dialog ref="settingsDialog" @close="settingsOpen = false" class="settings-dialog" aria-labelledby="mail-settings-title">
        <header>
          <h2 id="mail-settings-title">邮箱设置</h2>
          <button autofocus @click="settingsDialog?.close()">关闭</button>
        </header>
        <p>{{ active.email }}</p>
        <button type="button" class="help-link" @click="openHelp(active.email)">如何获取授权码？</button>
        <label class="choice"><input type="checkbox" :checked="active.notifications !== false" :disabled="busy"
          @change="act({kind: 'notifications', account: active.id, enabled: ($event.target as HTMLInputElement).checked})" />
          桌面新邮件通知</label>
        <div v-for="f in state.folders" :key="f.role" class="row">
          <strong>{{ f.role === 'inbox' ? '收件箱' : '已发送' }}</strong>
          <span>{{
            f.error || (!f.path ? '待选择文件夹' : f.phase === 'incremental' ? '已同步' : '正在导入')
          }}</span>
        </div>
        <div
          v-if="state.folders.some((f) => f.role === 'sent' && !f.path) && state.candidates.length"
          class="row"
        >
          <label
            >已发送文件夹<select v-model="chosen">
              <option disabled value="">选择文件夹</option>
              <option v-for="f in state.candidates" :key="f">{{ f }}</option>
            </select></label
          >
          <button :disabled="busy || !chosen" @click="act({ kind: 'bind', path: chosen })">保存选择</button>
        </div>
        <div class="row">
          <button :disabled="busy || state.running" @click="act({ kind: 'retry' })">
            {{ state.running ? '同步中…' : '重新同步' }}
          </button>
          <button @click="reconnect(active.email)">重新验证</button
          ><button
            @click="confirmDisconnect"
          >
            取消托管
          </button>
        </div>
      </dialog>
      <MailConversations
        :key="JSON.stringify([state.context.root, state.context.generation, active.id])"
        :account="active.id"
        :snapshot="state"
        :busy="busy"
        :covered="settingsOpen || !!confirmation"
        @settings="settingsOpen = true; settingsDialog?.showModal()"
        @navigate="settingsDialog?.close(); confirmation = undefined"
        @sync="act({ kind: 'retry' })"
      />
    </template>
    <dialog ref="helpDialog" class="settings-dialog help-dialog" aria-labelledby="mail-help-title">
      <form @submit.prevent="askForHelp">
        <h2 id="mail-help-title">如何获取邮箱授权码？</h2>
        <label>邮箱服务商或邮箱地址
          <input v-model="helpInput" autofocus required maxlength="254" placeholder="例如 QQ、Google 或 name@company.com" />
        </label>
        <small>智能体会说明具体步骤。填写邮箱地址时，只会发送域名。</small>
        <p v-if="helpInput.trim() && !provider" role="alert">请填写服务商名称或完整邮箱地址。</p>
        <p v-if="helpBusy" role="status">请等智能体完成当前回复或任务后再提问。</p>
        <p v-if="helpError" role="alert">{{ helpError }}</p>
        <div class="row">
          <button type="button" @click="helpDialog?.close()">取消</button>
          <button class="primary" :disabled="!provider || helpBusy">向智能体提问</button>
        </div>
      </form>
    </dialog>
    <div v-if="confirmation" class="confirm" role="alertdialog">
      <strong>{{
        confirmation.kind === 'disconnect'
          ? '取消托管 ' + active?.email
          : '删除 ' +
            state?.accounts.find((a) => confirmation?.kind === 'delete' && a.id === confirmation.id)?.email +
            ' 的本地数据'
      }}</strong>
      <p>
        {{
          confirmation.kind === 'disconnect'
            ? '将停止收发并移除授权码，邮件和草稿保留在本机。'
            : '该邮箱在本机的邮件、附件和草稿将被清除。服务器邮件保留。'
        }}
      </p>
      <button :disabled="busy" @click="confirmation = undefined">返回</button>
      <button :disabled="busy" @click="act(confirmation)">确认</button>
    </div>
  </section>
</template>
<style scoped>
.mail-page.connected {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  padding: 0;
}
.settings-dialog {
  width: min(420px, 90vw);
  color: var(--text);
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 20px;
}
.settings-dialog[open] {
  display: grid;
  gap: 14px;
}
.settings-dialog header {
  justify-content: space-between;
}
.settings-dialog::backdrop {
  background: rgb(0 0 0 / 42%);
}
.connected .confirm {
  position: absolute;
  z-index: 2;
  inset: 50% auto auto 50%;
  transform: translate(-50%, -50%);
  margin: 0;
  width: min(380px, 90%);
}

.mail-page {
  height: 100%;
  overflow: auto;
  padding: 20px 26px;
  color: var(--text);
  background: var(--bg-app);
}
.mail-page:not(.connected) {
  container-type: inline-size;
  padding: 0;
}
.setup {
  width: min(100%, 610px);
  margin: auto;
  padding: clamp(18px, 5cqw, 38px) clamp(12px, 4cqw, 28px);
}
.setup-intro {
  flex-wrap: nowrap;
  gap: 14px;
  border: 0;
  padding: 0;
}
.setup-mark {
  display: grid;
  flex: none;
  place-items: center;
  width: 46px;
  height: 46px;
  border-radius: 14px;
  color: var(--accent);
  background: var(--accent-muted);
}
.setup-intro h1 {
  font-size: clamp(20px, 4.5cqw, 28px);
  line-height: 1.3;
}
.setup-intro p {
  margin-top: 4px;
  color: var(--text-secondary);
}
.setup .setup-form, .saved-accounts {
  display: grid;
  gap: 15px;
  margin: 20px 0 0;
  padding: clamp(14px, 3.5cqw, 24px);
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: 12px;
}
.setup-form input:not([type='radio']), .setup-form select {
  min-height: 36px;
  width: 100%;
}
.setup-form .auth-label { justify-content: space-between; flex-wrap: wrap; gap: 4px 12px; }
.setup-form .server-toggle {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 4px 0;
  border: 0;
  color: var(--text-secondary);
  background: transparent;
}
.server-toggle[aria-expanded='true'] svg:last-child { transform: rotate(180deg); }
.setup-form .servers { grid-template-columns: repeat(auto-fit, minmax(min(100%, 175px), 1fr)); }
.sync-options {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 174px), 1fr));
  gap: 8px;
  border: 0;
  margin: 0;
  padding: 0;
}
.sync-options legend { padding: 0 0 6px; font-size: 13px; }
.sync-options .choice {
  flex-wrap: nowrap;
  gap: 8px;
  margin: 0;
  padding: 9px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.sync-options .choice:has(:checked) {
  border-color: var(--accent);
  background: var(--accent-muted);
}
.sync-options input { margin: 0; accent-color: var(--accent); }
.setup-actions { display: flex; gap: 8px; }
.setup-form .setup-error { margin: 0; color: var(--danger); overflow-wrap: anywhere; }
.setup-actions .primary { flex: 1; min-height: 38px; font-weight: 600; }
.saved-accounts .row { overflow-wrap: anywhere; }
header,
.row,
.choice {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
header {
  border-bottom: 1px solid var(--border);
  padding-bottom: 14px;
}
h1,
h2,
p {
  margin: 0;
}
h1 {
  font-size: 20px;
}
h2 {
  font-size: 16px;
}
form,
.mail-page > section,
.confirm {
  max-width: 640px;
  display: grid;
  gap: 14px;
  margin: 20px 0;
  padding: 18px;
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: 8px;
}
label {
  display: grid;
  gap: 5px;
  font-size: 13px;
}
.choice {
  margin: 6px 0;
}
.servers {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(175px, 1fr));
  gap: 10px;
}
fieldset {
  min-width: 0;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 10px;
}
fieldset label + label {
  margin-top: 7px;
}
input,
select,
button {
  font: inherit;
  color: var(--text);
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 7px 10px;
  min-width: 0;
}
button {
  cursor: pointer;
  justify-self: start;
  background: var(--bg-elevated);
}
button:disabled {
  opacity: 0.55;
}
button.primary {
  background: var(--accent-hover);
  color: white;
}
.auth-field {
  display: grid;
  gap: 5px;
}
.auth-label {
  display: flex;
  align-items: baseline;
  gap: 12px;
}
.help-link {
  padding: 0;
  border: 0;
  color: var(--accent);
  background: transparent;
  font-size: 13px;
}
.help-link:hover {
  text-decoration: underline;
}
.help-dialog form {
  margin: 0;
  padding: 0;
  border: 0;
}
.help-dialog .row {
  justify-content: flex-end;
}
small,
header span,
.row span {
  color: var(--text-secondary);
}
.row,
.contact {
  padding: 6px 0;
}
.confirm {
  border-color: var(--accent);
}
[role='alert'] {
  margin-top: 12px;
  color: var(--text);
}
</style>
