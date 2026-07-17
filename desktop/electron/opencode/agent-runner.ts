import type { OpencodeClient } from '@opencode-ai/sdk/v2'
import type { BootstrapResult } from '../profile/profile-bootstrap'
import {
  loadProfile,
  waitForProfile,
  type ProductProfileDetail,
} from '../profile/profile-reader'
import {
  loadExpansion,
  waitForExpansion,
  type KeywordExpansion,
} from '../keywords/keywords-reader'

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

      stopEvents = this.startEventBridge(
        client,
        this.sessionId,
        timeline,
        flushTimeline,
        promptText,
      )

      const promptPromise = client.session.promptAsync({
        sessionID: this.sessionId,
        parts: [{ type: 'text', text: promptText }],
      })

      const expansionPromise = waitForExpansion(productId, {
        signal,
        afterIso,
        timeoutMs: 12 * 60_000,
      })
      const idlePromise = this.waitUntilIdle(client, this.sessionId, signal)

      const raced = await Promise.race([
        expansionPromise.then((expansion) => ({
          kind: 'expansion' as const,
          expansion,
        })),
        idlePromise.then(() => ({ kind: 'idle' as const })),
        new Promise<{ kind: 'abort' }>((resolve) => {
          signal.addEventListener('abort', () => resolve({ kind: 'abort' }), {
            once: true,
          })
        }),
      ])

      void promptPromise

      if (raced.kind === 'abort') {
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

      let expansion =
        raced.kind === 'expansion' ? raced.expansion : loadExpansion(productId)
      if (!expansion) {
        expansion = await waitForExpansion(productId, {
          signal,
          afterIso,
          timeoutMs: 45_000,
          intervalMs: 1000,
        })
      }

      if (!expansion) {
        throw new Error(
          'Agent 已结束，但未找到 expansion.json。请向上滚动查看工具调用与模型输出。',
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

      stopEvents = this.startEventBridge(
        client,
        this.sessionId,
        timeline,
        flushTimeline,
        promptText,
      )

      const promptPromise = client.session.promptAsync({
        sessionID: this.sessionId,
        parts: [{ type: 'text', text: promptText }],
      })

      const profilePromise = waitForProfile(bootstrap.productId, {
        signal,
        timeoutMs: 12 * 60_000,
      })
      const idlePromise = this.waitUntilIdle(client, this.sessionId, signal)

      const raced = await Promise.race([
        profilePromise.then((profile) => ({ kind: 'profile' as const, profile })),
        idlePromise.then(() => ({ kind: 'idle' as const })),
        new Promise<{ kind: 'abort' }>((resolve) => {
          signal.addEventListener('abort', () => resolve({ kind: 'abort' }), {
            once: true,
          })
        }),
      ])

      void promptPromise

      if (raced.kind === 'abort') {
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

      let profile =
        raced.kind === 'profile' ? raced.profile : loadProfile(bootstrap.productId)
      if (!profile) {
        profile = await waitForProfile(bootstrap.productId, {
          signal,
          timeoutMs: 45_000,
          intervalMs: 1000,
        })
      }

      if (!profile) {
        throw new Error(
          'Agent 已结束，但未找到 profile.json。请向上滚动查看工具调用与模型输出。',
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

  private async waitUntilIdle(
    client: OpencodeClient,
    sessionId: string,
    signal: AbortSignal,
  ): Promise<void> {
    const started = Date.now()
    const timeoutMs = 12 * 60_000
    while (!signal.aborted && Date.now() - started < timeoutMs) {
      try {
        const status = await client.session.status({})
        const map = asRecord(status.data) ?? {}
        const entry = asRecord(map[sessionId])
        if (asString(entry?.type) === 'idle') {
          await new Promise((r) => setTimeout(r, 800))
          return
        }
      } catch {
        // ignore
      }
      await new Promise((r) => setTimeout(r, 1200))
    }
  }

  private startEventBridge(
    client: OpencodeClient,
    sessionId: string,
    timeline: TimelineBuilder,
    flush: () => void,
    userPrompt: string,
  ): () => void {
    let stopped = false

    const ingestMessages = async () => {
      const res = await client.session.messages({ sessionID: sessionId, limit: 80 })
      const rows = Array.isArray(res.data) ? res.data : []
      // 按消息顺序重建 session 段（保留 prefix）
      const nextSession: AgentTimelineItem[] = []

      for (const row of rows) {
        const info = asRecord(asRecord(row)?.info)
        const role = asString(info?.role)
        const messageId = asString(info?.id) || `msg-${nextSession.length}`
        const parts = Array.isArray(asRecord(row)?.parts)
          ? (asRecord(row)!.parts as unknown[])
          : []

        if (role === 'user') {
          // 已在 prefix 展示「你的指令」，跳过会话里重复的同一 prompt
          const text = parts
            .map((p) => asRecord(p))
            .filter((p) => p && asString(p.type) === 'text')
            .map((p) => asString(p!.text))
            .join('\n')
            .trim()
          if (!text || text === userPrompt.trim()) continue
          const id = `user-${messageId}`
          nextSession.push({
            id,
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
          if (!part) continue
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

      // 用权威消息列表替换 session 段，避免乱序
      timeline.replaceSessionItems(nextSession)
      flush()
    }

    const handleLiveDelta = (event: unknown) => {
      // 仅对已存在的条目追加增量，不新建条目，避免打乱消息顺序
      const type = eventType(event)
      const props = eventProps(event)

      if (type === 'session.next.text.delta' || type.endsWith('text.delta')) {
        const id = `assistant-${asString(props.textID) || asString(props.partID) || 'live'}`
        if (timeline.has(id) && timeline.appendText(id, asString(props.delta))) flush()
        return
      }
      if (type === 'session.next.reasoning.delta' || type.endsWith('reasoning.delta')) {
        const id = `reasoning-${asString(props.reasoningID) || asString(props.partID) || 'live'}`
        if (timeline.has(id) && timeline.appendText(id, asString(props.delta))) flush()
        return
      }
      if (type === 'message.part.delta') {
        const field = asString(props.field)
        const kind = field.includes('reason') ? 'reasoning' : 'assistant'
        const id = `${kind}-${asString(props.partID) || 'live'}`
        if (timeline.has(id) && timeline.appendText(id, asString(props.delta))) flush()
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

          // part 更新 / 工具完成时，立即用消息列表重排一次
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

    // 首次立刻拉一次
    void ingestMessages().catch(() => undefined)

    return () => {
      stopped = true
      clearInterval(pollTimer)
    }
  }
}
