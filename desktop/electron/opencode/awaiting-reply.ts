/**
 * 等待用户回复：纯决策与主进程槽。
 * 不依赖 Electron。协议与文案以 US-AQ-00～03 为准。
 */

export const AWAITING_REPLY_TIMEOUT_MS = 600_000

export const AWAITING_REPLY_SUBMIT_FAILED_MESSAGE = '没能提交，请再试一次，或结束任务。'

export const AWAITING_REPLY_TIMELINE_SUBMITTED = '已提交，任务继续。'
export const AWAITING_REPLY_TIMELINE_ALREADY_DONE = '这次等待已经结束。'
export const AWAITING_REPLY_TIMELINE_TIMEOUT_REJECTED = '长时间没有回复，本次等待已结束。'
export const AWAITING_REPLY_TIMELINE_TIMEOUT_MULTI = '长时间没有回复，每题已按第一项继续。'

export function awaitingReplyTimeoutSingleTimeline(label: string): string {
  return `长时间没有回复，已按「${label}」继续。`
}

export type DisplayQuestion = {
  header: string
  question: string
  multiple: boolean
  custom: boolean
  options: Array<{ label: string; description: string }>
}

export type AwaitingReplyView = {
  questions: DisplayQuestion[]
  renderable: boolean
}

export type QuestionSelection = {
  optionLabels: string[]
  customText: string
}

export type QuestionSide = 'v1' | 'v2'

export type QuestionSideResult = 'ok' | 'not-found' | 'failed'

export type AwaitTimeoutDecision =
  | { action: 'reply'; answers: string[][] }
  | { action: 'reject'; reason: 'multiple' | 'no-options' | 'unrenderable' }

type MatchKey = {
  header: string
  question: string
  multiple: boolean
  custom: boolean
  optionsOk: boolean
  labels: string[]
}

export function resolveAwaitingReplyTimeoutMs(
  envValue: string | undefined,
  fallback = AWAITING_REPLY_TIMEOUT_MS,
): number {
  if (typeof envValue !== 'string') return fallback
  const trimmed = envValue.trim()
  if (!/^[0-9]+$/.test(trimmed)) return fallback
  const value = Number(trimmed)
  if (!Number.isSafeInteger(value) || value <= 0) return fallback
  return value
}

export function decideAwaitingReplyTimeout(input: {
  renderable: boolean
  questions: Array<{ multiple?: boolean; options?: Array<{ label?: string }> }>
}): AwaitTimeoutDecision {
  const questions = input.questions ?? []
  if (input.renderable !== true || questions.length === 0) {
    return { action: 'reject', reason: 'unrenderable' }
  }
  if (questions.some((question) => question.multiple === true)) {
    return { action: 'reject', reason: 'multiple' }
  }
  for (const question of questions) {
    const first = question.options?.[0]?.label
    if (typeof first !== 'string' || first.trim() === '') {
      return { action: 'reject', reason: 'no-options' }
    }
  }
  return {
    action: 'reply',
    answers: questions.map((question) => [String(question.options?.[0]?.label)]),
  }
}

export function buildQuestionAnswers(
  questions: Array<{
    multiple?: boolean
    custom?: boolean
    options: Array<{ label: string }>
  }>,
  selections: Array<{ optionLabels: string[]; customText: string }>,
): { ok: true; answers: string[][] } | { ok: false } {
  if (!Array.isArray(questions) || !Array.isArray(selections)) return { ok: false }
  if (questions.length === 0 || selections.length !== questions.length) return { ok: false }

  const answers: string[][] = []
  for (let index = 0; index < questions.length; index += 1) {
    const question = questions[index]
    const selection = selections[index]
    if (!question || !selection || !Array.isArray(question.options)) return { ok: false }
    if (!Array.isArray(selection.optionLabels)) return { ok: false }
    const customText = typeof selection.customText === 'string' ? selection.customText.trim() : ''
    const customOn = question.custom === true
    const built = buildOneAnswer(question, selection.optionLabels, customText, customOn)
    if (!built) return { ok: false }
    answers.push(built)
  }
  return { ok: true, answers }
}

function buildOneAnswer(
  question: { multiple?: boolean; options: Array<{ label: string }> },
  optionLabels: string[],
  customText: string,
  customOn: boolean,
): string[] | null {
  if (question.multiple !== true && customOn && customText) {
    return [customText]
  }

  const ordered: string[] = []
  const wanted = new Set<string>()
  for (const raw of optionLabels) {
    if (typeof raw !== 'string') return null
    const hit = question.options.find((option) => option.label.trim() === raw.trim())
    if (!hit) return null
    wanted.add(hit.label)
  }
  for (const option of question.options) {
    if (wanted.has(option.label)) ordered.push(option.label)
  }

  if (question.multiple === true) {
    const answers = ordered.slice()
    if (customOn && customText) answers.push(customText)
    if (answers.length === 0) return null
    return answers
  }

  if (ordered.length !== 1) return null
  return [ordered[0]]
}

export function assessQuestionRequest(raw: unknown): {
  renderable: boolean
  questions: DisplayQuestion[]
  fingerprint: string
} {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { renderable: false, questions: [], fingerprint: 'invalid' }
  }
  const keys: MatchKey[] = []
  const questions: DisplayQuestion[] = []
  let renderable = true
  for (const item of raw) {
    const parsed = parseQuestion(item)
    if (!parsed) {
      renderable = false
      keys.push({
        header: '',
        question: '',
        multiple: false,
        custom: false,
        optionsOk: false,
        labels: [],
      })
      continue
    }
    keys.push(parsed.key)
    if (parsed.display) questions.push(parsed.display)
    else renderable = false
  }
  if (!renderable) {
    return { renderable: false, questions: [], fingerprint: JSON.stringify(keys) }
  }
  return { renderable: true, questions, fingerprint: JSON.stringify(keys) }
}

function parseQuestion(item: unknown): { key: MatchKey; display: DisplayQuestion | null } | null {
  if (!item || typeof item !== 'object') return null
  const rec = item as Record<string, unknown>
  const header = typeof rec.header === 'string' ? rec.header.trim() : ''
  const question = typeof rec.question === 'string' ? rec.question.trim() : ''
  const multiple = rec.multiple === true
  const custom = rec.custom === true
  const optionsRaw = rec.options
  const optionsOk = Array.isArray(optionsRaw)
  const labels: string[] = []
  const options: Array<{ label: string; description: string }> = []
  if (optionsOk) {
    for (const opt of optionsRaw) {
      if (!opt || typeof opt !== 'object') {
        return {
          key: { header, question, multiple, custom, optionsOk: false, labels: [] },
          display: null,
        }
      }
      const row = opt as Record<string, unknown>
      if (typeof row.label !== 'string' || typeof row.description !== 'string') {
        return {
          key: { header, question, multiple, custom, optionsOk: false, labels: [] },
          display: null,
        }
      }
      labels.push(row.label)
      options.push({ label: row.label, description: row.description })
    }
  }
  const key: MatchKey = { header, question, multiple, custom, optionsOk, labels }
  const hasLabel = labels.some((label) => label.trim() !== '')
  const displayOk = header !== '' && question !== '' && optionsOk && (hasLabel || custom)
  if (!displayOk) return { key, display: null }
  return {
    key,
    display: { header, question, multiple, custom, options },
  }
}

export function formatQuestionToolCard(
  tool: string,
  status: 'running' | 'done' | 'error',
): { title: string; body: string; collapsed: true } | null {
  const name = tool.trim().toLowerCase()
  if (name !== 'question' && !name.startsWith('question.')) return null
  const title =
    status === 'done' ? '等待回复 · 完成' : status === 'error' ? '等待回复 · 失败' : '等待回复'
  return { title, body: '等待你的选择', collapsed: true }
}

export function buildV1QuestionReplyCall(requestID: string, answers: string[][]): {
  requestID: string
  answers: string[][]
} {
  return { requestID, answers }
}

export function buildV1QuestionRejectCall(requestID: string): { requestID: string } {
  return { requestID }
}

export function buildV2QuestionReplyCall(
  sessionID: string,
  requestID: string,
  answers: string[][],
): { sessionID: string; requestID: string; questionV2Reply: { answers: string[][] } } {
  return { sessionID, requestID, questionV2Reply: { answers } }
}

export function buildV2QuestionRejectCall(
  sessionID: string,
  requestID: string,
): { sessionID: string; requestID: string } {
  return { sessionID, requestID }
}

export function classifyQuestionHttpResult(input: {
  error: unknown
  data: unknown
  status?: number
  protocol: 'v1' | 'v2'
}): QuestionSideResult {
  const status = readHttpStatus(input.status, input.error)
  if (status === 404 || isQuestionNotFound(input.error)) return 'not-found'
  if (input.error) return 'failed'
  if (input.protocol === 'v1' && input.data === false) return 'failed'
  if (status != null && (status < 200 || status >= 300)) return 'failed'
  return 'ok'
}

function readHttpStatus(status: number | undefined, error: unknown): number | undefined {
  if (typeof status === 'number') return status
  if (!error || typeof error !== 'object') return undefined
  const rec = error as {
    status?: unknown
    statusCode?: unknown
    response?: { status?: unknown }
  }
  if (typeof rec.status === 'number') return rec.status
  if (typeof rec.statusCode === 'number') return rec.statusCode
  if (typeof rec.response?.status === 'number') return rec.response.status
  return undefined
}

function isQuestionNotFound(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const rec = error as { _tag?: unknown; name?: unknown }
  return rec._tag === 'QuestionNotFoundError' || rec.name === 'QuestionNotFoundError'
}

export function normalizeQuestionSelections(input: unknown): QuestionSelection[] | null {
  if (!input || typeof input !== 'object') return null
  const selections = (input as { selections?: unknown }).selections
  if (!Array.isArray(selections)) return null
  return selections.map((item) => {
    if (!item || typeof item !== 'object') {
      return { optionLabels: [], customText: '' }
    }
    const rec = item as { optionLabels?: unknown; customText?: unknown }
    const optionLabels = Array.isArray(rec.optionLabels)
      ? rec.optionLabels.filter((label): label is string => typeof label === 'string')
      : []
    const customText = typeof rec.customText === 'string' ? rec.customText : ''
    return { optionLabels, customText }
  })
}

export type AwaitingQuestionClient = {
  replyV1: (requestID: string, answers: string[][]) => Promise<QuestionSideResult>
  replyV2: (sessionID: string, requestID: string, answers: string[][]) => Promise<QuestionSideResult>
  rejectV1: (requestID: string) => Promise<QuestionSideResult>
  rejectV2: (sessionID: string, requestID: string) => Promise<QuestionSideResult>
}

type TimerHandle = { clear: () => void }

export type AwaitingReplyHooks = {
  timeoutMs: () => number
  schedule: (ms: number, cb: () => void) => TimerHandle
  emit: (pending: AwaitingReplyView | null) => void
  timeline: (body: string) => void
  logReject: (info: { requestIds: string[]; sessionId: string; reason: string }) => void
  client: () => AwaitingQuestionClient | null
  /** 超时发送失败时转入结束。实现应调用 endForAbort，再中止会话。 */
  performSessionAbort: () => Promise<void>
  onSlotCreated: () => void
  onSlotCleared: () => void
}

type Slot = {
  sessionId: string
  v1RequestId: string | null
  v2RequestId: string | null
  questions: DisplayQuestion[]
  renderable: boolean
  fingerprint: string
  timer: TimerHandle | null
  inFlight: null | 'reply' | 'reject'
  deadlineFired: boolean
  closed: boolean
}

type SideOutcome = { side: QuestionSide; result: QuestionSideResult }

type SendSummary = {
  outcomes: SideOutcome[]
  allDone: boolean
  anyNotFound: boolean
  anyFreshOk: boolean
}

export type ReplyQuestionResult = { ok: boolean; message: string }

export class AwaitingReplyCoordinator {
  private slot: Slot | null = null
  private generation = 0
  private disposed = false
  private queue: Promise<void> = Promise.resolve()
  private endPromise: Promise<void> | null = null

  constructor(private readonly hooks: AwaitingReplyHooks) {}

  resume(): void {
    this.disposed = false
  }

  /** 任务结束：卸计时与通知，不再 reply。不发 HTTP。 */
  dispose(): void {
    this.disposed = true
    const slot = this.slot
    if (!slot) return
    slot.closed = true
    slot.timer?.clear()
    slot.timer = null
    this.slot = null
    this.generation += 1
    this.hooks.onSlotCleared()
    this.hooks.emit(null)
  }

  ingest(
    sessionId: string,
    side: QuestionSide,
    requestId: string,
    rawQuestions: unknown,
  ): Promise<void> {
    return this.enqueue(() => this.ingestNow(sessionId, side, requestId, rawQuestions))
  }

  noteSettled(sessionId: string, side: QuestionSide, requestId: string): void {
    const slot = this.slot
    if (!slot || slot.closed || slot.inFlight || slot.sessionId !== sessionId) return
    if (side === 'v1' && slot.v1RequestId === requestId) slot.v1RequestId = null
    else if (side === 'v2' && slot.v2RequestId === requestId) slot.v2RequestId = null
    else return
    if (!slot.v1RequestId && !slot.v2RequestId) this.clearSlot()
  }

  reply(input: unknown): Promise<ReplyQuestionResult> {
    return this.enqueue(() => this.replyNow(input))
  }

  /**
   * 结束顺序的前半：reject 槽内每一侧，再清槽。
   * 不调用 session.abort。可与进行中的 reply 交叉，靠 generation 丢弃过期结果。
   */
  endForAbort(): Promise<void> {
    if (this.endPromise) return this.endPromise
    const slot = this.slot
    if (!slot || slot.closed) return Promise.resolve()
    const v1 = slot.v1RequestId
    const v2 = slot.v2RequestId
    const sessionId = slot.sessionId
    slot.timer?.clear()
    slot.timer = null
    slot.closed = true
    slot.inFlight = 'reject'
    slot.deadlineFired = false
    this.generation += 1
    this.endPromise = this.rejectAndClear(slot, sessionId, v1, v2).finally(() => {
      this.endPromise = null
    })
    return this.endPromise
  }

  whenIdle(): Promise<void> {
    return this.queue
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = this.queue.then(task, task)
    this.queue = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  private async ingestNow(
    sessionId: string,
    side: QuestionSide,
    requestId: string,
    rawQuestions: unknown,
  ): Promise<void> {
    if (this.disposed || !requestId) return
    const assessed = assessQuestionRequest(rawQuestions)
    const slot = this.slot
    if (slot && !slot.closed && slot.sessionId === sessionId) {
      if (slot.fingerprint === assessed.fingerprint) {
        const current = side === 'v1' ? slot.v1RequestId : slot.v2RequestId
        if (!current) {
          if (side === 'v1') slot.v1RequestId = requestId
          else slot.v2RequestId = requestId
          return
        }
        if (current === requestId) return
      }
      await this.replaceSlot(sessionId, side, requestId, assessed)
      return
    }
    if (slot) return
    this.install(sessionId, side, requestId, assessed)
  }

  private async replaceSlot(
    sessionId: string,
    side: QuestionSide,
    requestId: string,
    assessed: ReturnType<typeof assessQuestionRequest>,
  ): Promise<void> {
    const old = this.slot
    if (!old || old.closed) {
      if (!this.disposed) this.install(sessionId, side, requestId, assessed)
      return
    }
    old.timer?.clear()
    old.timer = null
    old.inFlight = 'reject'
    const v1 = old.v1RequestId
    const v2 = old.v2RequestId
    await this.rejectIds(old.sessionId, v1, v2, true)
    if (this.disposed || old.closed || this.slot !== old) return
    this.slot = null
    this.hooks.onSlotCleared()
    this.install(sessionId, side, requestId, assessed)
  }

  private install(
    sessionId: string,
    side: QuestionSide,
    requestId: string,
    assessed: ReturnType<typeof assessQuestionRequest>,
  ): void {
    if (this.disposed) return
    const slot: Slot = {
      sessionId,
      v1RequestId: side === 'v1' ? requestId : null,
      v2RequestId: side === 'v2' ? requestId : null,
      questions: assessed.questions,
      renderable: assessed.renderable,
      fingerprint: assessed.fingerprint,
      timer: null,
      inFlight: null,
      deadlineFired: false,
      closed: false,
    }
    const timeoutMs = this.hooks.timeoutMs()
    slot.timer = this.hooks.schedule(timeoutMs, () => this.onTimer(slot))
    this.slot = slot
    this.hooks.onSlotCreated()
    this.hooks.emit(this.viewOf(slot))
  }

  private onTimer(slot: Slot): void {
    if (this.slot !== slot || slot.closed) return
    if (slot.inFlight === 'reply' || slot.inFlight === 'reject') {
      slot.deadlineFired = true
      return
    }
    void this.enqueue(() => this.runDeadline())
  }

  private async replyNow(input: unknown): Promise<ReplyQuestionResult> {
    const slot = this.slot
    if (!slot || slot.closed || slot.inFlight) return { ok: false, message: '' }
    if (!slot.renderable) {
      return { ok: false, message: AWAITING_REPLY_SUBMIT_FAILED_MESSAGE }
    }
    const selections = normalizeQuestionSelections(input)
    if (!selections) return { ok: false, message: AWAITING_REPLY_SUBMIT_FAILED_MESSAGE }
    const built = buildQuestionAnswers(slot.questions, selections)
    if (!built.ok) return { ok: false, message: AWAITING_REPLY_SUBMIT_FAILED_MESSAGE }

    const epoch = this.generation
    slot.inFlight = 'reply'
    const summary = await this.sendAnswers(slot, built.answers, epoch)
    if (this.generation !== epoch || slot.closed || this.slot !== slot) {
      return { ok: false, message: '' }
    }
    if (summary.allDone) {
      this.hooks.timeline(
        summary.anyNotFound
          ? AWAITING_REPLY_TIMELINE_ALREADY_DONE
          : AWAITING_REPLY_TIMELINE_SUBMITTED,
      )
      this.clearSlot()
      return { ok: true, message: '' }
    }
    this.hooks.logReject({
      requestIds: requestIdsOf(slot),
      sessionId: slot.sessionId,
      reason: 'send-failed',
    })
    this.dropFinished(slot, summary.outcomes)
    slot.inFlight = null
    if (slot.deadlineFired) {
      slot.deadlineFired = false
      await this.runDeadline()
      return { ok: false, message: '' }
    }
    return { ok: false, message: AWAITING_REPLY_SUBMIT_FAILED_MESSAGE }
  }

  private async runDeadline(): Promise<void> {
    const slot = this.slot
    if (!slot || slot.closed || slot.inFlight) return
    const epoch = this.generation
    const decision = decideAwaitingReplyTimeout({
      renderable: slot.renderable,
      questions: slot.questions,
    })
    if (decision.action === 'reply') {
      slot.inFlight = 'reply'
      const summary = await this.sendAnswers(slot, decision.answers, epoch)
      if (this.generation !== epoch || slot.closed || this.slot !== slot) return
      slot.inFlight = null
      if (summary.allDone) {
        const label = decision.answers[0]?.[0] ?? ''
        this.hooks.timeline(
          slot.questions.length === 1
            ? awaitingReplyTimeoutSingleTimeline(label)
            : AWAITING_REPLY_TIMELINE_TIMEOUT_MULTI,
        )
        this.clearSlot()
        return
      }
      this.hooks.logReject({
        requestIds: requestIdsOf(slot),
        sessionId: slot.sessionId,
        reason: 'send-failed',
      })
      await this.hooks.performSessionAbort()
      return
    }

    this.hooks.logReject({
      requestIds: requestIdsOf(slot),
      sessionId: slot.sessionId,
      reason: decision.reason,
    })
    slot.inFlight = 'reject'
    const summary = await this.sendReject(slot, epoch)
    if (this.generation !== epoch || slot.closed || this.slot !== slot) return
    slot.inFlight = null
    if (summary.allDone) {
      this.hooks.timeline(AWAITING_REPLY_TIMELINE_TIMEOUT_REJECTED)
      this.clearSlot()
      return
    }
    this.hooks.logReject({
      requestIds: requestIdsOf(slot),
      sessionId: slot.sessionId,
      reason: 'send-failed',
    })
    await this.hooks.performSessionAbort()
  }

  private async sendAnswers(slot: Slot, answers: string[][], epoch: number): Promise<SendSummary> {
    const outcomes: SideOutcome[] = []
    const client = this.hooks.client()
    if (slot.v1RequestId) {
      outcomes.push({
        side: 'v1',
        result: client
          ? await settle(() => client.replyV1(slot.v1RequestId as string, answers))
          : 'failed',
      })
    }
    if (this.generation !== epoch || slot.closed) return summarize(outcomes)
    if (slot.v2RequestId) {
      outcomes.push({
        side: 'v2',
        result: client
          ? await settle(() =>
              client.replyV2(slot.sessionId, slot.v2RequestId as string, answers),
            )
          : 'failed',
      })
    }
    return summarize(outcomes)
  }

  private async sendReject(slot: Slot, epoch: number): Promise<SendSummary> {
    const outcomes: SideOutcome[] = []
    const client = this.hooks.client()
    if (slot.v1RequestId) {
      outcomes.push({
        side: 'v1',
        result: client ? await settle(() => client.rejectV1(slot.v1RequestId as string)) : 'failed',
      })
    }
    if (this.generation !== epoch || slot.closed) return summarize(outcomes)
    if (slot.v2RequestId) {
      outcomes.push({
        side: 'v2',
        result: client
          ? await settle(() => client.rejectV2(slot.sessionId, slot.v2RequestId as string))
          : 'failed',
      })
    }
    return summarize(outcomes)
  }

  private async rejectIds(
    sessionId: string,
    v1: string | null,
    v2: string | null,
    logFailure: boolean,
  ): Promise<void> {
    const client = this.hooks.client()
    const outcomes: SideOutcome[] = []
    if (v1) {
      outcomes.push({
        side: 'v1',
        result: client ? await settle(() => client.rejectV1(v1)) : 'failed',
      })
    }
    if (v2) {
      outcomes.push({
        side: 'v2',
        result: client ? await settle(() => client.rejectV2(sessionId, v2)) : 'failed',
      })
    }
    if (logFailure && outcomes.some((item) => item.result === 'failed')) {
      this.hooks.logReject({
        requestIds: [v1, v2].filter((id): id is string => Boolean(id)),
        sessionId,
        reason: 'send-failed',
      })
    }
  }

  private async rejectAndClear(
    slot: Slot,
    sessionId: string,
    v1: string | null,
    v2: string | null,
  ): Promise<void> {
    await this.rejectIds(sessionId, v1, v2, true)
    if (this.slot === slot) {
      this.slot = null
      this.hooks.onSlotCleared()
      this.hooks.emit(null)
    }
  }

  private dropFinished(slot: Slot, outcomes: SideOutcome[]): void {
    for (const outcome of outcomes) {
      if (outcome.result !== 'ok' && outcome.result !== 'not-found') continue
      if (outcome.side === 'v1') slot.v1RequestId = null
      else slot.v2RequestId = null
    }
  }

  private clearSlot(): void {
    const slot = this.slot
    if (!slot) return
    slot.timer?.clear()
    slot.timer = null
    slot.closed = true
    this.slot = null
    this.generation += 1
    this.hooks.onSlotCleared()
    this.hooks.emit(null)
  }

  private viewOf(slot: Slot): AwaitingReplyView {
    if (!slot.renderable) return { questions: [], renderable: false }
    return { questions: slot.questions, renderable: true }
  }
}

function requestIdsOf(slot: Slot): string[] {
  return [slot.v1RequestId, slot.v2RequestId].filter((id): id is string => Boolean(id))
}

async function settle(run: () => Promise<QuestionSideResult>): Promise<QuestionSideResult> {
  try {
    return await run()
  } catch {
    return 'failed'
  }
}

function summarize(outcomes: SideOutcome[]): SendSummary {
  const allDone =
    outcomes.length > 0 &&
    outcomes.every((item) => item.result === 'ok' || item.result === 'not-found')
  return {
    outcomes,
    allDone,
    anyNotFound: outcomes.some((item) => item.result === 'not-found'),
    anyFreshOk: outcomes.some((item) => item.result === 'ok'),
  }
}
