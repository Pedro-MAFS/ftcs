/**
 * US-FD-03：自由对话里用提问卡收齐必填后，决定要不要进入现有 run*。
 * 题头是技能和桌面的接线契约。
 */

export const CHAT_START_NO_PRODUCT = "任务没有启动：还没有当前产品。"
export const CHAT_START_BAD_STEP = "任务没有启动：不能从聊天启动这一步。"
export const CHAT_START_ALREADY_RUNNING = "任务没有启动：已有任务在运行。"
export const CHAT_START_CANCELLED = "已取消，任务未启动。"

export const CHAT_START_HEADER_PRODUCT = "产品"
export const CHAT_START_HEADER_STAGE = "阶段"
export const CHAT_START_HEADER_CHANNEL = "渠道"

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

const CHANNELS = new Set<ChatStartChannel>(["r1", "r2", "r3"])
const START_HEADERS = new Set([
  CHAT_START_HEADER_PRODUCT,
  CHAT_START_HEADER_STAGE,
  CHAT_START_HEADER_CHANNEL,
])

/** 时间线追加句。已有前缀的句子保持原样，其余接在「任务没有启动：」后面。 */
export function chatStartFailureLine(reason: string): string {
  const text = reason.trim()
  if (!text || text === "bad_stage" || text === "missing_channel") return CHAT_START_BAD_STEP
  if (text.startsWith("任务没有启动：")) return text
  if (text.includes("已有任务在运行")) return CHAT_START_ALREADY_RUNNING
  return `任务没有启动：${text}`
}

/**
 * 提交值必须出现在 listProductSummaries() 的 id 里。
 * 空、对不上，都当成没有可启动的产品。
 */
export function resolveChatProductId(requested: string | null, knownIds: readonly string[]): string {
  const id = (requested ?? "").trim()
  if (!id) return ""
  return knownIds.includes(id) ? id : ""
}

export const CHAT_START_SKILLS = [
  "expand-keywords",
  "discover-leads",
  "discover-leads-r2",
  "discover-leads-r3",
  "score-and-dedupe",
  "draft-outreach-email",
] as const

export type ChatStartSkill = (typeof CHAT_START_SKILLS)[number]

const SKILL_STAGE: Record<ChatStartSkill, ChatStartStage> = {
  "expand-keywords": "keywords",
  "discover-leads": "explore",
  "discover-leads-r2": "explore",
  "discover-leads-r3": "explore",
  "score-and-dedupe": "score",
  "draft-outreach-email": "email",
}

/** 六个步骤技能名。其它技能（画像、补联系人等）对不上。 */
export function normalizeStepSkill(name: string | null | undefined): ChatStartSkill | null {
  const text = (name ?? "").trim().toLowerCase()
  return (CHAT_START_SKILLS as readonly string[]).includes(text) ? (text as ChatStartSkill) : null
}

/** OpenCode `skill` 工具入参里的技能名。不是 skill 工具则返回 null。 */
export function readLoadedSkillName(tool: string | undefined, input: unknown): string | null {
  if ((tool ?? "").trim().toLowerCase() !== "skill") return null
  if (!input || typeof input !== "object") return null
  const record = input as Record<string, unknown>
  const raw = record.name ?? record.skill ?? record.skill_name
  if (typeof raw !== "string") return null
  const name = raw.trim()
  return name || null
}

/** 题头必须有产品。渠道、阶段可有可无。多出来的题头不是启任务卡。 */
export function isChatStartQuestion(headers: readonly string[]): boolean {
  if (headers.length < 1 || headers.length > 3) return false
  const normalized = headers.map((header) => header.trim())
  if (normalized.some((header) => header === "")) return false
  const unique = new Set(normalized)
  if (unique.size !== normalized.length) return false
  if (!unique.has(CHAT_START_HEADER_PRODUCT)) return false
  for (const header of unique) {
    if (!START_HEADERS.has(header)) return false
  }
  return true
}

export function isChatStartQuestionRequest(raw: unknown): boolean {
  if (!Array.isArray(raw) || raw.length === 0) return false
  const headers: string[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") return false
    const header = (item as { header?: unknown }).header
    if (typeof header !== "string") return false
    headers.push(header)
  }
  return isChatStartQuestion(headers)
}

/**
 * 从提问答案和当前步骤技能拼出启动请求。
 * stage 以技能身份为准。非探索丢掉渠道。题头对不上则返回 null。
 */
export function parseChatStartAnswers(
  questions: ReadonlyArray<{ header: string }>,
  answers: ReadonlyArray<readonly string[]>,
  skillName: string | null,
): ChatStartRequest | null {
  if (!isChatStartQuestion(questions.map((question) => question.header))) return null
  const byHeader = new Map<string, string>()
  for (let index = 0; index < questions.length; index += 1) {
    const header = questions[index]?.header.trim() ?? ""
    const raw = answers[index]?.[0]
    byHeader.set(header, typeof raw === "string" ? raw.trim() : "")
  }
  const skill = normalizeStepSkill(skillName)
  if (!skill) return { ok: false, code: "bad_stage" }
  const stage = SKILL_STAGE[skill]
  if (byHeader.has(CHAT_START_HEADER_STAGE)) {
    const stated = byHeader.get(CHAT_START_HEADER_STAGE) ?? ""
    if (stated !== stage) return { ok: false, code: "bad_stage" }
  }
  const productRaw = byHeader.get(CHAT_START_HEADER_PRODUCT) ?? ""
  const product_id = productRaw || null
  if (stage !== "explore") return { ok: true, stage, product_id }
  const channel = byHeader.get(CHAT_START_HEADER_CHANNEL) ?? ""
  if (!isChannel(channel)) return { ok: false, code: "missing_channel" }
  return { ok: true, stage: "explore", product_id, explore_channel: channel }
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

function isChannel(value: string): value is ChatStartChannel {
  return CHANNELS.has(value as ChatStartChannel)
}
