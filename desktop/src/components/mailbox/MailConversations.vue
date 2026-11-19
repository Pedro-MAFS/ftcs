<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import {
  key,
  type Conversation,
  type MessageView,
  type Snapshot,
  type TimelineCursor,
} from '../../../electron/mailbox/types'
const props = defineProps<{ snapshot: Snapshot; account: string }>()
const api = window.ftcs!.mailbox
const contacts = ref<Conversation[]>([]),
  selected = ref(''),
  temporary = ref('')
const current = computed(() => contacts.value.find((c) => c.id === selected.value))
const messages = ref<MessageView[]>([]),
  before = ref<TimelineCursor | null>(null)
const listing = ref(true),
  reading = ref(false),
  listError = ref(''),
  readError = ref('')
const compose = ref(false),
  address = ref(''),
  scroller = ref<HTMLElement>(),
  newMail = ref(false)
let listRequest = 0,
  pageRequest = 0
const clock = (date: string) => new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const day = (date: string) => new Date(date).toLocaleDateString()
function bottom() {
  const el = scroller.value
  if (el) el.scrollTop = el.scrollHeight
  newMail.value = false
}
function visibleAnchor() {
  const el = scroller.value
  if (!el) return
  const top = el.getBoundingClientRect().top
  for (const row of el.querySelectorAll<HTMLElement>('[data-message]')) {
    if (row.getBoundingClientRect().bottom >= top)
      return { row: row.dataset.message, offset: row.getBoundingClientRect().top - top }
  }
}
async function load(mode: 'open' | 'older' | 'update') {
  const contact = selected.value
  if (!contact) return
  const request = ++pageRequest
  const ctx = { ...props.snapshot.context },
    account = props.account
  const earliest = messages.value[0]
  const newest = messages.value.at(-1)?.id
  let cursor = mode === 'older' && before.value ? { ...before.value } : undefined
  reading.value = true
  readError.value = ''
  try {
    let items: MessageView[] = []
    let more: TimelineCursor | null
    do {
      const page = await api.timeline(ctx, account, contact, cursor)
      if (request !== pageRequest) return
      items = page.messages.concat(items)
      more = page.before
      cursor = more ?? undefined
    } while (
      mode === 'update' &&
      earliest &&
      more &&
      (more.at > earliest.at || (more.at === earliest.at && more.id > earliest.id))
    )
    const el = scroller.value
    const follow =
      mode === 'open' || (mode === 'update' && el && el.scrollHeight - el.clientHeight - el.scrollTop < 40)
    const anchor = visibleAnchor()
    if (mode === 'older') items = items.concat(messages.value)
    if (mode === 'update' && !follow && newest && newest !== items.at(-1)?.id) newMail.value = true
    messages.value = items
    before.value = more
    await nextTick()
    if (request !== pageRequest) return
    if (follow) bottom()
    else if (anchor && el) {
      const row = Array.from(el.querySelectorAll<HTMLElement>('[data-message]')).find(
        (n) => n.dataset.message === anchor.row,
      )
      if (row)
        el.scrollTop += row.getBoundingClientRect().top - el.getBoundingClientRect().top - anchor.offset
    }
  } catch (e) {
    if (request === pageRequest) readError.value = String(e)
  } finally {
    if (request === pageRequest) reading.value = false
  }
}
function select(id: string) {
  pageRequest++
  selected.value = id
  temporary.value = ''
  compose.value = false
  messages.value = []
  before.value = null
  newMail.value = false
  readError.value = ''
  reading.value = false
  if (id) void load('open')
}
function openAddress() {
  const email = address.value.trim()
  if (!email) return
  const existing = contacts.value.find((c) => key(c.email) === key(email))
  select(existing?.id ?? '')
  if (!existing) temporary.value = email
  address.value = ''
}
async function refresh() {
  const request = ++listRequest
  listError.value = ''
  try {
    const rows = await api.conversations({ ...props.snapshot.context }, props.account)
    if (request !== listRequest) return
    const previous = current.value
    contacts.value = rows
    if (temporary.value) {
      const matched = rows.find((r) => key(r.email) === key(temporary.value))
      if (matched) select(matched.id)
    } else if (!current.value) select(rows[0]?.id ?? '')
    else if (current.value.count !== previous?.count || current.value.lastId !== previous?.lastId)
      void load('update')
  } catch (e) {
    if (request === listRequest) listError.value = String(e)
  } finally {
    if (request === listRequest) listing.value = false
  }
}
watch(() => props.snapshot, refresh, { immediate: true })
onBeforeUnmount(() => {
  listRequest++
  pageRequest++
})
</script>
<template>
  <div class="threads">
    <aside aria-label="联系人列表">
      <header><strong>最近会话</strong><button @click="compose = !compose">新会话</button></header>
      <form v-if="compose" @submit.prevent="openAddress">
        <label>收件邮箱<input v-model="address" type="email" required placeholder="name@example.com" /></label
        ><button>打开</button>
      </form>
      <p v-if="listError" role="alert">{{ listError }} <button @click="refresh">重试</button></p>
      <p v-else-if="listing">正在读取本地往来…</p>
      <p v-else-if="!contacts.length">还没有邮件往来</p>
      <div class="list">
        <button
          v-for="c in contacts"
          :key="c.id"
          class="person"
          :class="{ active: selected === c.id }"
          :aria-pressed="selected === c.id"
          @click="select(c.id)"
        >
          <span class="avatar">{{ (c.name || c.email).slice(0, 1).toUpperCase() }}</span>
          <span class="summary"
            ><strong>{{ c.name || c.email }}</strong
            ><small v-if="c.name">{{ c.email }}</small
            ><span>{{ c.preview }}</span></span
          >
          <span class="meta"
            ><small>{{
              day(c.lastAt) === day(new Date().toISOString()) ? clock(c.lastAt) : day(c.lastAt)
            }}</small
            ><b v-if="c.unread">{{ c.unread }}</b></span
          >
        </button>
      </div>
    </aside>
    <main>
      <header v-if="current || temporary">
        <div>
          <strong>{{ current?.name || current?.email || temporary }}</strong
          ><small>{{
            [current?.name && current?.email, current?.company].filter(Boolean).join(' · ')
          }}</small>
        </div>
      </header>
      <p v-if="temporary">与此地址暂无邮件往来。</p>
      <p v-else-if="!current && !listing">选择联系人查看邮件往来。</p>
      <p v-if="readError" role="alert">{{ readError }} <button @click="load('update')">重新读取</button></p>
      <div
        ref="scroller"
        class="history"
        @scroll="
          scroller &&
          scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop < 40 &&
          (newMail = false)
        "
      >
        <button v-if="before" class="older" :disabled="reading" @click="load('older')">加载更早邮件</button>
        <p v-if="reading && !messages.length">正在读取邮件…</p>
        <template v-for="(m, index) in messages" :key="m.id">
          <div v-if="!index || day(m.at) !== day(messages[index - 1].at)" class="date">{{ day(m.at) }}</div>
          <article :data-message="m.id" :class="{ out: m.outgoing }">
            <div class="byline">
              {{ m.outgoing ? '我' : m.from?.name || m.from?.email || '发件人' }} · {{ clock(m.at) }}
            </div>
            <div class="bubble">
              <strong>{{ m.subject }}</strong>
              <details>
                <summary>收件详情</summary>
                <div v-if="m.from">发件人　{{ m.from.email }}</div>
                <div>收件人　{{ m.to.map((a) => a.email).join('、') || '—' }}</div>
                <div v-if="m.cc.length">抄送　{{ m.cc.map((a) => a.email).join('、') }}</div>
                <div v-if="m.bcc.length">密送　{{ m.bcc.map((a) => a.email).join('、') }}</div>
              </details>
              <template v-if="m.body.length > 900"
                ><p>{{ m.body.slice(0, 900) }}</p>
                <details>
                  <summary>展开全文</summary>
                  <p>{{ m.body.slice(900) }}</p>
                </details></template
              >
              <p v-else>{{ m.body || (m.attachments.length ? '' : '无正文') }}</p>
              <div v-for="(a, i) in m.attachments" :key="i" class="file">
                {{ a.filename }} · {{ (a.size_bytes / 1024).toFixed(1) }} KB
              </div>
            </div>
          </article>
        </template>
      </div>
      <button v-if="newMail" class="latest" @click="bottom">查看新消息 ↓</button>
    </main>
  </div>
</template>
<style scoped>
.threads {
  display: grid;
  grid-template-columns: minmax(160px, 31%) minmax(0, 1fr);
  height: 100%;
  min-height: 300px;
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}
aside,
main {
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
}
aside {
  background: var(--bg-panel);
  border-right: 1px solid var(--border);
}
main {
  position: relative;
  background: var(--bg-app);
}
header,
form {
  padding: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border-bottom: 1px solid var(--border);
}
form label {
  min-width: 0;
}
input {
  width: 100%;
}
button,
input {
  background: var(--bg-elevated);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 5px 8px;
  font: inherit;
}
button,
summary {
  cursor: pointer;
}
button:hover {
  background: var(--bg-hover);
}
.list,
.history {
  overflow: auto;
  min-height: 0;
  flex: 1;
}
.list {
  padding: 5px;
}
.person {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 6px;
  text-align: left;
  background: transparent;
  border: 1px solid transparent;
}
.person.active {
  border-color: var(--border-focus);
  background: var(--accent-muted);
}
.summary {
  min-width: 0;
  flex: 1;
  display: grid;
}
.summary > * {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.summary span,
small,
.byline,
.date,
summary {
  color: var(--text-secondary);
  font-size: 12px;
}
small {
  display: block;
}
.meta {
  align-self: flex-start;
  text-align: right;
}
.meta b {
  background: var(--accent-hover);
  color: white;
  padding: 1px 5px;
  border-radius: 8px;
  font-size: 11px;
}
.avatar {
  display: grid;
  place-items: center;
  background: var(--bg-active);
  border-radius: 8px;
  width: 28px;
  height: 32px;
}
.history {
  padding: 12px 16px;
  overflow-anchor: none;
}
.date,
.older {
  text-align: center;
  margin: 5px auto 14px;
  display: block;
}
.byline {
  margin: 5px 0;
}
.bubble {
  background: var(--bg-panel);
  border: 1px solid var(--border);
  padding: 12px;
  border-radius: 9px;
  overflow-wrap: anywhere;
}
.bubble p {
  white-space: pre-wrap;
  margin: 8px 0 0;
}
.bubble details {
  margin-top: 6px;
}
.file {
  margin-top: 8px;
  font-size: 13px;
}
.out {
  margin-left: auto;
}
.out .bubble {
  background: var(--accent-muted);
}
.out .byline {
  text-align: right;
}
article {
  width: fit-content;
  max-width: 90%;
  margin-bottom: 12px;
}
.latest {
  position: absolute;
  bottom: 10px;
  right: 16px;
}
aside > p,
main > p {
  padding: 0 12px;
  color: var(--text-secondary);
}
</style>
