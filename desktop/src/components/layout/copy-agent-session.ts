import type { AwaitingUserReply } from '../../types/electron'
import type {
  AgentMetaItem,
  AgentSubagentStep,
  AgentTimelineItem,
} from '../../types/workspace'

/** JavaScript 字符串长度上限。用户可见文案写成十进制 200000。 */
export const COPY_SESSION_CHAR_LIMIT = 200_000

export const COPY_EMPTY = '当前没有可复制的会话'
export const COPY_OK = '已复制会话'
export const COPY_FAIL = '复制失败，剪贴板不可用，请再试一次'
export const CLIP_SAVE_FAIL = '会话过长，全文保存失败'

export function copySavedToast(absPath: string): string {
  return `内容过长，已保存全文到 ${absPath}`
}

export function copySaveFailToast(reason: string): string {
  return `保存全文失败：${reason}`
}

export function clipSavedLine(absPath: string): string {
  return `会话过长，全文已保存到：${absPath}`
}

/** 与元信息「复制时间」同一时刻。本地时间，不含空格、冒号和时区。 */
export function formatSessionDownloadName(copiedAt: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  const y = copiedAt.getFullYear()
  const m = pad(copiedAt.getMonth() + 1)
  const d = pad(copiedAt.getDate())
  const hh = pad(copiedAt.getHours())
  const mm = pad(copiedAt.getMinutes())
  const ss = pad(copiedAt.getSeconds())
  return `ftcs-session-${y}${m}${d}-${hh}${mm}${ss}.txt`
}

export const SKILL_LABELS: Record<string, string> = {
  'extract-product-profile': '画像生成',
  'expand-keywords': '关键词扩展',
  'discover-leads': '全网搜索',
  'discover-leads-r2': '社媒发现',
  'discover-leads-r3': '地图发现',
  'score-and-dedupe': '评分去重',
  'enrich-lead-contacts': '补全联系人',
  'draft-outreach-email': '起草开发信',
  'translate-outreach-email': '翻译对照',
  idle: '空闲',
}

const SESSION_CREATED = '已创建 OpenCode session'
const AWAIT_FALLBACK = '这项操作需要你处理，当前无法代为回答。'

export type AgentRunStatus = 'idle' | 'running' | 'done' | 'error'

export interface CopySessionSource {
  items: AgentTimelineItem[]
  meta: AgentMetaItem[]
  skill: string
  status: AgentRunStatus
  awaiting: AwaitingUserReply
  productId: string
  copiedAt: Date
}

export interface CopySessionBuildInput extends CopySessionSource {
  /** 空串或纯空白写成「未能读取」。`0.0.0` 是现网回退，照实写入。 */
  appVersion: string
}

export interface CopySessionText {
  text: string
}

export interface SaveTextToDownloadsInput {
  suggestedName: string
  content: string
}

export type SaveTextToDownloadsResult =
  | { ok: true; path: string }
  | { ok: false; error: string }

export interface CopySessionRuntime {
  readAppVersion: () => Promise<string | null | undefined>
  writeClipboard: (text: string) => Promise<boolean>
  saveTextToDownloads: (input: SaveTextToDownloadsInput) => Promise<SaveTextToDownloadsResult>
  showToast: (
    message: string,
    options?: { tone?: 'info' | 'success' | 'error' },
  ) => void
}

export function skillDisplayName(skillId: string): string {
  return SKILL_LABELS[skillId] || '任务'
}

export function kindLabel(kind: AgentTimelineItem['kind'] | AgentSubagentStep['kind']): string {
  switch (kind) {
    case 'user':
      return '你'
    case 'system':
      return '系统'
    case 'assistant':
      return '回复'
    case 'reasoning':
      return '思考'
    case 'tool':
      return '工具'
    case 'error':
      return '错误'
    default:
      return kind
  }
}

function formatDuration(ms: number): string {
  const sec = Math.max(1, Math.round(ms / 1000))
  if (sec < 60) return `${sec} 秒`
  const min = Math.floor(sec / 60)
  const rem = sec % 60
  return rem ? `${min} 分 ${rem} 秒` : `${min} 分`
}

function agentLabel(agent: string): string {
  const name = agent.trim()
  if (!name) return 'General'
  return name.charAt(0).toUpperCase() + name.slice(1)
}

/** 与 AgentPanel 时间线上的子代理摘要同一套文案。 */
export function subagentStatus(item: AgentTimelineItem): string {
  const sub = item.subagent
  if (!sub) return ''
  const agent = agentLabel(sub.agent)
  if (item.status === 'error') return `${agent} · 失败`
  if (sub.awaiting) return `${agent} · 在等你回复`
  if (item.status === 'done') {
    const end = sub.finishedAt ?? Date.now()
    const dur = sub.startedAt ? formatDuration(end - sub.startedAt) : ''
    const count = `${sub.toolCount} 次工具`
    return dur ? `${agent} · 完成 · ${count} · ${dur}` : `${agent} · 完成 · ${count}`
  }
  return `${agent} · 进行中`
}

/** 与 AgentPanel 时间线上的子代理当前行同一套文案。 */
export function subagentCurrent(item: AgentTimelineItem): string {
  const sub = item.subagent
  if (!sub) return ''
  if (sub.current) return `↳ ${sub.current}`
  if (item.status === 'running') return '↳ 启动中'
  return `↳ ${sub.toolCount} 次工具`
}

export function formatCopyTimestamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  const offsetMinutes = -date.getTimezoneOffset()
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const abs = Math.abs(offsetMinutes)
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())} ` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  )
}

/**
 * 无引号的密钥值只吃可见 ASCII（去掉引号和 &）。
 * 这样句末的「。」会留在正文里，而不会被算进密钥。
 */
const UNQUOTED_SECRET = '[!#$%()*+,\\-./0-9:;<=>?@A-Z\\[\\\\\\]^_`a-z{|}~]{8,}'

export function redactSecrets(text: string): string {
  const bearer = /Bearer\s+[A-Za-z0-9._~+/=-]{8,}/gi
  const labeled = new RegExp(
    `(?<![A-Za-z0-9_])(x-api-key|apikey|api key|api_key|api-key|key)(\\s*[:=]\\s*)(?:"[^"\\s&]{8,}"|'[^'\\s&]{8,}'|${UNQUOTED_SECRET})`,
    'gi',
  )
  const sk = /\bsk-[A-Za-z0-9_-]{8,}/gi
  const aiza = /\bAIza[0-9A-Za-z_-]{20,}/g
  return text
    .replace(bearer, 'Bearer [REDACTED]')
    .replace(labeled, (match: string, name: string, sep: string) =>
      match ? `${name}${sep}[REDACTED]` : match,
    )
    .replace(sk, '[REDACTED]')
    .replace(aiza, '[REDACTED]')
}

function statusText(status: 'running' | 'done' | 'error' | undefined): string | null {
  if (status === 'running') return '进行中'
  if (status === 'done') return '完成'
  if (status === 'error') return '失败'
  return null
}

function runtimeLabel(status: AgentRunStatus, awaiting: AwaitingUserReply): string {
  if (awaiting) return '任务在等你回复'
  if (status === 'running') return '运行中'
  if (status === 'done') return '完成'
  if (status === 'error') return '异常'
  return '空闲'
}

function parentSessionId(items: AgentTimelineItem[]): string | null {
  let found: string | null = null
  for (const item of items) {
    if (item.id !== 'sys-session') continue
    const lines = item.body.split(/\r?\n/)
    if ((lines[0] ?? '').trim() !== SESSION_CREATED) continue
    const id = (lines[1] ?? '').trim()
    if (!id) continue
    found = id
  }
  return found
}

interface ErrorHit {
  kind: string
  title: string
}

function collectErrors(items: AgentTimelineItem[]): ErrorHit[] {
  const hits: ErrorHit[] = []
  for (const item of items) {
    if (item.kind === 'error' || item.status === 'error') {
      if (item.subagent) {
        const title = item.subagent.description.trim() ? item.subagent.description : item.title
        hits.push({ kind: '子代理', title })
      } else {
        hits.push({ kind: kindLabel(item.kind), title: item.title })
      }
    }
    for (const step of item.subagent?.steps ?? []) {
      if (step.kind === 'error' || step.status === 'error') {
        hits.push({ kind: kindLabel(step.kind), title: step.title })
      }
    }
  }
  return hits
}

function heading(prefix: string, parts: string[]): string {
  const visible = parts.filter((part) => part.trim())
  return `${prefix}${visible.join(' · ')}`
}

function formatStep(step: AgentSubagentStep, index: number): string {
  const lines = [heading(`#### 步骤 ${index}. `, [kindLabel(step.kind), step.title])]
  const status = statusText(step.status)
  if (status) lines.push(`状态：${status}`)
  if (step.body) lines.push(step.body)
  return lines.join('\n')
}

function formatPlainItem(item: AgentTimelineItem, index: number): string {
  const lines = [heading(`### ${index}. `, [kindLabel(item.kind), item.title, item.time])]
  const status = statusText(item.status)
  if (status) lines.push(`状态：${status}`)
  if (item.body) lines.push(item.body)
  return lines.join('\n')
}

function formatSubagentItem(item: AgentTimelineItem, index: number): string {
  const sub = item.subagent
  if (!sub) return formatPlainItem(item, index)
  const title = sub.description.trim() ? sub.description : item.title
  const lines = [heading(`### ${index}. `, ['子代理', title, item.time])]
  lines.push(subagentStatus(item))
  lines.push(subagentCurrent(item))
  if (sub.sessionId.trim()) lines.push(`子会话：${sub.sessionId.trim()}`)
  const status = statusText(item.status)
  if (status) lines.push(`状态：${status}`)
  const chunks = [lines.join('\n')]
  if (sub.steps.length) {
    chunks.push(sub.steps.map((step, stepIndex) => formatStep(step, stepIndex + 1)).join('\n\n'))
  }
  if (item.body) chunks.push(`#### 结果\n${item.body}`)
  return chunks.join('\n\n')
}

function formatAwaiting(awaiting: AwaitingUserReply): string | null {
  if (!awaiting) return null
  if (!awaiting.renderable) {
    return `## 等待用户回复\n\n${AWAIT_FALLBACK}`
  }
  const blocks = awaiting.questions.map((question) => {
    const lines = [`### ${question.header}`, question.question]
    for (const option of question.options) {
      lines.push(
        option.description ? `- ${option.label}：${option.description}` : `- ${option.label}`,
      )
    }
    if (question.custom !== false) lines.push('- 输入自己的答案')
    return lines.join('\n')
  })
  return `## 等待用户回复\n\n${blocks.join('\n\n')}`
}

function versionText(appVersion: string): string {
  const value = appVersion.trim()
  return value ? value : '未能读取'
}

function metaBlock(input: CopySessionBuildInput): string {
  const lines = [
    `应用版本：${versionText(input.appVersion)}`,
    `复制时间：${formatCopyTimestamp(input.copiedAt)}`,
    `技能：${skillDisplayName(input.skill)}（${input.skill}）`,
    `运行状态：${runtimeLabel(input.status, input.awaiting)}`,
  ]
  if (input.productId !== '') lines.push(`产品标识：${input.productId}`)
  const sessionId = parentSessionId(input.items)
  if (sessionId) lines.push(`会话：${sessionId}`)
  if (input.meta.length) {
    lines.push(
      `栏上状态：${input.meta.map((item) => `${item.label}=${item.value}`).join('；')}`,
    )
  }
  const errors = collectErrors(input.items)
  lines.push(`错误条数：${errors.length}`)
  const last = errors[errors.length - 1]
  if (last) {
    const title = last.title.trim() ? last.title : '（无标题）'
    lines.push(`最近错误：${last.kind} · ${title}`)
  }
  return ['## 元信息', ...lines.map((line) => `- ${line}`)].join('\n')
}

export function buildCopySessionText(input: CopySessionBuildInput): CopySessionText {
  const body = input.items
    .map((item, index) =>
      item.subagent ? formatSubagentItem(item, index + 1) : formatPlainItem(item, index + 1),
    )
    .join('\n\n')
  const sections = ['# FTCS 智能体会话', metaBlock(input), `## 会话正文\n\n${body}`]
  const waiting = formatAwaiting(input.awaiting)
  if (waiting) sections.push(waiting)
  return { text: redactSecrets(sections.join('\n\n')) }
}

function thrownSaveReason(error: unknown): string {
  const raw = error instanceof Error ? error.message : ''
  const line = (raw.split(/\r?\n/, 1)[0] ?? '').trim()
  const text = line || '保存通道不可用'
  return text.length > 120 ? text.slice(0, 120) : text
}

export async function writeClipboardText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    let area: HTMLTextAreaElement | null = null
    try {
      area = document.createElement('textarea')
      area.value = text
      area.setAttribute('readonly', 'true')
      area.style.position = 'fixed'
      area.style.left = '-9999px'
      document.body.appendChild(area)
      area.select()
      return document.execCommand('copy')
    } catch {
      return false
    } finally {
      area?.remove()
    }
  }
}

function cloneData<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function snapshotOf(source: CopySessionSource): CopySessionSource {
  return {
    items: cloneData(source.items),
    meta: cloneData(source.meta),
    skill: source.skill,
    status: source.status,
    awaiting: cloneData(source.awaiting),
    productId: source.productId,
    copiedAt: new Date(source.copiedAt.getTime()),
  }
}

export function createCopySessionController(runtime: CopySessionRuntime): {
  isCopying: () => boolean
  copy: (source: CopySessionSource) => Promise<void>
} {
  let copying = false
  return {
    isCopying: () => copying,
    async copy(source: CopySessionSource): Promise<void> {
      if (copying) return
      const snap = snapshotOf(source)
      if (snap.items.length === 0) {
        runtime.showToast(COPY_EMPTY)
        return
      }
      copying = true
      try {
        let appVersion = ''
        try {
          const raw = await runtime.readAppVersion()
          appVersion = typeof raw === 'string' ? raw : ''
        } catch {
          appVersion = ''
        }
        const text = buildCopySessionText({ ...snap, appVersion }).text
        if (text.length <= COPY_SESSION_CHAR_LIMIT) {
          let ok = false
          try {
            ok = await runtime.writeClipboard(text)
          } catch {
            ok = false
          }
          runtime.showToast(ok ? COPY_OK : COPY_FAIL, {
            tone: ok ? 'success' : 'error',
          })
          return
        }

        let saved: SaveTextToDownloadsResult
        try {
          saved = await runtime.saveTextToDownloads({
            suggestedName: formatSessionDownloadName(snap.copiedAt),
            content: text,
          })
        } catch (error) {
          saved = { ok: false, error: thrownSaveReason(error) }
        }
        if (saved.ok) {
          try {
            await runtime.writeClipboard(clipSavedLine(saved.path))
          } catch {
            // 路径行写不进剪贴板时，保持点击前的内容。
          }
          runtime.showToast(copySavedToast(saved.path), { tone: 'success' })
          return
        }
        runtime.showToast(copySaveFailToast(saved.error), { tone: 'error' })
        try {
          await runtime.writeClipboard(CLIP_SAVE_FAIL)
        } catch {
          // 失败行也写不上则保持点击前的剪贴板，不再提示第二条。
        }
      } finally {
        copying = false
      }
    },
  }
}
