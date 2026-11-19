<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import {
  key,
  type Conversation,
  type MessageView,
  type Snapshot,
  type TimelineCursor,
} from '../../../electron/mailbox/types'
import HtmlMailBody from './HtmlMailBody.vue'
import Icon from '../shared/Icon.vue'
const props = defineProps<{ snapshot: Snapshot; account: string; busy: boolean }>()
defineEmits<{ settings: []; sync: [] }>()
const accountEmail = computed(() => props.snapshot.accounts.find((a) => a.id === props.account)?.email || '')
const syncLabel = computed(() => {
  const folders = props.snapshot.folders
  if (folders.some((f) => f.error)) return '同步需要处理'
  if (props.snapshot.running) return '正在同步…'
  if (folders.some((f) => !f.path)) return '待选择已发送文件夹'
  const last = folders
    .map((f) => f.lastSyncedAt || '')
    .sort()
    .at(-1)
  return last ? '已同步 · ' + clock(last) : '等待同步'
})
function initials(name: string) {
  const parts = name.split(/[@._+\s-]+/).filter(Boolean)
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase()
}
function avatarTone(email: string) {
  const tones = ['#405873', '#665148', '#425f57', '#5d4d68', '#405962']
  return tones[Array.from(email).reduce((n, c) => n + c.charCodeAt(0), 0) % tones.length]
}
function formattedDay(at: string) {
  const date = new Date(at)
  const label = date.toLocaleDateString('zh-CN', {
    month: 'long',
    day: 'numeric',
    ...(date.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' as const } : {}),
  })
  return day(at) === day(new Date().toISOString()) ? '今天 · ' + label : label
}
const api = window.ftcs!.mailbox
const contacts = ref<Conversation[]>([]),
  selected = ref(''),
  temporary = ref('')
const current = computed(() => contacts.value.find((c) => c.id === selected.value))
const contactSearch = ref('')
const visibleContacts = computed(() => {
  const query = contactSearch.value.trim().toLowerCase()
  if (!query) return contacts.value
  return contacts.value.filter((c) => c.name?.toLowerCase().includes(query) || c.email.toLowerCase().includes(query))
})
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
      <header class="inbox-heading">
        <div>
          <h1>邮箱</h1>
          <div class="account" :title="accountEmail">{{ accountEmail }}</div>
        </div>
        <button class="compose" :aria-expanded="compose" @click="compose = !compose">
          <Icon name="plus" :size="15" />新会话
        </button>
      </header>
      <form v-if="compose" @submit.prevent="openAddress">
        <label>收件邮箱<input v-model="address" type="email" required placeholder="name@example.com" /></label
        ><button>打开</button>
      </form>
      <h2 class="list-title">最近会话</h2>
      <label class="contact-search">
        <Icon name="search" :size="15" aria-hidden="true" />
        <input
          v-model="contactSearch"
          type="search"
          aria-label="按姓名或邮箱搜索联系人"
          placeholder="搜索姓名或邮箱"
          @keydown.esc="contactSearch = ''"
        />
      </label>
      <p v-if="listError" role="alert">{{ listError }} <button @click="refresh">重试</button></p>
      <p v-else-if="listing">正在读取本地往来…</p>
      <p v-else-if="!contacts.length">还没有邮件往来</p>
      <p v-else-if="!visibleContacts.length" role="status">没有找到匹配的联系人</p>
      <div class="list">
        <button
          v-for="c in visibleContacts"
          :key="c.id"
          class="person"
          :title="c.email"
          :class="{ active: selected === c.id }"
          :aria-pressed="selected === c.id"
          @click="select(c.id)"
        >
          <span class="avatar" :style="{ backgroundColor: avatarTone(c.email) }">{{
            initials(c.name || c.email.split('@')[0])
          }}</span>
          <span class="summary"
            ><strong>{{ c.name || c.email }}</strong
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
      <footer>
        <button class="status" @click="$emit('settings')">{{ syncLabel }}</button>
        <button class="tool" aria-label="邮箱设置" title="邮箱设置" @click="$emit('settings')">
          <Icon name="settings" :size="15" />
        </button>
        <button
          class="tool"
          aria-label="重新同步"
          title="重新同步"
          :disabled="busy || snapshot.running"
          @click="$emit('sync')"
        >
          <Icon name="refresh-cw" :size="15" />
        </button>
      </footer>
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
          <div v-if="!index || day(m.at) !== day(messages[index - 1].at)" class="date">
            {{ formattedDay(m.at) }}
          </div>
          <article :data-message="m.id" :class="{ out: m.outgoing }">
            <div class="byline">
              {{ m.outgoing ? '我' : m.from?.name || m.from?.email || '发件人' }} · {{ clock(m.at) }}
            </div>
            <div class="bubble">
              <strong>{{ m.subject }}</strong>
              <details>
                <summary :title="'展开收件详情'">
                  收件人：{{
                    m.to
                      .map((a) => (key(a.email) === key(accountEmail) ? '我' : a.name || a.email))
                      .join('、') || '—'
                  }}<template v-if="m.cc.length"
                    >　抄送：{{ m.cc.map((a) => a.name || a.email).join('、') }}</template
                  >
                  <Icon name="chevron-down" :size="12" />
                </summary>
                <div v-if="m.from">发件人　{{ m.from.email }}</div>
                <div>收件人　{{ m.to.map((a) => a.email).join('、') || '—' }}</div>
                <div v-if="m.cc.length">抄送　{{ m.cc.map((a) => a.email).join('、') }}</div>
                <div v-if="m.bcc.length">密送　{{ m.bcc.map((a) => a.email).join('、') }}</div>
              </details>
              <HtmlMailBody v-if="m.html" :html="m.html" :subject="m.subject" />
              <template v-else-if="m.body.length > 900"
                ><p>{{ m.body.slice(0, 900) }}</p>
                <details>
                  <summary>展开全文</summary>
                  <p>{{ m.body.slice(900) }}</p>
                </details></template
              >
              <p v-else>{{ m.body || (m.attachments.length ? '' : '无正文') }}</p>
              <div v-for="(a, i) in m.attachments" :key="i" class="file">
                <Icon name="file-text" :size="16" /> {{ a.filename }}
                <small>·　{{ (a.size_bytes / 1024).toFixed(1) }} KB</small>
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
  --rail: light-dark(#f5f6f8, #1c1e22);
  --canvas: light-dark(#fff, #17191d);
  --bubble: light-dark(#f1f3f6, #26292f);
  --out: light-dark(#e5eeff, #253650);
  --selected: light-dark(#dde8fb, #28354a);
  --chip: light-dark(#e1e5ec, #343942);
  --soft-blue: light-dark(#244f96, #bfd4ff);
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: clamp(174px, 28.4%, 346px) minmax(0, 1fr);
  overflow: hidden;
  container-type: inline-size;
}

aside,
main {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
aside {
  background: var(--rail);
  border-right: 1px solid var(--border);
}
main {
  background: var(--canvas);
  position: relative;
}
button,
input {
  font: inherit;
  color: inherit;
}
button {
  cursor: pointer;
  border: 0;
  background: transparent;
}
button:disabled {
  opacity: 0.5;
  cursor: default;
}
button:focus-visible,
summary:focus-visible,
input:focus-visible {
  outline: 2px solid var(--border-focus);
  outline-offset: -2px;
}
h1,
h2,
p {
  margin: 0;
}
.inbox-heading {
  padding: 22px 22px 14px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}
.inbox-heading > div {
  min-width: 0;
}
h1 {
  font-size: 24px;
  line-height: 1.3;
}
.account,
main header small {
  margin-top: 7px;
  display: block;
  color: var(--text-secondary);
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.compose,
.latest,
form button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  white-space: nowrap;
  padding: 8px 12px;
  background: var(--selected);
  color: var(--soft-blue);
  border-radius: 6px;
  font-weight: 600;
}
.compose:hover,
.latest:hover {
  filter: brightness(1.1);
}
.list-title {
  font-size: 12px;
  color: var(--text-secondary);
  padding: 18px 22px 12px;
  font-weight: 600;
}
.contact-search {
  position: relative;
  margin: 0 21px 10px;
}
.contact-search svg {
  position: absolute;
  left: 9px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-secondary);
  pointer-events: none;
}
.contact-search input {
  box-sizing: border-box;
  padding-left: 30px;
  font-size: 13px;
}
.list,
.history {
  min-height: 0;
  overflow: auto;
  flex: 1;
}
.list {
  padding: 0 9px;
}
.person {
  width: 100%;
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) auto;
  grid-template-rows: auto auto;
  align-content: center;
  align-items: center;
  gap: 4px 12px;
  text-align: left;
  padding: 10px 12px;
  min-height: 77px;
  margin-bottom: 6px;
  border-radius: 8px;
}
.person:hover,
.tool:hover {
  background: var(--bg-hover);
}
.person.active {
  background: var(--selected);
}
.avatar {
  grid-row: span 2;
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 12px;
  color: #f1f5fa;
  font-weight: 600;
}
.summary,
.meta {
  display: contents;
}
.summary strong,
.summary > span {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.summary strong {
  grid-area: 1/2;
  font-size: 14px;
}
.summary > span {
  grid-area: 2/2/3/4;
}
.person:has(.meta b) .summary > span {
  grid-column-end: 3;
}
.meta small {
  grid-area: 1/3;
}
.meta b {
  grid-area: 2/3;
  justify-self: end;
  background: #3768ca;
  color: white;
  border-radius: 99px;
  padding: 1px 6px;
  font-size: 11px;
}
.summary > span,
.meta small,
.byline,
.date,
summary,
footer button {
  font-size: 12px;
  color: var(--text-secondary);
}
footer {
  padding: 10px 17px;
  display: flex;
  gap: 3px;
  align-items: center;
}
.status {
  margin-right: auto;
  text-align: left;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 0;
}
.tool {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
}
form {
  padding: 0 16px;
  display: flex;
  gap: 6px;
  align-items: flex-end;
}
form label {
  min-width: 0;
  font-size: 12px;
}
input {
  width: 100%;
  background: var(--bg-input);
  border: 1px solid var(--border);
  padding: 7px;
  border-radius: 5px;
}
main header {
  padding: 16px clamp(16px, 3cqw, 36px);
  border-bottom: 1px solid var(--border);
  min-height: 86px;
  display: flex;
  align-items: center;
  overflow-wrap: anywhere;
}
main header div {
  min-width: 0;
}
main header strong {
  font-size: 22px;
  line-height: 1.25;
}
.history {
  padding: 12px clamp(16px, 3cqw, 36px) 22px;
  overflow-anchor: none;
}
.date,
.older {
  display: block;
  text-align: center;
  margin: 0 auto 16px;
}
.older,
.latest {
  color: var(--soft-blue);
}
.older {
  font-size: 12px;
}
.byline {
  margin-bottom: 7px;
}
.bubble {
  background: var(--bubble);
  border-radius: 12px;
  padding: 13px 17px;
  overflow-wrap: anywhere;
  font-size: 14px;
  line-height: 1.6;
}
.bubble strong {
  font-size: 15px;
}
.bubble p {
  white-space: pre-wrap;
  margin: 8px 0 0;
}
.bubble details {
  margin-top: 5px;
}
.bubble details div {
  font-size: 12px;
  color: var(--text-secondary);
}
summary {
  cursor: pointer;
  list-style: none;
}
summary::-webkit-details-marker {
  display: none;
}
summary svg {
  display: inline-block;
  vertical-align: middle;
}
.file {
  display: flex;
  align-items: center;
  gap: 8px;
  width: fit-content;
  max-width: 100%;
  margin-top: 12px;
  border-radius: 6px;
  background: var(--chip);
  padding: 7px 10px;
  font-size: 12px;
}
.file small {
  white-space: nowrap;
}
article:has(.html-body) { width: min(700px, 89%); }
.out {
  margin-left: auto;
}
.out .bubble {
  background: var(--out);
}
.out .byline {
  text-align: right;
}
article {
  width: fit-content;
  max-width: 89%;
  margin-bottom: 20px;
}
.latest {
  position: absolute;
  bottom: 12px;
  right: 20px;
}
.history > p,
aside > p,
main > p {
  padding: 12px 18px;
  color: var(--text-secondary);
}
@container (max-width:640px) {
  .inbox-heading {
    padding: 16px 10px;
    gap: 4px;
  }
  .compose {
    padding: 6px;
    font-size: 12px;
  }
  .person {
    grid-template-columns: 30px minmax(0, 1fr) auto;
    gap: 3px 6px;
    padding: 7px;
    min-height: 64px;
  }
  .avatar {
    width: 30px;
    height: 34px;
    border-radius: 9px;
  }
  .list-title {
    padding: 10px;
  }
  .contact-search {
    margin-inline: 10px;
  }
  .meta small {
    font-size: 10px;
  }
  .list {
    padding: 0 4px;
  }
  footer {
    padding: 7px;
  }
  .history {
    padding: 12px;
  }
  article {
    max-width: 95%;
  }
}
</style>
