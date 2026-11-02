/**
 * US-FD-02：任务中自动拒绝权限，续聊才把可询问项交给用户。
 * 请求 id 留在主进程。回复只有 once / reject，不出现 always。
 */

export const PERMISSION_TASK_REJECT_MESSAGE =
  '任务执行中不接受这项操作。请改用已允许的内置工具继续，不要等待授权。'

export const PERMISSION_USER_REJECT_MESSAGE =
  '用户拒绝了这次操作，不要改用其它方式执行。'

export const PERMISSION_HARD_BOUNDARY_REJECT_MESSAGE =
  '这项操作不允许。不要改用其它方式执行，也不要等待授权。'

export const PERMISSION_REPLY_FAILED_MESSAGE = '权限回复失败，任务已停止'

export const PERMISSION_INVALID_CHOICE_MESSAGE = '无效的授权选择'

export const PERMISSION_NONE_PENDING_MESSAGE = '没有待授权的操作'

const HARD_BOUNDARY = new Set(['edit', 'bash', 'shell', 'external_directory'])

export type PermissionReplyChoice = 'once' | 'reject'

export type PermissionReplyOutcome = 'ok' | 'gone' | 'failed'

export type PermissionReplyCall = {
  requestID: string
  reply: PermissionReplyChoice
  message?: string
}

export type PermissionCardView = {
  permission: string
  tool?: string
}

export type PermissionAsk = {
  id: string
  permission: string
  tool?: string
}

export type ReplyPermissionResult = {
  ok: boolean
  message: string
}

type PermissionHooks = {
  isRunning: () => boolean
  hasFailed: () => boolean
  reply: (call: PermissionReplyCall) => Promise<PermissionReplyOutcome>
  emit: (pending: PermissionCardView | null) => void
  onReplyFailed: () => void
}

export function isHardBoundaryPermission(permission: string): boolean {
  return HARD_BOUNDARY.has(permission.trim().toLowerCase())
}

export function normalizePermissionChoice(input: unknown): PermissionReplyChoice | null {
  if (input === 'once') return 'once'
  if (input === 'reject' || input === 'always') return 'reject'
  return null
}

/** once 不附 message。reject 只在有短句时带上。 */
export function buildPermissionReply(input: {
  requestID: string
  reply: PermissionReplyChoice
  message?: string
}): PermissionReplyCall {
  if (input.reply === 'reject') {
    const message = input.message?.trim()
    return message
      ? { requestID: input.requestID, reply: 'reject', message }
      : { requestID: input.requestID, reply: 'reject' }
  }
  return { requestID: input.requestID, reply: 'once' }
}

export function classifyPermissionHttpResult(input: {
  error: unknown
  data: unknown
  status?: number
}): PermissionReplyOutcome {
  const status = readHttpStatus(input.status, input.error)
  if (status === 404 || isPermissionNotFound(input.error)) return 'gone'
  if (input.error) return 'failed'
  if (input.data === false) return 'failed'
  if (status != null && (status < 200 || status >= 300)) return 'failed'
  return 'ok'
}

export function readPermissionAsk(event: {
  type: string
  properties?: unknown
}): PermissionAsk | null {
  if (event.type !== 'permission.asked' && event.type !== 'permission.v2.asked') return null
  const props = asRecord(event.properties)
  if (!props) return null
  const id = asString(props.id)
  if (!id) return null
  const permission =
    event.type === 'permission.v2.asked' ? asString(props.action) : asString(props.permission)
  if (!permission) return null
  const tool = readToolKey(props.tool) ?? readToolKey(props.metadata)
  return tool ? { id, permission, tool } : { id, permission }
}

export class PermissionCoordinator {
  private queue: PermissionAsk[] = []
  private emittedKey = 'null'
  private epoch = 0
  private inflightId: string | null = null
  private tail: Promise<void> = Promise.resolve()
  private readonly hooks: PermissionHooks

  constructor(hooks: PermissionHooks) {
    this.hooks = hooks
  }

  onAsked(ask: PermissionAsk): Promise<void> {
    return this.runExclusive(async () => {
      if (this.hooks.hasFailed()) return
      if (!ask.id || !ask.permission) return
      const running = this.hooks.isRunning()
      if (running || isHardBoundaryPermission(ask.permission)) {
        await this.rejectNow(ask.id, running)
        return
      }
      if (this.queue.some((item) => item.id === ask.id)) return
      this.queue.push({
        id: ask.id,
        permission: ask.permission,
        ...(ask.tool ? { tool: ask.tool } : {}),
      })
      this.emitHead()
    })
  }

  replyFromUser(input: unknown): Promise<ReplyPermissionResult> {
    return this.runExclusive(async () => {
      if (this.hooks.hasFailed()) {
        return { ok: false, message: PERMISSION_REPLY_FAILED_MESSAGE }
      }
      const choice = normalizePermissionChoice(input)
      if (!choice) return { ok: false, message: PERMISSION_INVALID_CHOICE_MESSAGE }
      const head = this.queue[0]
      if (!head) return { ok: false, message: PERMISSION_NONE_PENDING_MESSAGE }
      const epoch = this.epoch
      this.inflightId = head.id
      const outcome = await this.send({
        requestID: head.id,
        reply: choice,
        message: choice === 'reject' ? PERMISSION_USER_REJECT_MESSAGE : undefined,
      })
      this.inflightId = null
      if (outcome === 'failed') {
        this.hooks.onReplyFailed()
        return { ok: false, message: PERMISSION_REPLY_FAILED_MESSAGE }
      }
      if (this.epoch !== epoch) return { ok: true, message: '' }
      if (choice === 'reject' && outcome === 'ok') this.queue = []
      else this.queue = this.queue.filter((item) => item.id !== head.id)
      this.emitHead()
      return { ok: true, message: '' }
    })
  }

  noteReplied(requestID: string): Promise<void> {
    return this.runExclusive(async () => {
      if (!requestID || requestID === this.inflightId) return
      const next = this.queue.filter((item) => item.id !== requestID)
      if (next.length === this.queue.length) return
      this.queue = next
      this.emitHead()
    })
  }

  clear(): void {
    this.epoch += 1
    this.queue = []
    this.inflightId = null
    this.emitHead(true)
  }

  private async rejectNow(requestID: string, running: boolean): Promise<void> {
    const epoch = this.epoch
    const outcome = await this.send({
      requestID,
      reply: 'reject',
      message: running ? PERMISSION_TASK_REJECT_MESSAGE : PERMISSION_HARD_BOUNDARY_REJECT_MESSAGE,
    })
    if (outcome === 'failed') {
      this.hooks.onReplyFailed()
      return
    }
    if (this.epoch !== epoch) return
    if (outcome === 'ok') {
      this.queue = []
      this.emitHead()
    }
  }

  private async send(call: PermissionReplyCall): Promise<PermissionReplyOutcome> {
    const payload = buildPermissionReply(call)
    let last: PermissionReplyOutcome = 'failed'
    for (let attempt = 0; attempt < 2; attempt += 1) {
      last = await this.hooks.reply(payload)
      if (last !== 'failed') return last
    }
    return 'failed'
  }

  private emitHead(force = false): void {
    const head = this.queue[0]
    const view: PermissionCardView | null = head
      ? { permission: head.permission, ...(head.tool ? { tool: head.tool } : {}) }
      : null
    const key = JSON.stringify(view)
    if (!force && key === this.emittedKey) return
    this.emittedKey = key
    this.hooks.emit(view)
  }

  private runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.tail.then(fn, fn)
    this.tail = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }
}

function readToolKey(value: unknown): string | undefined {
  if (typeof value === 'string') return usefulToolKey(value)
  const rec = asRecord(value)
  if (!rec) return undefined
  if ('messageID' in rec || 'callID' in rec) {
    return usefulToolKey(rec.name) ?? usefulToolKey(rec.key) ?? usefulToolKey(rec.tool)
  }
  return usefulToolKey(rec.tool) ?? usefulToolKey(rec.name) ?? usefulToolKey(rec.key)
}

function usefulToolKey(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  if (!text || text === '*') return undefined
  return text
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readHttpStatus(status: number | undefined, error: unknown): number | undefined {
  if (typeof status === 'number') return status
  const rec = asRecord(error)
  if (!rec) return undefined
  if (typeof rec.status === 'number') return rec.status
  if (typeof rec.statusCode === 'number') return rec.statusCode
  const response = asRecord(rec.response)
  if (typeof response?.status === 'number') return response.status
  return undefined
}

function isPermissionNotFound(error: unknown): boolean {
  const rec = asRecord(error)
  if (!rec) return false
  return rec._tag === 'PermissionNotFoundError' || rec.name === 'PermissionNotFoundError'
}
