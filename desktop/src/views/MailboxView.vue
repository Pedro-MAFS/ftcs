<script setup lang="ts">
import { computed, onActivated, onDeactivated, onMounted, onUnmounted, ref, watch } from 'vue'
import type { Connection, Endpoint, MailAction, Snapshot } from '../../electron/mailbox/types'
import { key } from '../../electron/mailbox/types'

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
function reconnect(email: string) {
  form.value.password = ''
  editing.value = true
  form.value.email = email
  configured = ''
  configure()
}
function clearForm() {
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
  <section class="mail-page">
    <header>
      <h1>邮箱</h1>
      <span v-if="active">{{ active.email }}</span>
    </header>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="!state">正在读取邮箱设置…</p>
    <template v-else-if="!active || editing">
      <form @submit.prevent="act({ kind: 'connect', form })">
        <h2>{{ saved ? '重新连接邮箱' : '连接邮箱' }}</h2>
        <label
          >邮箱地址<input
            v-model.trim="form.email"
            type="email"
            required
            :readonly="!!active"
            @blur="configure"
        /></label>
        <label>邮箱授权码<input v-model="form.password" type="password" autocomplete="off" required /></label>
        <button type="button" :aria-expanded="advanced" @click="advanced = !advanced">
          服务器设置 {{ advanced ? '▴' : '▾' }}
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
        <fieldset v-else>
          <legend>同步范围</legend>
          <label class="choice"
            ><input v-model="form.mode" type="radio" value="last_30_days" />同步最近 30 天的邮件往来</label
          >
          <label class="choice"
            ><input v-model="form.mode" type="radio" value="from_connection" />仅同步今后的邮件</label
          >
        </fieldset>
        <div>
          <button class="primary" :disabled="busy">{{ busy ? '正在验证收信和发信…' : '连接邮箱' }}</button>
          <button v-if="editing" type="button" :disabled="busy" @click="clearForm">取消</button>
        </div>
      </form>
      <section v-if="!active && state.accounts.length">
        <h2>本机保留的邮箱</h2>
        <div v-for="a in state.accounts" :key="a.id" class="row">
          {{ a.email }}
          <button :disabled="busy" @click="reconnect(a.email)">重新连接</button>
          <button :disabled="busy" @click="confirmation = { kind: 'delete', id: a.id }">删除本地数据</button>
        </div>
      </section>
    </template>
    <template v-else>
      <section>
        <h2>连接与同步</h2>
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
          ><button @click="confirmation = { kind: 'disconnect' }">取消托管</button>
        </div>
      </section>
      <section>
        <h2>
          邮件往来 <small>{{ state.imported }} 封</small>
        </h2>
        <p v-if="!state.contacts.length">{{ state.running ? '正在检查邮件…' : '暂无往来联系人' }}</p>
        <div v-for="email in state.contacts" :key="email" class="contact">{{ email }}</div>
      </section>
    </template>
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
.mail-page {
  height: 100%;
  overflow: auto;
  padding: 20px 26px;
  color: var(--text);
  background: var(--bg-app);
}
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
