<script lang="ts">
// A reopened editor reads after any last save queued by its previous instance.
const writes = new Map<string, Promise<unknown>>()
const pendingSaves = new Set<Promise<void>>()
const editors = new Set<() => Promise<void>>()
window.addEventListener('ftcs:flush-mail-drafts', (event) => {
  const pending = (event as CustomEvent<Promise<unknown>[]>).detail
  pending.push(...pendingSaves, ...Array.from(editors, (save) => save()))
})
function inOrder<T>(key: string, operation: () => Promise<T>) {
  const next = (writes.get(key) ?? Promise.resolve()).catch(() => {}).then(operation)
  writes.set(key, next)
  const clear = () => {
    if (writes.get(key) === next) writes.delete(key)
  }
  void next.then(clear, clear)
  return next
}
</script>
<script setup lang="ts">
import { computed, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue'
import {
  envelope,
  type ComposerAction,
  type ComposerView,
  type DraftInput,
  type QuoteSource,
  type Version,
} from '../../../electron/mailbox/compose-types'
import type { Snapshot, ReplyTarget } from '../../../electron/mailbox/types'
import { showToast } from '../../composables/useToast'

const props = defineProps<{ snapshot: Snapshot; account: string; self: string; email: string }>()
const emit = defineEmits<{ jump: [target: ReplyTarget]; changed: [] }>()
const ctx = { ...props.snapshot.context },
  account = props.account,
  email = props.email
const slot = JSON.stringify([ctx.root, ctx.generation, account, email])
const api = window.ftcs!.mailbox
const call = (action: ComposerAction) => api.composer(ctx, account, email, action)
const view = ref<ComposerView>(),
  edit = ref<DraftInput>({ mode: 'new', text_body: '' }),
  quote = ref<QuoteSource>()
const error = ref(''),
  busy = ref(false),
  dirty = ref(false)
const sending = ref(false)
const conflict = computed(() => error.value.includes('草稿版本已改变'))
const input = ref<HTMLTextAreaElement>()
let edits = 0,
  timer: ReturnType<typeof setTimeout> | undefined,
  disposed = false
const result = computed(() => view.value?.result)
const locked = computed(
  () =>
    !view.value || busy.value || result.value?.state === 'submitting' || result.value?.state === 'unknown',
)
const fields = computed(() => envelope(email, props.self, edit.value, quote.value))
const canReplyAll = computed(() => {
  if (!quote.value) return false
  const normal = envelope(email, props.self, { ...edit.value, mode: 'reply' }, quote.value)
  const all = envelope(email, props.self, { ...edit.value, mode: 'reply_all' }, quote.value)
  const normalAddresses = new Set([...normal.to, ...normal.cc].map((a) => a.email))
  return [...all.to, ...all.cc].some((a) => !normalAddresses.has(a.email))
})
const canSend = computed(
  () =>
    !locked.value &&
    !!fields.value.subject.trim() &&
    fields.value.to.length &&
    (edit.value.text_body.trim() || view.value?.draft.attachments.length),
)
function apply(next: ComposerView) {
  view.value = next
  quote.value = next.quote
  const d = next.draft
  edit.value = {
    text_body: d.text_body,
    mode: d.mode,
    quoted_message_id: d.quoted_message_id,
    new_subject_override: d.new_subject_override,
    reply_subject_override: d.reply_subject_override,
  }
}
function report(e: unknown) {
  error.value = String(e instanceof Error ? e.message : e).replace(
    /^Error invoking remote method '[^']+': Error: /,
    '',
  )
  if (disposed) showToast(error.value, { tone: 'error' })
}
function version(): Version {
  const d = view.value!.draft
  return { draft_id: d.draft_id, rev: d.rev }
}
async function refresh() {
  if (busy.value || dirty.value || disposed) return
  const at = edits
  try {
    await inOrder(slot, async () => {
      const next = await call({ kind: 'get' })
      if (at === edits && !dirty.value && !busy.value && !disposed) apply(next)
    })
  } catch (e) {
    report(e)
  }
}
function flush() {
  clearTimeout(timer)
  if (!dirty.value) return Promise.resolve()
  const save = inOrder(slot, async () => {
    if (!dirty.value || !view.value) return
    const at = edits
    const next = await call({ kind: 'save', version: version(), edit: { ...edit.value } })
    view.value = next
    if (edits === at) {
      dirty.value = false
      error.value = ''
    }
  })
  pendingSaves.add(save)
  const release = () => pendingSaves.delete(save)
  void save.then(release, release)
  return save
}
async function resolveConflict(keepInput: boolean) {
  busy.value = true
  try {
    const saved = await call({ kind: 'get' })
    if (keepInput && (!saved.result || saved.result.state === 'failed')) {
      view.value = saved
      await flush()
    } else {
      if (keepInput) throw new Error('草稿版本已改变。已保存版本正在发送或等待核对，请先载入已保存版本。')
      apply(saved)
      dirty.value = false
    }
    error.value = ''
  } catch (e) {
    report(e)
  } finally {
    busy.value = false
  }
}
async function flushForNavigation() {
  try {
    while (dirty.value) await flush()
  } catch (e) {
    report(e)
    throw e
  }
}
function finishEditing() {
  if (dirty.value) void flush().catch(report)
}
function change(delta: Partial<DraftInput>) {
  if (locked.value) return
  edits++
  edit.value = { ...edit.value, ...delta }
  dirty.value = true
  clearTimeout(timer)
  timer = setTimeout(finishEditing, 300)
}
function cite(source: QuoteSource) {
  if (locked.value) return
  quote.value = source
  change({ mode: 'reply', quoted_message_id: source.id, reply_subject_override: undefined })
  input.value?.focus()
}
function cancelQuote() {
  quote.value = undefined
  change({ mode: 'new', quoted_message_id: undefined, reply_subject_override: undefined })
}
defineExpose({ cite, flush: flushForNavigation })
async function act(kind: 'pick' | 'remove' | 'send', attachment?: string) {
  if (locked.value) return
  busy.value = true
  sending.value = kind === 'send'
  error.value = ''
  try {
    await flush()
    const v = version()
    const action: ComposerAction =
      kind === 'send'
        ? {
            kind,
            version: v,
            request: crypto.randomUUID(),
            to: fields.value.to.map((a) => a.email),
            cc: fields.value.cc.map((a) => a.email),
          }
        : kind === 'pick'
          ? { kind, version: v }
          : { kind, version: v, attachment: attachment! }
    const next = await call(action)
    apply(next)
    if (next.attachmentErrors?.length) error.value = next.attachmentErrors.join('；')
    if (kind === 'send' && next.result?.state === 'accepted') {
      showToast(
        next.result.rejected?.length ? '部分收件人未接受：' + next.result.rejected.join('、') : '邮件已发送',
        { tone: next.result.rejected?.length ? 'info' : 'success' },
      )
    }
    emit('changed')
  } catch (e) {
    report(e)
    if (!dirty.value) {
      try {
        apply(await call({ kind: 'get' }))
      } catch {
        /* Keep the editor and its error visible. */
      }
    }
  } finally {
    busy.value = false
    sending.value = false
  }
}
onMounted(() => {
  editors.add(flushForNavigation)
  void refresh()
})
watch(() => props.snapshot, refresh)
onDeactivated(finishEditing)
onBeforeUnmount(() => {
  disposed = true
  editors.delete(flushForNavigation)
  finishEditing()
})
</script>
<template>
  <section class="mail-composer" aria-label="撰写邮件">
    <div v-if="quote" class="quote-strip">
      <button
        @click="emit('jump', { id: quote.id, subject: quote.subject, contact: view!.draft.contact_id })"
      >
        引用 · {{ quote.from?.name || quote.from?.email || '原邮件' }} · {{ quote.subject || '（无主题）' }}
        <small>{{ quote.snippet }}</small>
      </button>
      <button aria-label="取消引用" :disabled="locked" @click="cancelQuote">×</button>
    </div>
    <small v-if="quote && !quote.threaded">此邮件缺少回复标识，对方邮箱可能无法归入原会话。</small>
    <div class="address">
      收件人　{{ fields.to.map((a) => a.email).join('、') }}
      <label v-if="canReplyAll"
        ><input
          type="checkbox"
          :checked="edit.mode === 'reply_all'"
          :disabled="locked"
          @change="change({ mode: edit.mode === 'reply_all' ? 'reply' : 'reply_all' })"
        />
        回复全部</label
      >
    </div>
    <div v-if="fields.cc.length" class="address">抄送　{{ fields.cc.map((a) => a.email).join('、') }}</div>
    <label class="subject"
      >主题<input
        :value="fields.subject"
        :disabled="locked"
        placeholder="默认使用正文第一行"
        @input="
          change(
            quote
              ? { reply_subject_override: ($event.target as HTMLInputElement).value }
              : { new_subject_override: ($event.target as HTMLInputElement).value },
          )
        "
    /></label>
    <textarea
      ref="input"
      :value="edit.text_body"
      :disabled="locked"
      aria-label="邮件正文"
      placeholder="写邮件…"
      @input="change({ text_body: ($event.target as HTMLTextAreaElement).value })"
    />
    <div v-if="view?.draft.attachments.length" class="files">
      <span v-for="f in view.draft.attachments" :key="f.attachment_id"
        >{{ f.filename }} · {{ (f.size_bytes / 1024).toFixed(1) }} KB
        <button :disabled="locked" :aria-label="'移除 ' + f.filename" @click="act('remove', f.attachment_id)">
          ×
        </button>
      </span>
    </div>
    <div v-if="error" role="alert">
      {{ error }}
      <template v-if="conflict"
        ><button :disabled="busy" @click="resolveConflict(false)">载入已保存版本</button>
        <button :disabled="busy" @click="resolveConflict(true)">保留当前编辑</button></template
      >
      <button v-else @click="dirty ? flush().catch(report) : refresh()">重试</button>
    </div>
    <footer>
      <button :disabled="locked" @click="act('pick')">添加附件</button>
      <small role="status"
        >{{
          sending
            ? '正在发送…'
            : result?.state === 'unknown'
              ? '发送结果待确认 · 请检查已发送邮件'
              : result?.state === 'failed'
                ? '发送失败 · ' + (result.detail || '请重试')
                : result?.state === 'submitting'
                  ? '正在发送…'
                  : dirty
                    ? '草稿待保存'
                    : view?.draft.rev
                      ? '草稿已保存'
                      : ''
        }}
        <template v-if="result?.state !== 'accepted' && result?.rejected?.length"
          >　已拒绝：{{ result.rejected.join('、') }}</template
        ></small
      >
      <button class="send" :disabled="!canSend" @click="act('send')">发送</button>
    </footer>
  </section>
</template>
<style scoped>
.mail-composer {
  border-top: 1px solid var(--border);
  background: var(--bg-panel);
  padding: 10px 16px;
  display: grid;
  gap: 6px;
  max-height: 50%;
  overflow: auto;
  font-size: 13px;
  color: var(--text);
}
button,
input,
textarea {
  font: inherit;
  color: inherit;
}
button {
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 3px 8px;
  cursor: pointer;
}
button:disabled {
  opacity: 0.5;
  cursor: default;
}
.address,
.subject,
small {
  color: var(--text-secondary);
  overflow-wrap: anywhere;
}
.address label {
  margin-left: 10px;
  white-space: nowrap;
}
.subject,
footer,
.quote-strip {
  display: flex;
  align-items: center;
  gap: 8px;
}
.subject input,
textarea {
  border: 1px solid var(--border);
  background: var(--bg-input);
  border-radius: 5px;
  padding: 5px 8px;
  color: var(--text);
}
.subject input {
  min-width: 0;
  flex: 1;
}
textarea {
  min-height: 48px;
  resize: vertical;
}
footer small {
  flex: 1;
}
.send {
  background: var(--accent);
  color: white;
}
.quote-strip {
  background: var(--selected);
  border-left: 2px solid var(--soft-blue);
  border-radius: 5px;
}
.quote-strip button {
  background: transparent;
  border: 0;
}
.quote-strip button:first-child {
  flex: 1;
  overflow: hidden;
  text-align: left;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.files {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.files span {
  background: var(--chip);
  border-radius: 5px;
  padding: 2px 6px;
}
[role='alert'] {
  color: var(--danger);
}
</style>
