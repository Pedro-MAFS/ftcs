import type { OpencodeClient } from '@opencode-ai/sdk/v2'
import type { BootstrapResult } from '../profile/profile-bootstrap'
import {
  loadProfile,
  type ProductProfileDetail,
} from '../profile/profile-reader'
import { loadExpansion, type KeywordExpansion } from '../keywords/keywords-reader'
import {
  findLatestRunAfter,
  type ExplorationRun,
} from '../exploration/exploration-reader'
import { failLatestRunningExploration } from '../exploration/exploration-writer'
import {
  countRawLeads,
  loadScoredArtifact,
  type ScoredLeadsArtifact,
} from '../leads/leads-reader'
import {
  listHighLeadsNeedingDraft,
  loadEmailDraftsArtifact,
  type EmailDraftsArtifact,
} from '../emails/emails-reader'

/** 单一时间线条目：保证界面按发生顺序阅读 */
export type AgentTimelineItem = {
  id: string
  kind: 'user' | 'system' | 'assistant' | 'reasoning' | 'tool' | 'error'
  time: string
  title: string
  body: string
  /** tool 状态 */
  status?: 'running' | 'done' | 'error'
  /** 默认折叠长内容（如完整用户指令） */
  collapsed?: boolean
}

export type AgentEventPayload =
  | {
      type: 'state'
      skill: string
      status: 'idle' | 'running' | 'done' | 'error'
      productId?: string
      meta: Array<{ label: string; value: string; tone?: string }>
    }
  | {
      /** 整段替换时间线（权威顺序） */
      type: 'timeline'
      items: AgentTimelineItem[]
    }
  | {
      type: 'done'
      ok: boolean
      productId: string
      message: string
      profile?: ProductProfileDetail
      expansion?: KeywordExpansion
      explorationRun?: ExplorationRun
      scored?: ScoredLeadsArtifact
      emailDrafts?: EmailDraftsArtifact
    }

export type AgentEventSink = (event: AgentEventPayload) => void

function nowTime(): string {
  return new Date().toLocaleTimeString('zh-CN', { hour12: false })
}

function buildPrompt(bootstrap: BootstrapResult): string {
  const websiteLines =
    bootstrap.websiteUrls.length > 0
      ? bootstrap.websiteUrls.map((u) => `- ${u}`).join('\n')
      : '- （无）'
  const fileLines =
    bootstrap.inputFiles.length > 0
      ? bootstrap.inputFiles.map((f) => `- ${f}`).join('\n')
      : '- （无）'

  return [
    '请严格按 skill `extract-product-profile` 执行，从已准备好的资料生成外贸产品画像。',
    '',
    `产品 ID（已分配，必须使用此 ID，禁止调用 product_generate_id 重新生成）：${bootstrap.productId}`,
    '',
    '公司网站 URL：',
    websiteLines,
    '',
    '输入文件（已复制到 inputs/，请用 Read 读取）：',
    fileLines,
    '',
    '执行要求：',
    '1. 调用 lead-store.inputs_ensure_dir（目录已存在亦可）。',
    '2. 有网站则用 chrome-devtools 按需探索；有文件则读取并提取。',
    '3. 组装 ProductProfile 后调用 lead-store.product_save（传入上述 product_id）。',
    '4. readiness 由 lead-store 计算，不要手改。',
    '5. 完成后用简短中文汇报：产品 ID、公司名、核心产品、就绪度分数与 status、缺失字段、下一步建议。',
    '',
    `来源清单：data/products/${bootstrap.productId}/inputs/_sources.json`,
  ].join('\n')
}

function buildExpandKeywordsPrompt(productId: string): string {
  return [
    '请严格按 skill `expand-keywords` 执行，为指定产品扩展获客关键词与搜索查询。',
    '',
    `产品 ID：${productId}`,
    '',
    '执行要求：',
    '1. 调用 lead-store.product_get 确认画像存在且 status == "ready"。',
    '2. 调用 lead-store.keywords_expand（传入上述 product_id）生成并保存 expansion.json。',
    '3. 检查 stats：total_queries >= 30，维度覆盖 ≥ 4；不足则审阅补充后 keywords_save。',
    '4. 完成后用简短中文汇报：总查询数、各维度/轮次分布、3～5 条样例搜索词、下一步建议（discover-leads / R1）。',
    '',
    `输出路径：data/keywords/${productId}/expansion.json`,
  ].join('\n')
}

function buildScoreAndDedupePrompt(productId: string): string {
  return [
    '请严格按 skill `score-and-dedupe` 执行，对指定产品的原始线索评分、去重并分级。',
    '',
    `产品 ID：${productId}`,
    '',
    '执行要求：',
    '1. 调用 lead-store.lead_list_raw 确认存在原始线索；若 total == 0 则停止并提示先运行 discover-leads。',
    '2. 调用 lead-store.leads_score_and_dedupe（传入上述 product_id）完成去重、六维评分与 tier 分级；保留写入 scored.json，同域名淘汰写入 discarded.json。',
    '3. 调用 lead-store.leads_get_scored 核对：deduped_total ≤ raw_total，discarded_total = raw_total - deduped_total，每条含 score_breakdown 与 tier。',
    '4. 用简短中文汇报：原始数→去重后数量→淘汰数量、高/中/低意向分布、Top 5 线索（公司/分数/tier/匹配理由）、下一步 draft-outreach-email。',
    '',
    `输出路径：data/leads/${productId}/scored.json 、 data/leads/${productId}/discarded.json`,
  ].join('\n')
}

function buildDraftOutreachPrompt(
  productId: string,
  leadIds: string[],
): string {
  const idsJson = JSON.stringify(leadIds)
  const limit = Math.min(Math.max(leadIds.length, 1), 50)
  return [
    '请严格按 skill `draft-outreach-email` 执行，为指定线索生成开发信草稿。',
    '',
    `产品 ID：${productId}`,
    `线索 ID 列表 lead_ids：${idsJson}`,
    `limit：${limit}`,
    '',
    '执行要求：',
    '1. 调用 lead-store.leads_get_scored 确认 scored.json 存在；若无则停止并提示先运行 score-and-dedupe。',
    '2. 必须调用 lead-store.email_draft_generate，传入上述 product_id、lead_ids、limit，以及 write_markdown: true。禁止用手写/Write 工具直接创建 draft.json。',
    '3. 可选：对生成结果 email_draft_get 审阅；若需润色再 email_draft_save。',
    '4. 用简短中文汇报：生成数量、跳过数量、每条公司名/收件邮箱/short subject、草稿路径；提醒人工审核后再发送。',
    '',
    `输出路径：data/emails/{lead_id}/draft.json 、 data/emails/{lead_id}/draft.md`,
  ].join('\n')
}

function buildDiscoverLeadsPrompt(
  productId: string,
  options: { rounds: string[]; maxQueries: number },
): string {
  const rounds = options.rounds.length ? options.rounds : ['R1']
  return [
    '请严格按 skill `discover-leads` 执行获客探索（默认 R1 广撒网）。',
    '',
    `产品 ID：${productId}`,
    `轮次 rounds：${JSON.stringify(rounds)}`,
    `最多搜索词 max_queries：${options.maxQueries}`,
    '',
    '执行要求：',
    '1. lead-store.product_get 确认画像 ready；lead-store.keywords_get 读取 search_queries。',
    '2. search-api.search_usage 确认当日配额未用尽。',
    '3. lead-store.exploration_start 创建运行记录，记住 run_id。',
    '4. 从 search_queries 筛选指定 rounds，按 priority（high→medium→low）排序，取前 max_queries 条。',
    '5. 对每个搜索词：search-api.search_web → chrome-devtools 打开候选页 → 判断是否目标客户 → 是则 lead_append_raw。',
    '6. 每完成一词 exploration_update；全部结束后 exploration_finish（completed 或 failed）。',
    '7. 用简短中文汇报：run_id、执行词数、线索数、API 用量、3～5 条代表性线索、下一步 score-and-dedupe。',
    '',
    `线索输出：data/leads/${productId}/raw/`,
    `运行记录：data/exploration/${productId}/runs/`,
  ].join('\n')
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 会话结束后短暂重试读产物，仅覆盖落盘时序，不参与结束判定 */
async function loadWithGrace<T>(
  loader: () => T | null,
  options?: { signal?: AbortSignal; attempts?: number; intervalMs?: number },
): Promise<T | null> {
  const attempts = options?.attempts ?? 12
  const intervalMs = options?.intervalMs ?? 500
  for (let i = 0; i < attempts; i++) {
    if (options?.signal?.aborted) return null
    const value = loader()
    if (value) return value
    if (i < attempts - 1) await sleep(intervalMs)
  }
  return null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function summarizeJson(value: unknown, max = 160): string {
  try {
    const raw = typeof value === 'string' ? value : JSON.stringify(value)
    if (!raw) return ''
    return raw.length > max ? `${raw.slice(0, max)}…` : raw
  } catch {
    return ''
  }
}

function eventType(event: unknown): string {
  return asString(asRecord(event)?.type)
}

function eventProps(event: unknown): Record<string, unknown> {
  const root = asRecord(event)
  if (!root) return {}
  return asRecord(root.properties) ?? asRecord(root.data) ?? root
}

function eventSessionId(event: unknown): string {
  const props = eventProps(event)
  const part = asRecord(props.part)
  return (
    asString(props.sessionID) ||
    asString(props.sessionId) ||
    asString(asRecord(props.info)?.sessionID) ||
    asString(part?.sessionID)
  )
}

function getRequestId(event: unknown): string | null {
  const type = eventType(event)
  if (!type.includes('permission') || !type.includes('asked')) return null
  const props = eventProps(event)
  const id =
    props.requestID ?? props.requestId ?? props.id ?? asRecord(props.permission)?.id
  return id != null ? String(id) : null
}

/**
 * 维护有序时间线：
 * - 前缀 system / user 固定
 * - 会话消息按 OpenCode 返回顺序展开
 * - SSE 只更新已有条目正文，不打乱顺序
 */
class TimelineBuilder {
  private prefix: AgentTimelineItem[] = []
  private sessionItems: AgentTimelineItem[] = []
  private suffix: AgentTimelineItem[] = []
  private byId = new Map<string, AgentTimelineItem>()
  private lastFingerprint = ''

  reset(): void {
    this.prefix = []
    this.sessionItems = []
    this.suffix = []
    this.byId.clear()
    this.lastFingerprint = ''
  }

  addPrefix(item: AgentTimelineItem): void {
    this.prefix.push(item)
    this.byId.set(item.id, item)
  }

  addSuffix(item: AgentTimelineItem): void {
    const idx = this.suffix.findIndex((x) => x.id === item.id)
    if (idx >= 0) this.suffix[idx] = item
    else this.suffix.push(item)
    this.byId.set(item.id, item)
  }

  upsertSessionItem(item: AgentTimelineItem, appendIfNew = true): void {
    const existing = this.byId.get(item.id)
    if (existing) {
      existing.body = item.body
      existing.title = item.title
      existing.status = item.status
      existing.time = existing.time || item.time
      return
    }
    if (!appendIfNew) return
    this.sessionItems.push(item)
    this.byId.set(item.id, item)
  }

  appendText(id: string, delta: string): boolean {
    const item = this.byId.get(id)
    if (!item || !delta) return false
    item.body += delta
    return true
  }

  setText(id: string, full: string): boolean {
    const item = this.byId.get(id)
    if (!item) return false
    if (item.body === full) return false
    if (full.startsWith(item.body)) {
      item.body = full
      return true
    }
    if (item.body.startsWith(full)) return false // stale
    item.body = full
    return true
  }

  /** 用会话消息权威列表替换 session 段（保留 prefix） */
  replaceSessionItems(items: AgentTimelineItem[]): void {
    const merged = items.map((item) => {
      const prev = this.byId.get(item.id)
      if (
        prev &&
        prev.body.length > item.body.length &&
        prev.body.startsWith(item.body)
      ) {
        // 保留 SSE 已追加的更长正文
        return { ...item, body: prev.body, time: prev.time || item.time }
      }
      if (prev) {
        return { ...item, time: prev.time || item.time, collapsed: item.collapsed ?? prev.collapsed }
      }
      return { ...item }
    })
    this.sessionItems = merged
    this.byId = new Map()
    for (const item of this.prefix) this.byId.set(item.id, item)
    for (const item of this.sessionItems) this.byId.set(item.id, item)
    for (const item of this.suffix) this.byId.set(item.id, item)
  }

  has(id: string): boolean {
    return this.byId.has(id)
  }

  snapshot(): AgentTimelineItem[] {
    return [...this.prefix, ...this.sessionItems, ...this.suffix].map((item) => ({
      ...item,
    }))
  }

  /** 内容有变化才返回 items，否则 null */
  emitIfChanged(): AgentTimelineItem[] | null {
    const items = this.snapshot()
    const fingerprint = items
      .map((i) => `${i.id}|${i.status ?? ''}|${i.body.length}|${i.title}`)
      .join('||')
    if (fingerprint === this.lastFingerprint) return null
    this.lastFingerprint = fingerprint
    return items
  }
}

export class AgentRunController {
  private abort: AbortController | null = null
  private sessionId: string | null = null
  private running = false

  constructor(private readonly getClient: () => OpencodeClient | null) {}

  isRunning(): boolean {
    return this.running
  }

  async abortCurrent(): Promise<void> {
    this.abort?.abort()
    const client = this.getClient()
    if (client && this.sessionId) {
      try {
        await client.session.abort({ sessionID: this.sessionId })
      } catch {
        // ignore
      }
    }
  }

  async runExpandKeywords(
    productId: string,
    emit: AgentEventSink,
  ): Promise<{ ok: boolean; message: string; expansion?: KeywordExpansion }> {
    if (this.running) {
      throw new Error('已有 Agent 任务在运行，请稍候或先中止')
    }

    const client = this.getClient()
    if (!client) {
      throw new Error('OpenCode 未就绪，请先在设置页确认运行时状态')
    }

    const profile = loadProfile(productId)
    if (!profile) {
      throw new Error(`未找到产品画像：${productId}`)
    }
    if (profile.status !== 'ready') {
      const missing =
        profile.missingFields.length > 0
          ? `缺失：${profile.missingFields.join('、')}`
          : '请先补全并保存画像至就绪'
      throw new Error(`画像未就绪（${profile.status}）。${missing}`)
    }

    this.running = true
    this.abort = new AbortController()
    const signal = this.abort.signal
    const startedAt = Date.now()
    const timeline = new TimelineBuilder()

    const flushTimeline = () => {
      const items = timeline.emitIfChanged()
      if (items) emit({ type: 'timeline', items })
    }

    const pushState = (status: 'idle' | 'running' | 'done' | 'error') => {
      const elapsedSec = Math.max(0, Math.round((Date.now() - startedAt) / 1000))
      const mm = String(Math.floor(elapsedSec / 60)).padStart(2, '0')
      const ss = String(elapsedSec % 60).padStart(2, '0')
      let readiness = '扩展中'
      let tone = 'accent'
      if (status === 'done') {
        readiness = '已就绪'
        tone = 'success'
      } else if (status === 'error') {
        readiness = '失败'
        tone = 'warning'
      }
      emit({
        type: 'state',
        skill: 'expand-keywords',
        status,
        productId,
        meta: [
          { label: '状态', value: readiness, tone },
          { label: '产品', value: productId.slice(0, 18) },
          { label: '耗时', value: `${mm}:${ss}` },
          { label: '来源', value: '画像' },
        ],
      })
    }

    const promptText = buildExpandKeywordsPrompt(productId)
    timeline.reset()
    timeline.addPrefix({
      id: 'sys-prepare',
      kind: 'system',
      time: nowTime(),
      title: '系统',
      body: `准备为 ${productId}（${profile.companyName || '未命名'}）扩展关键词`,
    })
    timeline.addPrefix({
      id: 'user-expand',
      kind: 'user',
      time: nowTime(),
      title: '你的指令 · 新建探索任务',
      body: promptText,
      collapsed: true,
    })
    pushState('running')
    flushTimeline()

    let stopEvents: (() => void) | null = null

    try {
      const created = await client.session.create({
        title: `expand-keywords · ${productId}`,
      })
      if (created.error || !created.data?.id) {
        throw new Error(
          typeof created.error === 'object' && created.error && 'message' in created.error
            ? String((created.error as { message?: string }).message)
            : '创建 OpenCode 会话失败',
        )
      }
      this.sessionId = created.data.id
      timeline.addPrefix({
        id: 'sys-session',
        kind: 'system',
        time: nowTime(),
        title: '会话',
        body: `已创建 OpenCode session\n${this.sessionId}`,
      })
      flushTimeline()

      const bridge = this.startEventBridge(
        client,
        this.sessionId,
        timeline,
        flushTimeline,
        promptText,
      )
      stopEvents = bridge.stop

      const promptPromise = client.session.promptAsync({
        sessionID: this.sessionId,
        parts: [{ type: 'text', text: promptText }],
      })
      void promptPromise

      const idleResult = await this.waitForSessionIdle(
        client,
        this.sessionId,
        signal,
        45 * 60_000,
      )

      if (idleResult === 'abort') {
        pushState('error')
        timeline.addSuffix({
          id: 'sys-abort',
          kind: 'error',
          time: nowTime(),
          title: '已中止',
          body: '用户中止了关键词扩展',
        })
        flushTimeline()
        emit({
          type: 'done',
          ok: false,
          productId,
          message: '已中止关键词扩展',
        })
        return { ok: false, message: '已中止关键词扩展' }
      }

      if (idleResult === 'timeout') {
        throw new Error('等待 OpenCode 会话 idle 超时')
      }

      await bridge.ingestNow().catch(() => undefined)

      const expansion = await loadWithGrace(
        () => loadExpansion(productId),
        { signal, attempts: 12, intervalMs: 500 },
      )

      if (!expansion) {
        throw new Error(
          '会话已结束，但未找到 expansion.json。请向上滚动查看工具调用与模型输出。',
        )
      }

      const total = expansion.stats.total_queries
      const message = `关键词已扩展：${productId} · ${total} 条搜索词`
      timeline.addSuffix({
        id: 'sys-done',
        kind: 'system',
        time: nowTime(),
        title: '完成',
        body: message,
      })
      flushTimeline()
      pushState('done')
      emit({
        type: 'done',
        ok: true,
        productId,
        message,
        expansion,
      })
      return { ok: true, message, expansion }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      timeline.addSuffix({
        id: 'sys-error',
        kind: 'error',
        time: nowTime(),
        title: '错误',
        body: message,
      })
      flushTimeline()
      pushState('error')
      emit({
        type: 'done',
        ok: false,
        productId,
        message,
      })
      return { ok: false, message }
    } finally {
      stopEvents?.()
      this.running = false
      this.sessionId = null
      this.abort = null
    }
  }

  async runScoreAndDedupe(
    productId: string,
    emit: AgentEventSink,
  ): Promise<{ ok: boolean; message: string; scored?: ScoredLeadsArtifact }> {
    if (this.running) {
      throw new Error('已有 Agent 任务在运行，请稍候或先中止')
    }

    const client = this.getClient()
    if (!client) {
      throw new Error('OpenCode 未就绪，请先在设置页确认运行时状态')
    }

    const profile = loadProfile(productId)
    if (!profile) {
      throw new Error(`未找到产品画像：${productId}`)
    }

    const rawCount = countRawLeads(productId)
    if (rawCount <= 0) {
      throw new Error('暂无原始线索，请先在探索页完成 R1（discover-leads）')
    }

    this.running = true
    this.abort = new AbortController()
    const signal = this.abort.signal
    const startedAt = Date.now()
    const afterIso = new Date().toISOString()
    const timeline = new TimelineBuilder()

    const flushTimeline = () => {
      const items = timeline.emitIfChanged()
      if (items) emit({ type: 'timeline', items })
    }

    const pushState = (status: 'idle' | 'running' | 'done' | 'error') => {
      const elapsedSec = Math.max(0, Math.round((Date.now() - startedAt) / 1000))
      const mm = String(Math.floor(elapsedSec / 60)).padStart(2, '0')
      const ss = String(elapsedSec % 60).padStart(2, '0')
      let readiness = '评分中'
      let tone = 'accent'
      if (status === 'done') {
        readiness = '已完成'
        tone = 'success'
      } else if (status === 'error') {
        readiness = '失败'
        tone = 'warning'
      }
      emit({
        type: 'state',
        skill: 'score-and-dedupe',
        status,
        productId,
        meta: [
          { label: '状态', value: readiness, tone },
          { label: '原始', value: String(rawCount) },
          { label: '产品', value: productId.slice(0, 18) },
          { label: '耗时', value: `${mm}:${ss}` },
        ],
      })
    }

    const promptText = buildScoreAndDedupePrompt(productId)
    timeline.reset()
    timeline.addPrefix({
      id: 'sys-prepare',
      kind: 'system',
      time: nowTime(),
      title: '系统',
      body: `准备为 ${productId}（${profile.companyName || '未命名'}）评分去重 · 原始线索 ${rawCount} 条`,
    })
    timeline.addPrefix({
      id: 'user-score',
      kind: 'user',
      time: nowTime(),
      title: '你的指令 · 评分去重',
      body: promptText,
      collapsed: true,
    })
    pushState('running')
    flushTimeline()

    let stopEvents: (() => void) | null = null

    try {
      const created = await client.session.create({
        title: `score-and-dedupe · ${productId}`,
      })
      if (created.error || !created.data?.id) {
        throw new Error(
          typeof created.error === 'object' && created.error && 'message' in created.error
            ? String((created.error as { message?: string }).message)
            : '创建 OpenCode 会话失败',
        )
      }
      this.sessionId = created.data.id
      timeline.addPrefix({
        id: 'sys-session',
        kind: 'system',
        time: nowTime(),
        title: '会话',
        body: `已创建 OpenCode session\n${this.sessionId}`,
      })
      flushTimeline()

      const bridge = this.startEventBridge(
        client,
        this.sessionId,
        timeline,
        flushTimeline,
        promptText,
      )
      stopEvents = bridge.stop

      const promptPromise = client.session.promptAsync({
        sessionID: this.sessionId,
        parts: [{ type: 'text', text: promptText }],
      })
      void promptPromise

      const idleResult = await this.waitForSessionIdle(
        client,
        this.sessionId,
        signal,
        20 * 60_000,
      )

      if (idleResult === 'abort') {
        pushState('error')
        timeline.addSuffix({
          id: 'sys-abort',
          kind: 'error',
          time: nowTime(),
          title: '已中止',
          body: '用户中止了评分去重',
        })
        flushTimeline()
        emit({
          type: 'done',
          ok: false,
          productId,
          message: '已中止评分去重',
        })
        return { ok: false, message: '已中止评分去重' }
      }

      if (idleResult === 'timeout') {
        throw new Error('等待 OpenCode 会话 idle 超时')
      }

      await bridge.ingestNow().catch(() => undefined)

      const scored = await loadWithGrace(
        () => {
          const artifact = loadScoredArtifact(productId)
          if (!artifact || artifact.total <= 0) return null
          // 重跑时需确保 scored.json 已更新（有 updatedAt 才校验）
          if (artifact.updatedAt && artifact.updatedAt < afterIso) return null
          return artifact
        },
        { signal, attempts: 16, intervalMs: 500 },
      )

      if (!scored) {
        throw new Error(
          '会话已结束，但未找到更新后的 scored.json。请确认已调用 leads_score_and_dedupe。',
        )
      }

      const message = `评分去重完成：${rawCount} → ${scored.total} 条 · A ${scored.byTier.high} / B ${scored.byTier.medium} / C ${scored.byTier.low}`
      timeline.addSuffix({
        id: 'sys-done',
        kind: 'system',
        time: nowTime(),
        title: '完成',
        body: message,
      })
      flushTimeline()
      pushState('done')
      emit({
        type: 'done',
        ok: true,
        productId,
        message,
        scored,
      })
      return { ok: true, message, scored }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      timeline.addSuffix({
        id: 'sys-error',
        kind: 'error',
        time: nowTime(),
        title: '错误',
        body: message,
      })
      flushTimeline()
      pushState('error')
      emit({
        type: 'done',
        ok: false,
        productId,
        message,
      })
      return { ok: false, message }
    } finally {
      stopEvents?.()
      this.running = false
      this.sessionId = null
      this.abort = null
    }
  }

  async runDraftOutreachEmail(
    productId: string,
    emit: AgentEventSink,
    options?: { leadIds?: string[] },
  ): Promise<{ ok: boolean; message: string; emailDrafts?: EmailDraftsArtifact }> {
    if (this.running) {
      throw new Error('已有 Agent 任务在运行，请稍候或先中止')
    }

    const client = this.getClient()
    if (!client) {
      throw new Error('OpenCode 未就绪，请先在设置页确认运行时状态')
    }

    const profile = loadProfile(productId)
    if (!profile) {
      throw new Error(`未找到产品画像：${productId}`)
    }

    const explicitIds = (options?.leadIds ?? []).map((id) => id.trim()).filter(Boolean)
    const leadIds =
      explicitIds.length > 0
        ? explicitIds
        : listHighLeadsNeedingDraft(productId)

    if (leadIds.length === 0) {
      const message =
        explicitIds.length > 0
          ? '未指定有效线索 ID'
          : '暂无待起草的 high 线索（可能已全部生成草稿）'
      emit({
        type: 'state',
        skill: 'draft-outreach-email',
        status: 'done',
        productId,
        meta: [
          { label: '状态', value: '无需起草', tone: 'success' },
          { label: '目标', value: '0' },
          { label: '产品', value: productId.slice(0, 18) },
        ],
      })
      emit({ type: 'done', ok: true, productId, message })
      return { ok: true, message }
    }

    if (leadIds.length > 50) {
      throw new Error(`一次最多起草 50 封，当前 ${leadIds.length} 条，请缩小范围`)
    }

    this.running = true
    this.abort = new AbortController()
    const signal = this.abort.signal
    const startedAt = Date.now()
    const afterIso = new Date().toISOString()
    const timeline = new TimelineBuilder()
    const modeLabel = explicitIds.length > 0 ? `指定 ${leadIds.length} 条` : `high ${leadIds.length} 条`

    const flushTimeline = () => {
      const items = timeline.emitIfChanged()
      if (items) emit({ type: 'timeline', items })
    }

    const pushState = (status: 'idle' | 'running' | 'done' | 'error') => {
      const elapsedSec = Math.max(0, Math.round((Date.now() - startedAt) / 1000))
      const mm = String(Math.floor(elapsedSec / 60)).padStart(2, '0')
      const ss = String(elapsedSec % 60).padStart(2, '0')
      let readiness = '起草中'
      let tone = 'accent'
      if (status === 'done') {
        readiness = '已完成'
        tone = 'success'
      } else if (status === 'error') {
        readiness = '失败'
        tone = 'warning'
      }
      emit({
        type: 'state',
        skill: 'draft-outreach-email',
        status,
        productId,
        meta: [
          { label: '状态', value: readiness, tone },
          { label: '目标', value: String(leadIds.length) },
          { label: '产品', value: productId.slice(0, 18) },
          { label: '耗时', value: `${mm}:${ss}` },
        ],
      })
    }

    const promptText = buildDraftOutreachPrompt(productId, leadIds)
    timeline.reset()
    timeline.addPrefix({
      id: 'sys-prepare',
      kind: 'system',
      time: nowTime(),
      title: '系统',
      body: `准备为 ${productId}（${profile.companyName || '未命名'}）起草开发信 · ${modeLabel}`,
    })
    timeline.addPrefix({
      id: 'user-draft',
      kind: 'user',
      time: nowTime(),
      title: '你的指令 · 邮件起草',
      body: promptText,
      collapsed: true,
    })
    pushState('running')
    flushTimeline()

    let stopEvents: (() => void) | null = null

    try {
      const created = await client.session.create({
        title: `draft-outreach-email · ${productId}`,
      })
      if (created.error || !created.data?.id) {
        throw new Error(
          typeof created.error === 'object' && created.error && 'message' in created.error
            ? String((created.error as { message?: string }).message)
            : '创建 OpenCode 会话失败',
        )
      }
      this.sessionId = created.data.id
      timeline.addPrefix({
        id: 'sys-session',
        kind: 'system',
        time: nowTime(),
        title: '会话',
        body: `已创建 OpenCode session\n${this.sessionId}`,
      })
      flushTimeline()

      const bridge = this.startEventBridge(
        client,
        this.sessionId,
        timeline,
        flushTimeline,
        promptText,
      )
      stopEvents = bridge.stop

      const promptPromise = client.session.promptAsync({
        sessionID: this.sessionId,
        parts: [{ type: 'text', text: promptText }],
      })
      void promptPromise

      const idleResult = await this.waitForSessionIdle(
        client,
        this.sessionId,
        signal,
        20 * 60_000,
      )

      if (idleResult === 'abort') {
        pushState('error')
        timeline.addSuffix({
          id: 'sys-abort',
          kind: 'error',
          time: nowTime(),
          title: '已中止',
          body: '用户中止了邮件起草',
        })
        flushTimeline()
        emit({
          type: 'done',
          ok: false,
          productId,
          message: '已中止邮件起草',
        })
        return { ok: false, message: '已中止邮件起草' }
      }

      if (idleResult === 'timeout') {
        throw new Error('等待 OpenCode 会话 idle 超时')
      }

      await bridge.ingestNow().catch(() => undefined)

      const emailDrafts = await loadWithGrace(
        () =>
          loadEmailDraftsArtifact(productId, {
            leadIds,
            afterIso,
          }),
        { signal, attempts: 16, intervalMs: 500 },
      )

      if (!emailDrafts) {
        throw new Error(
          '会话已结束，但未找到目标线索的 draft.json。请确认已调用 email_draft_generate。',
        )
      }

      const message = `邮件起草完成：${emailDrafts.total} 封 · 目标 ${leadIds.length} 条`
      timeline.addSuffix({
        id: 'sys-done',
        kind: 'system',
        time: nowTime(),
        title: '完成',
        body: message,
      })
      flushTimeline()
      pushState('done')
      emit({
        type: 'done',
        ok: true,
        productId,
        message,
        emailDrafts,
      })
      return { ok: true, message, emailDrafts }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      timeline.addSuffix({
        id: 'sys-error',
        kind: 'error',
        time: nowTime(),
        title: '错误',
        body: message,
      })
      flushTimeline()
      pushState('error')
      emit({
        type: 'done',
        ok: false,
        productId,
        message,
      })
      return { ok: false, message }
    } finally {
      stopEvents?.()
      this.running = false
      this.sessionId = null
      this.abort = null
    }
  }

  async runDiscoverLeads(
    productId: string,
    emit: AgentEventSink,
    options?: { rounds?: string[]; maxQueries?: number },
  ): Promise<{ ok: boolean; message: string; explorationRun?: ExplorationRun }> {
    if (this.running) {
      throw new Error('已有 Agent 任务在运行，请稍候或先中止')
    }

    const client = this.getClient()
    if (!client) {
      throw new Error('OpenCode 未就绪，请先在设置页确认运行时状态')
    }

    const profile = loadProfile(productId)
    if (!profile) {
      throw new Error(`未找到产品画像：${productId}`)
    }
    if (profile.status !== 'ready') {
      throw new Error(`画像未就绪（${profile.status}），请先补全并保存`)
    }

    const expansion = loadExpansion(productId)
    if (!expansion || expansion.search_queries.length === 0) {
      throw new Error('尚未扩展关键词，请先在画像页「新建探索任务」')
    }

    const rounds = (options?.rounds?.length ? options.rounds : ['R1']).map((r) =>
      r.toUpperCase(),
    )
    const maxQueries = Math.max(1, options?.maxQueries ?? 10)
    const r1Count = expansion.search_queries.filter((q) =>
      rounds.includes(String(q.round).toUpperCase()),
    ).length
    if (r1Count === 0) {
      throw new Error(`expansion.json 中没有 ${rounds.join('/')} 轮次的搜索词`)
    }

    this.running = true
    this.abort = new AbortController()
    const signal = this.abort.signal
    const startedAt = Date.now()
    const afterIso = new Date().toISOString()
    const timeline = new TimelineBuilder()

    const flushTimeline = () => {
      const items = timeline.emitIfChanged()
      if (items) emit({ type: 'timeline', items })
    }

    const pushState = (
      status: 'idle' | 'running' | 'done' | 'error',
      run?: ExplorationRun | null,
    ) => {
      const elapsedSec = Math.max(0, Math.round((Date.now() - startedAt) / 1000))
      const mm = String(Math.floor(elapsedSec / 60)).padStart(2, '0')
      const ss = String(elapsedSec % 60).padStart(2, '0')
      let label = '探索中'
      let tone = 'accent'
      if (status === 'done') {
        label = '已完成'
        tone = 'success'
      } else if (status === 'error') {
        label = '失败'
        tone = 'warning'
      }
      const progress =
        run != null
          ? `${run.queries_executed}/${Math.min(maxQueries, r1Count)}`
          : `0/${Math.min(maxQueries, r1Count)}`
      emit({
        type: 'state',
        skill: 'discover-leads',
        status,
        productId,
        meta: [
          { label: '状态', value: label, tone },
          { label: '进度', value: progress },
          {
            label: '线索',
            value: run != null ? String(run.leads_found) : '0',
          },
          { label: '耗时', value: `${mm}:${ss}` },
        ],
      })
    }

    const promptText = buildDiscoverLeadsPrompt(productId, { rounds, maxQueries })
    timeline.reset()
    timeline.addPrefix({
      id: 'sys-prepare',
      kind: 'system',
      time: nowTime(),
      title: '系统',
      body: `准备为 ${productId}（${profile.companyName || '未命名'}）执行 ${rounds.join('+')} 探索 · 最多 ${maxQueries} 词（可用 ${r1Count}）`,
    })
    timeline.addPrefix({
      id: 'user-discover',
      kind: 'user',
      time: nowTime(),
      title: '你的指令 · 开始 R1 探索',
      body: promptText,
      collapsed: true,
    })
    pushState('running')
    flushTimeline()

    let stopEvents: (() => void) | null = null

    try {
      const created = await client.session.create({
        title: `discover-leads · ${productId}`,
      })
      if (created.error || !created.data?.id) {
        throw new Error(
          typeof created.error === 'object' && created.error && 'message' in created.error
            ? String((created.error as { message?: string }).message)
            : '创建 OpenCode 会话失败',
        )
      }
      this.sessionId = created.data.id
      timeline.addPrefix({
        id: 'sys-session',
        kind: 'system',
        time: nowTime(),
        title: '会话',
        body: `已创建 OpenCode session\n${this.sessionId}`,
      })
      flushTimeline()

      const bridge = this.startEventBridge(
        client,
        this.sessionId,
        timeline,
        flushTimeline,
        promptText,
      )
      stopEvents = bridge.stop

      const promptPromise = client.session.promptAsync({
        sessionID: this.sessionId,
        parts: [{ type: 'text', text: promptText }],
      })
      void promptPromise

      // 运行中仅用于 UI 进度，不参与结束判定
      const progressTimer = setInterval(() => {
        const current = findLatestRunAfter(productId, afterIso)
        if (current) pushState('running', current)
      }, 2500)

      let idleResult: 'idle' | 'abort' | 'timeout'
      try {
        idleResult = await this.waitForSessionIdle(
          client,
          this.sessionId,
          signal,
          45 * 60_000,
        )
      } finally {
        clearInterval(progressTimer)
      }

      if (idleResult === 'abort') {
        const abortedRun = failLatestRunningExploration(
          productId,
          afterIso,
          '用户中止了 R1 探索',
        )
        pushState('error', abortedRun ?? undefined)
        timeline.addSuffix({
          id: 'sys-abort',
          kind: 'error',
          time: nowTime(),
          title: '已中止',
          body: abortedRun
            ? `用户中止了 R1 探索\nrun ${abortedRun.id} 已标记为 failed`
            : '用户中止了 R1 探索',
        })
        flushTimeline()
        emit({
          type: 'done',
          ok: false,
          productId,
          message: '已中止 R1 探索',
          explorationRun: abortedRun ?? undefined,
        })
        return {
          ok: false,
          message: '已中止 R1 探索',
          explorationRun: abortedRun ?? undefined,
        }
      }

      if (idleResult === 'timeout') {
        failLatestRunningExploration(
          productId,
          afterIso,
          '等待 OpenCode 会话 idle 超时',
        )
        throw new Error('等待 OpenCode 会话 idle 超时')
      }

      await bridge.ingestNow().catch(() => undefined)

      let run = await loadWithGrace(
        () => findLatestRunAfter(productId, afterIso),
        { signal, attempts: 12, intervalMs: 500 },
      )

      if (!run) {
        throw new Error(
          '会话已结束，但未找到探索运行记录。请确认已调用 exploration_start / exploration_finish。',
        )
      }

      if (run.status === 'running') {
        run =
          failLatestRunningExploration(
            productId,
            afterIso,
            '会话已结束但未调用 exploration_finish，已标记为 failed',
          ) ?? run
        const message = `R1 探索未完成：${run.id} · 已执行 ${run.queries_executed} 词 · 线索 ${run.leads_found}`
        timeline.addSuffix({
          id: 'sys-incomplete',
          kind: 'error',
          time: nowTime(),
          title: '未完成',
          body: `${message}\n已将 run 标记为 failed`,
        })
        flushTimeline()
        pushState('error', run)
        emit({
          type: 'done',
          ok: false,
          productId,
          message,
          explorationRun: run,
        })
        return { ok: false, message, explorationRun: run }
      }

      if (run.status === 'failed') {
        const message = `R1 探索失败：${run.id} · 已执行 ${run.queries_executed} 词 · 线索 ${run.leads_found}`
        timeline.addSuffix({
          id: 'sys-failed',
          kind: 'error',
          time: nowTime(),
          title: '失败',
          body: message,
        })
        flushTimeline()
        pushState('error', run)
        emit({
          type: 'done',
          ok: false,
          productId,
          message,
          explorationRun: run,
        })
        return { ok: false, message, explorationRun: run }
      }

      const message = `R1 探索完成：${run.id} · ${run.queries_executed} 词 · 线索 ${run.leads_found}`
      timeline.addSuffix({
        id: 'sys-done',
        kind: 'system',
        time: nowTime(),
        title: '完成',
        body: message,
      })
      flushTimeline()
      pushState('done', run)
      emit({
        type: 'done',
        ok: true,
        productId,
        message,
        explorationRun: run,
      })
      return { ok: true, message, explorationRun: run }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const failedRun = failLatestRunningExploration(productId, afterIso, message)
      timeline.addSuffix({
        id: 'sys-error',
        kind: 'error',
        time: nowTime(),
        title: '错误',
        body: message,
      })
      flushTimeline()
      pushState('error', failedRun ?? undefined)
      emit({
        type: 'done',
        ok: false,
        productId,
        message,
        explorationRun: failedRun ?? undefined,
      })
      return { ok: false, message, explorationRun: failedRun ?? undefined }
    } finally {
      stopEvents?.()
      this.running = false
      this.sessionId = null
      this.abort = null
    }
  }

  async runExtractProfile(
    bootstrap: BootstrapResult,
    emit: AgentEventSink,
  ): Promise<{ ok: boolean; message: string; profile?: ProductProfileDetail }> {
    if (this.running) {
      throw new Error('已有 Agent 任务在运行，请稍候或先中止')
    }

    const client = this.getClient()
    if (!client) {
      throw new Error('OpenCode 未就绪，请先在设置页确认运行时状态')
    }

    this.running = true
    this.abort = new AbortController()
    const signal = this.abort.signal
    const startedAt = Date.now()
    const timeline = new TimelineBuilder()

    const flushTimeline = () => {
      const items = timeline.emitIfChanged()
      if (items) emit({ type: 'timeline', items })
    }

    const pushState = (status: 'idle' | 'running' | 'done' | 'error') => {
      const elapsedSec = Math.max(0, Math.round((Date.now() - startedAt) / 1000))
      const mm = String(Math.floor(elapsedSec / 60)).padStart(2, '0')
      const ss = String(elapsedSec % 60).padStart(2, '0')
      let readiness = '生成中'
      let tone = 'accent'
      if (status === 'done') {
        readiness = '已写入'
        tone = 'success'
      } else if (status === 'error') {
        readiness = '失败'
        tone = 'warning'
      }
      emit({
        type: 'state',
        skill: 'extract-product-profile',
        status,
        productId: bootstrap.productId,
        meta: [
          { label: '就绪度', value: readiness, tone },
          {
            label: '选中',
            value: `${bootstrap.websiteUrls.length + bootstrap.inputFiles.length} 项`,
          },
          { label: '耗时', value: `${mm}:${ss}` },
          { label: '来源', value: '资料库' },
        ],
      })
    }

    const promptText = buildPrompt(bootstrap)
    timeline.reset()
    timeline.addPrefix({
      id: 'sys-prepare',
      kind: 'system',
      time: nowTime(),
      title: '系统',
      body: `已分配产品 ID ${bootstrap.productId}，并复制 ${bootstrap.inputFiles.length} 个文件到 inputs/`,
    })
    if (bootstrap.websiteUrls.length) {
      timeline.addPrefix({
        id: 'sys-websites',
        kind: 'system',
        time: nowTime(),
        title: '资料来源 · 网站',
        body: bootstrap.websiteUrls.join('\n'),
      })
    }
    if (bootstrap.skipped.length) {
      timeline.addPrefix({
        id: 'sys-skipped',
        kind: 'system',
        time: nowTime(),
        title: '已跳过',
        body: bootstrap.skipped.join('\n'),
      })
    }
    timeline.addPrefix({
      id: 'user-generate',
      kind: 'user',
      time: nowTime(),
      title: '你的指令 · 生成画像',
      body: promptText,
      collapsed: true,
    })
    pushState('running')
    flushTimeline()

    let stopEvents: (() => void) | null = null

    try {
      const created = await client.session.create({
        title: `extract-product-profile · ${bootstrap.productId}`,
      })
      if (created.error || !created.data?.id) {
        throw new Error(
          typeof created.error === 'object' && created.error && 'message' in created.error
            ? String((created.error as { message?: string }).message)
            : '创建 OpenCode 会话失败',
        )
      }
      this.sessionId = created.data.id
      timeline.addPrefix({
        id: 'sys-session',
        kind: 'system',
        time: nowTime(),
        title: '会话',
        body: `已创建 OpenCode session\n${this.sessionId}`,
      })
      flushTimeline()

      const bridge = this.startEventBridge(
        client,
        this.sessionId,
        timeline,
        flushTimeline,
        promptText,
      )
      stopEvents = bridge.stop

      const promptPromise = client.session.promptAsync({
        sessionID: this.sessionId,
        parts: [{ type: 'text', text: promptText }],
      })
      void promptPromise

      const idleResult = await this.waitForSessionIdle(
        client,
        this.sessionId,
        signal,
        45 * 60_000,
      )

      if (idleResult === 'abort') {
        pushState('error')
        timeline.addSuffix({
          id: 'sys-abort',
          kind: 'error',
          time: nowTime(),
          title: '已中止',
          body: '用户中止了画像生成',
        })
        flushTimeline()
        emit({
          type: 'done',
          ok: false,
          productId: bootstrap.productId,
          message: '已中止画像生成',
        })
        return { ok: false, message: '已中止画像生成' }
      }

      if (idleResult === 'timeout') {
        throw new Error('等待 OpenCode 会话 idle 超时')
      }

      await bridge.ingestNow().catch(() => undefined)

      const profile = await loadWithGrace(
        () => loadProfile(bootstrap.productId),
        { signal, attempts: 12, intervalMs: 500 },
      )

      if (!profile) {
        throw new Error(
          '会话已结束，但未找到 profile.json。请向上滚动查看工具调用与模型输出。',
        )
      }

      const score =
        profile.readinessScore != null ? String(profile.readinessScore) : '—'
      const message = `画像已生成：${profile.id} · ${profile.status} · 就绪度 ${score}`
      timeline.addSuffix({
        id: 'sys-done',
        kind: 'system',
        time: nowTime(),
        title: '完成',
        body: message,
      })
      flushTimeline()
      pushState('done')
      emit({
        type: 'done',
        ok: true,
        productId: bootstrap.productId,
        message,
        profile,
      })
      return { ok: true, message, profile }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      timeline.addSuffix({
        id: 'sys-error',
        kind: 'error',
        time: nowTime(),
        title: '错误',
        body: message,
      })
      flushTimeline()
      pushState('error')
      emit({
        type: 'done',
        ok: false,
        productId: bootstrap.productId,
        message,
      })
      return { ok: false, message }
    } finally {
      stopEvents?.()
      this.running = false
      this.sessionId = null
      this.abort = null
    }
  }

  /**
   * 任务是否终止：仅以 OpenCode 官方会话状态为准（v2.wait / session.status）。
   * 业务成败在返回 idle 后再读产物判断，不在此处做。
   */
  private async waitForSessionIdle(
    client: OpencodeClient,
    sessionId: string,
    signal: AbortSignal,
    timeoutMs = 12 * 60_000,
  ): Promise<'idle' | 'abort' | 'timeout'> {
    if (signal.aborted) return 'abort'
    const started = Date.now()

    const official = await this.tryOfficialSessionWait(
      client,
      sessionId,
      signal,
      timeoutMs,
    )
    if (official !== 'unavailable') return official

    const remaining = Math.max(5_000, timeoutMs - (Date.now() - started))
    return this.pollSessionIdle(client, sessionId, signal, remaining)
  }

  /** 优先官方 wait；503/未实现等则返回 unavailable 走 status 轮询 */
  private async tryOfficialSessionWait(
    client: OpencodeClient,
    sessionId: string,
    signal: AbortSignal,
    timeoutMs: number,
  ): Promise<'idle' | 'abort' | 'timeout' | 'unavailable'> {
    if (signal.aborted) return 'abort'

    const local = new AbortController()
    const onParentAbort = () => local.abort()
    signal.addEventListener('abort', onParentAbort)
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      local.abort()
    }, timeoutMs)

    try {
      const res = await client.v2.session.wait(
        { sessionID: sessionId },
        { signal: local.signal },
      )
      if (signal.aborted) return 'abort'
      if (timedOut) return 'timeout'
      const status = res.response?.status
      if (status === 204 || (status != null && status >= 200 && status < 300)) {
        return 'idle'
      }
      return 'unavailable'
    } catch {
      if (signal.aborted) return 'abort'
      if (timedOut) return 'timeout'
      return 'unavailable'
    } finally {
      clearTimeout(timer)
      signal.removeEventListener('abort', onParentAbort)
    }
  }

  private async pollSessionIdle(
    client: OpencodeClient,
    sessionId: string,
    signal: AbortSignal,
    timeoutMs: number,
  ): Promise<'idle' | 'abort' | 'timeout'> {
    const started = Date.now()
    /** 避免 promptAsync 后瞬间仍是 idle 就误判结束 */
    let sawActive = false
    const activeDeadlineMs = 30_000

    while (!signal.aborted && Date.now() - started < timeoutMs) {
      try {
        const status = await client.session.status({})
        const map = asRecord(status.data) ?? {}
        const entry = asRecord(map[sessionId])
        // 不在 map 中时服务端语义为 idle
        const type = asString(entry?.type) || 'idle'

        if (type === 'busy' || type === 'retry') {
          sawActive = true
        } else if (type === 'idle') {
          const waitedLongEnough = Date.now() - started >= activeDeadlineMs
          if (sawActive || waitedLongEnough) {
            await sleep(400)
            if (signal.aborted) return 'abort'
            return 'idle'
          }
        }
      } catch {
        // 瞬时错误忽略，继续轮询
      }
      await sleep(1000)
    }

    if (signal.aborted) return 'abort'
    return 'timeout'
  }

  private startEventBridge(
    client: OpencodeClient,
    sessionId: string,
    timeline: TimelineBuilder,
    flush: () => void,
    userPrompt: string,
  ): { stop: () => void; ingestNow: () => Promise<void> } {
    let stopped = false

    const normalizeMessageRows = (raw: unknown): unknown[] => {
      if (Array.isArray(raw)) return raw
      const rec = asRecord(raw)
      if (!rec) return []
      if (Array.isArray(rec.data)) return rec.data
      if (Array.isArray(rec.messages)) return rec.messages
      return []
    }

    const ingestMessages = async () => {
      const res = await client.session.messages({ sessionID: sessionId, limit: 80 })
      const rows = normalizeMessageRows(res.data)
      const nextSession: AgentTimelineItem[] = []

      for (const row of rows) {
        const info = asRecord(asRecord(row)?.info) ?? asRecord(row)
        const role = asString(info?.role)
        const messageId = asString(info?.id) || `msg-${nextSession.length}`
        const parts = Array.isArray(asRecord(row)?.parts)
          ? (asRecord(row)!.parts as unknown[])
          : []

        if (role === 'user') {
          const text = parts
            .map((p) => asRecord(p))
            .filter((p) => p && asString(p.type) === 'text' && !p.ignored)
            .map((p) => asString(p!.text))
            .join('\n')
            .trim()
          if (!text || text === userPrompt.trim()) continue
          nextSession.push({
            id: `user-${messageId}`,
            kind: 'user',
            time: nowTime(),
            title: '你的补充指令',
            body: text,
            collapsed: text.length > 280,
          })
          continue
        }

        if (role !== 'assistant') continue

        for (const raw of parts) {
          const part = asRecord(raw)
          if (!part || part.ignored === true) continue
          const partType = asString(part.type)
          const partId = asString(part.id) || `${messageId}-${partType}-${nextSession.length}`

          if (partType === 'reasoning') {
            const text = asString(part.text)
            if (!text) continue
            nextSession.push({
              id: `reasoning-${partId}`,
              kind: 'reasoning',
              time: nowTime(),
              title: '思考',
              body: text,
              collapsed: text.length > 400,
            })
            continue
          }

          if (partType === 'text') {
            const text = asString(part.text)
            if (!text) continue
            nextSession.push({
              id: `assistant-${partId}`,
              kind: 'assistant',
              time: nowTime(),
              title: '模型回复',
              body: text,
            })
            continue
          }

          if (partType === 'tool') {
            const toolName = asString(part.tool) || 'tool'
            const state = asRecord(part.state)
            const statusRaw = asString(state?.status)
            let status: 'running' | 'done' | 'error' = 'running'
            if (statusRaw === 'completed') status = 'done'
            else if (statusRaw === 'error') status = 'error'
            const title =
              status === 'done'
                ? `工具 · ${toolName} · 完成`
                : status === 'error'
                  ? `工具 · ${toolName} · 失败`
                  : `工具 · ${toolName}`
            const detailParts: string[] = []
            const stateTitle = asString(state?.title)
            if (stateTitle) detailParts.push(stateTitle)
            const input = summarizeJson(state?.input, 200)
            if (input) detailParts.push(`输入: ${input}`)
            if (status === 'done') {
              const out = asString(state?.output)
              if (out) detailParts.push(`输出: ${out.slice(0, 240)}${out.length > 240 ? '…' : ''}`)
            }
            if (status === 'error') {
              detailParts.push(asString(state?.error) || '调用失败')
            }
            nextSession.push({
              id: `tool-${partId}`,
              kind: 'tool',
              time: nowTime(),
              title,
              body: detailParts.join('\n') || '执行中…',
              status,
            })
          }
        }
      }

      timeline.replaceSessionItems(nextSession)
      flush()
    }

    const upsertTextItem = (
      kind: 'assistant' | 'reasoning',
      partId: string,
      deltaOrFull: string,
      mode: 'append' | 'set',
      title: string,
    ) => {
      if (!partId) return
      const id = `${kind}-${partId}`
      if (!timeline.has(id)) {
        timeline.upsertSessionItem({
          id,
          kind,
          time: nowTime(),
          title,
          body: mode === 'set' ? deltaOrFull : deltaOrFull,
          collapsed: kind === 'reasoning',
        })
        flush()
        return
      }
      if (mode === 'set') {
        if (timeline.setText(id, deltaOrFull)) flush()
      } else if (timeline.appendText(id, deltaOrFull)) {
        flush()
      }
    }

    const handleLiveDelta = (event: unknown) => {
      const type = eventType(event)
      const props = eventProps(event)

      if (type === 'session.next.text.started') {
        const textId = asString(props.textID) || asString(props.partID)
        upsertTextItem('assistant', textId, '', 'set', '模型回复')
        return
      }
      if (type === 'session.next.text.delta' || type.endsWith('text.delta')) {
        const textId = asString(props.textID) || asString(props.partID) || 'live'
        upsertTextItem('assistant', textId, asString(props.delta), 'append', '模型回复')
        return
      }
      if (type === 'session.next.text.ended' || type.endsWith('text.ended')) {
        const textId = asString(props.textID) || asString(props.partID) || 'live'
        const full = asString(props.text)
        if (full) upsertTextItem('assistant', textId, full, 'set', '模型回复')
        return
      }
      if (type === 'session.next.reasoning.started') {
        const rid = asString(props.reasoningID) || asString(props.partID)
        upsertTextItem('reasoning', rid, '', 'set', '思考')
        return
      }
      if (type === 'session.next.reasoning.delta' || type.endsWith('reasoning.delta')) {
        const rid = asString(props.reasoningID) || asString(props.partID) || 'live'
        upsertTextItem('reasoning', rid, asString(props.delta), 'append', '思考')
        return
      }
      if (type === 'session.next.reasoning.ended' || type.endsWith('reasoning.ended')) {
        const rid = asString(props.reasoningID) || asString(props.partID) || 'live'
        const full = asString(props.text)
        if (full) upsertTextItem('reasoning', rid, full, 'set', '思考')
        return
      }
      if (type === 'message.part.delta') {
        const field = asString(props.field)
        const kind = field.includes('reason') ? 'reasoning' : 'assistant'
        const partId = asString(props.partID) || 'live'
        upsertTextItem(
          kind,
          partId,
          asString(props.delta),
          'append',
          kind === 'reasoning' ? '思考' : '模型回复',
        )
        return
      }
      if (type === 'message.part.updated') {
        const part = asRecord(props.part)
        if (!part || part.ignored === true) return
        const partType = asString(part.type)
        const partId = asString(part.id)
        if (partType === 'text' && partId) {
          const text = asString(part.text)
          if (text) upsertTextItem('assistant', partId, text, 'set', '模型回复')
        } else if (partType === 'reasoning' && partId) {
          const text = asString(part.text)
          if (text) upsertTextItem('reasoning', partId, text, 'set', '思考')
        }
      }
    }

    void (async () => {
      try {
        const sub = await client.event.subscribe()
        for await (const event of sub.stream) {
          if (stopped) break
          const sid = eventSessionId(event)
          const type = eventType(event)
          if (sid && sid !== sessionId && !type.includes('permission')) continue

          const requestId = getRequestId(event)
          if (requestId) {
            try {
              await client.permission.reply({ requestID: requestId, reply: 'always' })
            } catch {
              // ignore
            }
          }

          handleLiveDelta(event)

          if (
            type === 'message.part.updated' ||
            type.includes('tool.') ||
            type.includes('text.ended') ||
            type.includes('reasoning.ended') ||
            type === 'session.idle' ||
            type.includes('message.updated')
          ) {
            try {
              await ingestMessages()
            } catch {
              // ignore
            }
          }
        }
      } catch {
        // SSE 失败时仅靠轮询
      }
    })()

    const pollTimer = setInterval(() => {
      if (stopped) return
      void ingestMessages().catch(() => undefined)
      void (async () => {
        try {
          const list = await client.permission.list()
          const items = Array.isArray(list.data) ? list.data : []
          for (const item of items) {
            const rec = asRecord(item)
            const id = rec?.id ?? rec?.requestID
            if (!id) continue
            await client.permission.reply({
              requestID: String(id),
              reply: 'always',
            })
          }
        } catch {
          // ignore
        }
      })()
    }, 1000)

    void ingestMessages().catch(() => undefined)

    return {
      stop: () => {
        stopped = true
        clearInterval(pollTimer)
      },
      ingestNow: ingestMessages,
    }
  }
}
