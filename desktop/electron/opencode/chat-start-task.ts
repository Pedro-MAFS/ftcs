/**
 * US-FD-03：从聊天读到 start_task 的结果后，决定要不要进入现有 run*。
 * 工具本身不跑流水线。这里只解析 JSON，并给出时间线上的原句。
 */

export const CHAT_START_UNAUTHORIZED = "未授权，任务未启动。"
export const CHAT_START_NO_PRODUCT = "任务没有启动：还没有当前产品。"
export const CHAT_START_BAD_STEP = "任务没有启动：不能从聊天启动这一步。"
export const CHAT_START_ALREADY_RUNNING = "任务没有启动：已有任务在运行。"

export const START_TASK_TOOL_NAME = "start_task"

export type ChatStartStage = "keywords" | "explore" | "score" | "email"
export type ChatStartChannel = "r1" | "r2" | "r3"

export type ChatStartRequest =
  | {
      ok: true
      stage: ChatStartStage
      product_id: string | null
      explore_channel?: ChatStartChannel
    }
  | {
      ok: false
      code: "bad_stage" | "missing_channel"
    }

const STAGES = new Set<ChatStartStage>(["keywords", "explore", "score", "email"])
const CHANNELS = new Set<ChatStartChannel>(["r1", "r2", "r3"])

export function isFtcsStartTaskTool(tool: string | undefined): boolean {
  const name = (tool ?? "").trim().toLowerCase()
  if (!name || name === "task") return false
  if (name === START_TASK_TOOL_NAME) return true
  return name.endsWith(START_TASK_TOOL_NAME) && (name.includes("ftcs-task") || name.includes("ftcs_task"))
}

export function isFtcsStartTaskPermission(permission: string, tool?: string): boolean {
  return isFtcsStartTaskTool(permission) || isFtcsStartTaskTool(tool)
}

/** 时间线追加句。已有前缀的句子保持原样，其余接在「任务没有启动：」后面。 */
export function chatStartFailureLine(reason: string): string {
  const text = reason.trim()
  if (!text || text === "bad_stage" || text === "missing_channel") return CHAT_START_BAD_STEP
  if (text.startsWith("未授权，任务未启动")) return CHAT_START_UNAUTHORIZED
  if (text.startsWith("任务没有启动：")) return text
  if (text.includes("已有任务在运行")) return CHAT_START_ALREADY_RUNNING
  return `任务没有启动：${text}`
}

export function resolveChatProductId(requested: string | null, activeProductId: string): string {
  return (requested ?? "").trim() || activeProductId.trim()
}

export function parseStartTaskOutput(output: unknown): ChatStartRequest | null {
  const record = findStartRecord(output, 0)
  if (!record) return null
  return normalizeStartRecord(record)
}

export type ChatPreflightKind =
  | "expand-keywords"
  | "discover-leads"
  | "discover-leads-r2"
  | "discover-leads-r3"
  | "score-and-dedupe"
  | "draft-email"

export function preflightKindFor(request: Extract<ChatStartRequest, { ok: true }>): ChatPreflightKind {
  if (request.stage === "keywords") return "expand-keywords"
  if (request.stage === "score") return "score-and-dedupe"
  if (request.stage === "email") return "draft-email"
  if (request.explore_channel === "r2") return "discover-leads-r2"
  if (request.explore_channel === "r3") return "discover-leads-r3"
  return "discover-leads"
}

function normalizeStartRecord(record: Record<string, unknown>): ChatStartRequest | null {
  const stage = typeof record.stage === "string" ? record.stage.trim() : ""
  if (!isStage(stage)) return { ok: false, code: "bad_stage" }
  const productRaw = typeof record.product_id === "string" ? record.product_id.trim() : ""
  const product_id = productRaw || null
  if (stage !== "explore") return { ok: true, stage, product_id }
  const channel = typeof record.explore_channel === "string" ? record.explore_channel.trim() : ""
  if (!isChannel(channel)) return { ok: false, code: "missing_channel" }
  return { ok: true, stage: "explore", product_id, explore_channel: channel }
}

function findStartRecord(value: unknown, depth: number): Record<string, unknown> | null {
  if (depth > 6 || value == null) return null
  if (typeof value === "string") {
    const text = value.trim()
    if (!text.startsWith("{") && !text.startsWith("[")) return null
    try {
      return findStartRecord(JSON.parse(text) as unknown, depth + 1)
    } catch {
      return null
    }
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findStartRecord(item, depth + 1)
      if (found) return found
    }
    return null
  }
  if (typeof value !== "object") return null
  const record = value as Record<string, unknown>
  if (typeof record.stage === "string" || typeof record.code === "string") return record
  if (Array.isArray(record.content)) {
    const found = findStartRecord(record.content, depth + 1)
    if (found) return found
  }
  if (typeof record.text === "string") {
    const found = findStartRecord(record.text, depth + 1)
    if (found) return found
  }
  if ("output" in record) {
    const found = findStartRecord(record.output, depth + 1)
    if (found) return found
  }
  return null
}

function isStage(value: string): value is ChatStartStage {
  return STAGES.has(value as ChatStartStage)
}

function isChannel(value: string): value is ChatStartChannel {
  return CHANNELS.has(value as ChatStartChannel)
}
