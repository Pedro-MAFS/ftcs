import type { OpencodeClient } from '@opencode-ai/sdk/v2'
import type { Event, Message, ToolPart } from '@opencode-ai/sdk/v2/types'
import type { BootstrapResult } from '../profile/profile-bootstrap'
import {
  loadProfile,
  type ProductProfileDetail,
} from '../profile/profile-reader'
import { patchProfileSourceInputs } from '../profile/profile-writer'
import { loadExpansion, type KeywordExpansion } from '../keywords/keywords-reader'
import { getWorkspaceRoot } from '../config/paths'
import { isEligibleR2Query } from '../exploration/r2-query'
import {
  formatEnabledR2SitesForPrompt,
  formatR2IncludeDomainsForPrompt,
  listExploreR2Sites,
  loadExploreR2Registry,
} from '../exploration/r2-sites'
import {
  findLatestRunAfter,
  type ExplorationRun,
} from '../exploration/exploration-reader'
import { failLatestRunningExploration } from '../exploration/exploration-writer'
import {
  countRawLeads,
  listScoredLeadsNeedingEnrich,
  loadScoredArtifact,
  type ScoredLeadsArtifact,
} from '../leads/leads-reader'
import {
  estimateOutreachDraftCounts,
  getEmailDraftSlot,
  listLeadsNeedingDraft,
  loadEmailDraftsArtifact,
  recipientKeyFromEmail,
  type EmailDraftsArtifact,
} from '../emails/emails-reader'
import { clearEmailDraftZh } from '../emails/emails-writer'
import { formatEmailStylePromptBlock, resolveEmailDraftStylePrompt } from '../settings/email-draft-style'
import { readUserPrefs } from '../config/user-prefs'

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
    '输入文件（已复制到 inputs/；文本、Office/PDF 侧车请 Read 文本，图片请 Read 多模态；网站书签不要当说明书）：',
    fileLines,
    '',
    '执行要求：',
    '1. 调用 lead-store.inputs_ensure_dir（目录已存在亦可）。',
    '2. 有网站则用 chrome-devtools 按需探索；有文件则读取并提取。两类都有则合并进同一份画像。',
    '3. 组装 ProductProfile 后调用 lead-store.product_save（传入上述 product_id）。',
    '4. source_inputs 必须记录：每个官网 URL 一条 type:website；每个已读文件一条 type:file（path 用上面的 inputs 路径）。不要把网站书签 md 写成 type:file。',
    '5. Office（Word/Excel/PPT）与 PDF 已在桌面端抽成 .txt 侧车并列在「输入文件」中，请直接 Read 侧车；不要 Read 原件 .pdf/.docx，不要调用 officecli 或外部 PDF 工具，不要因 file_classify 为 special 而停止整次生成。',
    '6. 列表中的 .jpg/.png/.webp 等为图片，须 Read 多模态理解；某张 Read 失败则跳过该文件并继续，在汇报中说明。',
    '7. readiness 由 lead-store 计算，不要手改。',
    '8. 完成后用简短中文汇报：产品 ID、公司名、核心产品、就绪度分数与 status、缺失字段、下一步建议。',
    '',
    `来源清单：data/products/${bootstrap.productId}/inputs/_sources.json`,
  ].join('\n')
}

function buildExpandKeywordsPrompt(productId: string): string {
  const siteHint = formatEnabledR2SitesForPrompt(listExploreR2Sites(getWorkspaceRoot()))
  return [
    '请严格按 skill `expand-keywords` 执行，为指定产品扩展获客关键词与搜索查询。',
    '',
    `产品 ID：${productId}`,
    '',
    siteHint,
    '',
    '执行要求：',
    '1. 调用 lead-store.product_get 确认画像存在且 status == "ready"。',
    '2. 由你直接生成五维关键词与 30～50 条 search_queries（覆盖 ≥4 维）。R1 占总数 ≥60%，普通产品/场景/买家/地理/竞品替代句，不要 site_id。R2 只给当前启用站点出词，每条必须带 site_id，query 禁止 site: / intitle: / inurl: / filetype:。R3 地图发现 6～12 条，round=R3，须含城市/区域 + 品类/场景，不要 site_id，query 同样禁止上述运算符。不要 R4。禁止调用 keywords_expand。',
    '3. 调用 lead-store.keywords_save 保存完整 expansion；若校验失败则修正后重试。',
    '4. 可用 keywords_get 核对 stats；不足则补充后再 save。抽查 R2 均有 site_id；by_round.R3 在 6～12（total≥40 时）；无 R4。',
    '5. 完成后用简短中文汇报：总查询数、各维度/轮次分布、3～5 条样例（含 1～2 条 R3；R2 样例请带 site_id）、下一步建议（探索页「开始 R1」「开始 R2」或「开始 R3」）。',
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
    '1. 调用 lead-store.lead_list_raw 确认存在原始线索；若 total == 0 则停止并提示先在探索页完成 R1 或 R2。',
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
  estimatedLetters: number,
): string {
  const idsJson = JSON.stringify(leadIds)
  const limit = Math.min(Math.max(leadIds.length, 1), 50)
  const styleBlock = formatEmailStylePromptBlock(
    resolveEmailDraftStylePrompt(readUserPrefs().emailDraftStylePrompt),
  )
  const stylePrompt = resolveEmailDraftStylePrompt(
    readUserPrefs().emailDraftStylePrompt,
  )
  return [
    '请严格按 skill `draft-outreach-email` 执行，为指定线索生成开发信草稿。',
    '',
    `产品 ID：${productId}`,
    `线索 ID 列表 lead_ids：${idsJson}`,
    `limit：${limit}`,
    `预计封数（约）：${estimatedLetters}`,
    '',
    ...(styleBlock ? [styleBlock] : []),
    '执行要求：',
    '1. 调用 lead-store.product_get 读取自家画像（公司/产品/卖点/认证等）；再 leads_get_scored 确认 scored.json 存在；缺一则停止并说明。',
    '2. 必须调用 lead-store.email_draft_plan，传入上述 product_id、lead_ids、limit。该工具只返回 1+N 槽位计划，不写正文。',
    `3. 对返回 plans 中每一个 slots[]：结合 product_get 与 personalization_hints，按用户行文风格直接撰写英文 subject/body（每槽一份正文），采用 plan 的 greeting_line；禁止编造线索或自家事实。然后 email_draft_save（write_markdown: true，并传入 style_prompt: ${JSON.stringify(stylePrompt)}、audience、recipient、personalization_evidence=hints）。禁止用手写/Write 直接创建 draft.json。`,
    '4. 用简短中文汇报：线索数、落盘封数、skip/warning、每槽公司/邮箱/subject/路径；提醒人工审核后再发送。',
    '',
    `输出路径：data/emails/{lead_id}/draft.json（公司向）；data/emails/{lead_id}/{recipient_key}/draft.json（个人向）`,
  ].join('\n')
}

function buildDraftOutreachSlotPrompt(input: {
  productId: string
  leadId: string
  audience: 'company' | 'person'
  email?: string
  recipientKey?: string
}): string {
  const styleBlock = formatEmailStylePromptBlock(
    resolveEmailDraftStylePrompt(readUserPrefs().emailDraftStylePrompt),
  )
  const stylePrompt = resolveEmailDraftStylePrompt(
    readUserPrefs().emailDraftStylePrompt,
  )
  const emailLine =
    input.audience === 'person' && input.email
      ? `邮箱 email：${JSON.stringify(input.email)}`
      : input.audience === 'person'
        ? '邮箱 email：未提供（请根据 plan_slot 返回使用）'
        : '邮箱：公司向可空'
  const keyLine = input.recipientKey
    ? `期望 recipient_key：${JSON.stringify(input.recipientKey)}`
    : ''
  return [
    '请严格按 skill `draft-outreach-email` 的「单槽模式」执行，仅为指定线索的一个收件人槽撰写/覆盖开发信。',
    '',
    `产品 ID：${input.productId}`,
    `线索 ID lead_id：${input.leadId}`,
    `audience：${input.audience}`,
    emailLine,
    ...(keyLine ? [keyLine] : []),
    '',
    ...(styleBlock ? [styleBlock] : []),
    '执行要求：',
    '1. 调用 lead-store.product_get 读取自家画像；再 leads_get_scored 确认 scored.json 存在；缺一则停止并说明。',
    '2. 必须调用 lead-store.email_draft_plan_slot（传入 product_id、lead_id、audience；个人向务必带 email）。禁止调用整 lead 的 email_draft_plan。',
    `3. 按用户行文风格撰写英文 subject/body（仅一份），采用 plan_slot 的 greeting_line；禁止编造。然后 email_draft_save 一次（write_markdown: true，style_prompt: ${JSON.stringify(stylePrompt)}，audience、recipient、personalization_evidence=hints）。禁止用手写/Write 直接创建 draft.json。`,
    '4. 用简短中文汇报：落盘路径、subject、audience；提醒人工审核后再发送。',
    '',
    input.audience === 'company'
      ? `输出路径：data/emails/${input.leadId}/draft.json`
      : `输出路径：data/emails/${input.leadId}/{recipient_key}/draft.json`,
  ].join('\n')
}

function buildTranslateOutreachPrompt(input: {
  productId: string
  leadId: string
  recipientKey: string
  audience: string
  companyName: string
  subject: string
  body: string
}): string {
  return [
    '请严格按 skill `translate-outreach-email` 执行：将下列外文开发信译为中文对照（辅助审阅）。',
    '',
    `产品 ID：${input.productId}`,
    `线索 ID lead_id：${input.leadId}`,
    `recipient_key：${input.recipientKey}`,
    `audience：${input.audience}`,
    `公司：${input.companyName || '（未知）'}`,
    '',
    '【外文主题】',
    input.subject,
    '',
    '【外文正文】',
    input.body,
    '',
    '执行要求：',
    '1. 忠实译为简体中文主题与正文；不扩写；专有名词可保留英文。',
    '2. 必须调用 lead-store.email_draft_save_zh（lead_id、recipient_key、subject_zh、body_zh）。',
    '3. 禁止 email_draft_save / email_draft_plan / email_draft_plan_slot。',
    '4. 不要改外文 subject/body，不要改审批状态。',
    '5. 用一两句中文汇报已写入对照。',
  ].join('\n')
}

function buildEnrichLeadContactsPrompt(
  productId: string,
  leadIds: string[],
  verifyEmails: boolean,
): string {
  const idsJson = JSON.stringify(leadIds)
  const multi = leadIds.length > 1
  if (multi) {
    return [
      '请严格按 skill `enrich-lead-contacts` 执行，为下列已评分线索逐条补全联系人。',
      '',
      `产品 ID：${productId}`,
      `线索 ID 列表 lead_ids：${idsJson}`,
      `verify_emails：${verifyEmails ? 'true' : 'false'}`,
      '',
      '执行要求：',
      '1. 对 lead_ids 中每一条依次处理；某条无域名/无结果则记录后继续下一条；配额耗尽则停止剩余。',
      '2. 每条：leads_get_scored 定位 → 解析域名 → hunter-api.domain_search（limit=10）→ 排序后 leads_patch_scored 全量写入 people（sync_valid_to_contacts=false）。禁止猜邮。',
      verifyEmails
        ? '3. verify_emails=true：对当前 lead 的 people 每条调用 hunter-api.email_verifier，再 patch，且 sync_valid_to_contacts=true。'
        : '3. verify_emails=false：禁止调用 email_verifier。',
      '4. 配额类错误（HUNTER_QUOTA_EXCEEDED / HUNTER_ALL_KEYS_EXHAUSTED）立即停止并中文说明，禁止重试循环。',
      '5. 用简短中文汇报：处理条数、成功/跳过、代表邮箱摘要；若有配额错误一并说明。',
      '',
      `输出：data/leads/${productId}/scored.json 中目标 lead 的 people[]`,
    ].join('\n')
  }
  return [
    '请严格按 skill `enrich-lead-contacts` 执行，为指定已评分线索补全联系人。',
    '',
    `产品 ID：${productId}`,
    `线索 ID：${leadIds[0]}`,
    `verify_emails：${verifyEmails ? 'true' : 'false'}`,
    '',
    '执行要求：',
    '1. 调用 lead-store.leads_get_scored 定位该线索；从 company.website 解析域名，失败则停止。',
    '2. 调用 hunter-api.domain_search（limit=10）；禁止猜邮或编造邮箱。',
    '3. 按邮箱质量排序后，用 lead-store.leads_patch_scored 写入全部 people（sync_valid_to_contacts=false）。',
    verifyEmails
      ? '4. verify_emails=true：对 people 中每一条调用 hunter-api.email_verifier，再 patch 更新 email_status，且 sync_valid_to_contacts=true。'
      : '4. verify_emails=false：禁止调用 email_verifier。',
    '5. 配额类错误（HUNTER_QUOTA_EXCEEDED / HUNTER_ALL_KEYS_EXHAUSTED）立即停止并中文说明，禁止重试循环。',
    '6. 用简短中文汇报：域名、people 条数、是否验证、关键邮箱摘要。',
    '',
    `输出：data/leads/${productId}/scored.json 中该 lead 的 people[]`,
  ].join('\n')
}

function buildDiscoverLeadsR3Prompt(
  productId: string,
  maxQueries: number,
): string {
  return [
    '请严格按 skill `discover-leads-r3` 执行 R3 地图发现。',
    '',
    `产品 ID：${productId}`,
    `最多搜索词 max_queries：${maxQueries}`,
    '',
    '执行要求：',
    '1. lead-store.product_get 确认画像 ready；lead-store.keywords_get 读取 search_queries。',
    '2. search-api.search_usage 确认当日配额未用尽（官方通道以余额为准）。',
    '3. lead-store.exploration_start({ product_id, rounds: ["R3"] })，记住 run_id。',
    '4. 只跑 round=R3 且无 site_id 的词，按 priority 取前 max_queries 条。',
    '5. 对每个词：places_text_search(pageSize=20) → 过滤 → place_details(≤15)；无官网则 Tavily search_web 补搜；chrome 只打开公司官网，对照画像判断是否目标客户，通过才 lead_append_raw（round=R3，run_id 必填，snippet 以「发现：place_id=」开头）。禁止打开 Google 地图。',
    '6. 每完成一词 exploration_update；全部结束后 exploration_finish（completed 或 failed）。全程未通过官网判断也允许 completed 且 0 条线索。',
    '7. 用简短中文汇报：run_id、R3 词数、Places Search/Details 次数、Tavily 补搜/官网打开次数、线索数、跳过原因、3～5 条样例或「无新线索」、下一步 score-and-dedupe。',
    '',
    `线索输出：data/leads/${productId}/raw/R3.jsonl`,
    `运行记录：data/exploration/${productId}/runs/`,
  ].join('\n')
}

function buildDiscoverLeadsR2Prompt(
  productId: string,
  maxQueries: number,
): string {
  const includeHint = formatR2IncludeDomainsForPrompt(loadExploreR2Registry(getWorkspaceRoot()))
  return [
    '请严格按 skill `discover-leads-r2` 执行 R2 社媒发现。不要调用 skill `discover-leads`，不要给它传 rounds=["R2"]。',
    '',
    `产品 ID：${productId}`,
    `最多搜索词 max_queries：${maxQueries}`,
    '',
    includeHint,
    '',
    '执行要求：',
    '1. lead-store.product_get 确认画像 ready；lead-store.keywords_get 读取 search_queries。',
    '2. 读取 config/explore-r2-sites.yaml（与上表冲突时以文件为准）。',
    '3. search-api.search_usage 确认当日配额未用尽（官方通道以余额为准）。',
    '4. lead-store.exploration_start({ product_id, rounds: ["R2"] })，记住 run_id。',
    '5. 只跑 round=R2 且带 site_id 的词，按 priority 取前 max_queries 条。无 site_id 的旧 R2 跳过。',
    '6. 对每个词：search_web 必须带该 site_id 对应的 include_domains；不要打开社媒 URL。抽出公司并解析官网后，chrome 只打开官网，按 R1 口径判断，通过才 lead_append_raw（round=R2，run_id 必填，snippet 以「发现：」+ 社媒 URL 开头）。',
    '7. 每完成一词 exploration_update；全部结束后 exploration_finish（completed 或 failed）。全程未通过官网判断也允许 completed 且 0 条线索。',
    '8. 用简短中文汇报：run_id、R2 词数、社媒/二次搜索/官网打开次数、线索数、跳过原因、3～5 条样例或「无新线索」、下一步 score-and-dedupe。',
    '',
    `线索输出：data/leads/${productId}/raw/R2.jsonl`,
    `运行记录：data/exploration/${productId}/runs/`,
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
    '5. 对每个搜索词：search-api.search_web → chrome-devtools 打开候选页 → 判断是否目标客户 → 是则 lead_append_raw（lead 内必须带本次 run_id）。',
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

const COLLAPSE_BODY_CHARS = 400
/** 模型调用持续处于 retry 状态超过该时长则自动中止任务 */
const RETRY_WATCHDOG_MS = 120_000

/** 完整序列化工具出入参，不做长度截断；折叠由 UI 的 collapsed 处理 */
function formatJsonFull(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        return JSON.stringify(JSON.parse(trimmed), null, 2)
      } catch {
        return value
      }
    }
    return value
  }
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return ''
  }
}

/** 助手消息上的供应商错误（欠费、鉴权失败等）→ 可读文案 */
function formatMessageError(err: unknown): string {
  const rec = asRecord(err)
  if (!rec) return asString(err) || '未知错误'
  const name = asString(rec.name) || 'Error'
  const data = asRecord(rec.data)
  const message = asString(data?.message) || formatJsonFull(rec.data) || '模型调用失败'
  const lines = [`${name}：${message}`]
  if (data && data.statusCode != null) lines.push(`HTTP ${String(data.statusCode)}`)
  const body = asString(data?.responseBody).trim()
  if (body && !message.includes(body.slice(0, 40))) {
    lines.push(body.length > 600 ? `${body.slice(0, 600)}…` : body)
  }
  return lines.join('\n')
}

/** session.status retry 事件的 message（形如 {"reason":"insufficient_quota"}）→ 中文可读 */
function friendlyRetryReason(raw: string): string {
  let reason = raw.trim()
  try {
    const parsed = asRecord(JSON.parse(reason))
    reason = asString(parsed?.reason) || reason
  } catch {
    // 保留原文
  }
  if (!reason) return '模型调用失败'
  if (reason === 'insufficient_quota') return '余额不足或已欠费（insufficient_quota）'
  if (reason === 'rate_limit' || reason === 'rate_limit_exceeded') {
    return '触发速率限制（rate_limit）'
  }
  return reason
}

function toolPartToTimelineItem(part: ToolPart): AgentTimelineItem {
  const { state } = part
  let status: 'running' | 'done' | 'error' = 'running'
  if (state.status === 'completed') status = 'done'
  else if (state.status === 'error') status = 'error'
  const title =
    status === 'done'
      ? `工具 · ${part.tool} · 完成`
      : status === 'error'
        ? `工具 · ${part.tool} · 失败`
        : `工具 · ${part.tool}`
  const detailParts: string[] = []
  if (state.status === 'running' || state.status === 'completed') {
    if (state.title) detailParts.push(state.title)
  }
  const input = formatJsonFull(state.input)
  if (input) detailParts.push(`输入:\n${input}`)
  if (state.status === 'completed') {
    const out = formatJsonFull(state.output)
    if (out) detailParts.push(`输出:\n${out}`)
    const meta = formatJsonFull(state.metadata)
    if (meta && meta !== out) detailParts.push(`其它:\n${meta}`)
  }
  if (state.status === 'error') {
    detailParts.push(`错误:\n${state.error || '调用失败'}`)
  }
  const body = detailParts.join('\n\n') || '执行中…'
  return {
    id: `tool-${part.id}`,
    kind: 'tool',
    time: nowTime(),
    title,
    body,
    status,
    collapsed: body.length > COLLAPSE_BODY_CHARS,
  }
}

/**
 * 维护有序时间线：本地 prefix / suffix + SSE Part 快照按到达顺序插入。
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

  upsertSessionItem(item: AgentTimelineItem): void {
    const existing = this.byId.get(item.id)
    if (existing) {
      existing.body = item.body
      existing.title = item.title
      existing.status = item.status
      existing.collapsed = item.collapsed ?? existing.collapsed
      existing.time = existing.time || item.time
      return
    }
    this.sessionItems.push(item)
    this.byId.set(item.id, item)
  }

  removeSessionItem(id: string): void {
    const idx = this.sessionItems.findIndex((x) => x.id === id)
    if (idx >= 0) this.sessionItems.splice(idx, 1)
    this.byId.delete(id)
  }

  snapshot(): AgentTimelineItem[] {
    return [...this.prefix, ...this.sessionItems, ...this.suffix].map((item) => ({
      ...item,
    }))
  }

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
  private timeline: TimelineBuilder | null = null
  /** 看门狗自动中止的原因（模型持续重试不可用）；非空则中止分支按失败展示 */
  private autoAbortReason: string | null = null
  /** session.error / message.updated.info.error 的可读文案，供任务结束读产物失败时使用 */
  private lastModelError: string | null = null

  constructor(private readonly getClient: () => OpencodeClient | null) {}

  private attachTimeline(timeline: TimelineBuilder): void {
    this.timeline = timeline
    this.autoAbortReason = null
    this.lastModelError = null
  }

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
    this.attachTimeline(timeline)
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
        const abortMessage = this.autoAbortReason ?? '用户中止了关键词扩展'
        pushState('error')
        timeline.addSuffix({
          id: 'sys-abort',
          kind: 'error',
          time: nowTime(),
          title: this.autoAbortReason ? '失败' : '已中止',
          body: abortMessage,
        })
        flushTimeline()
        emit({
          type: 'done',
          ok: false,
          productId,
          message: abortMessage,
        })
        return { ok: false, message: abortMessage }
      }

      if (idleResult === 'timeout') {
        throw new Error('等待 OpenCode 会话 idle 超时')
      }

      const expansion = await loadWithGrace(
        () => loadExpansion(productId),
        { signal, attempts: 12, intervalMs: 500 },
      )

      if (!expansion) {
        throw new Error(
          this.lastModelError ??
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
    this.attachTimeline(timeline)
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
        const abortMessage = this.autoAbortReason ?? '用户中止了评分去重'
        pushState('error')
        timeline.addSuffix({
          id: 'sys-abort',
          kind: 'error',
          time: nowTime(),
          title: this.autoAbortReason ? '失败' : '已中止',
          body: abortMessage,
        })
        flushTimeline()
        emit({
          type: 'done',
          ok: false,
          productId,
          message: abortMessage,
        })
        return { ok: false, message: abortMessage }
      }

      if (idleResult === 'timeout') {
        throw new Error('等待 OpenCode 会话 idle 超时')
      }

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
          this.lastModelError ??
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
        : listLeadsNeedingDraft(productId)

    if (leadIds.length === 0) {
      const message =
        explicitIds.length > 0
          ? '未指定有效线索 ID'
          : '暂无待起草的已评分线索（可能已全部生成草稿）'
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
      throw new Error(`一次最多起草 50 条线索，当前 ${leadIds.length} 条，请缩小范围`)
    }

    const estimate = estimateOutreachDraftCounts(productId, leadIds)
    const idleTimeoutMs = Math.min(
      60 * 60_000,
      Math.max(20 * 60_000, 10 * 60_000 + estimate.estimatedLetters * 45_000),
    )

    this.running = true
    this.abort = new AbortController()
    const signal = this.abort.signal
    const startedAt = Date.now()
    const afterIso = new Date().toISOString()
    const timeline = new TimelineBuilder()
    const modeLabel = explicitIds.length > 0 ? `指定 ${leadIds.length} 条` : `待起草 ${leadIds.length} 条`

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
          { label: '线索', value: String(leadIds.length) },
          { label: '预计封', value: String(estimate.estimatedLetters) },
          { label: '产品', value: productId.slice(0, 18) },
          { label: '耗时', value: `${mm}:${ss}` },
        ],
      })
    }

    const promptText = buildDraftOutreachPrompt(
      productId,
      leadIds,
      estimate.estimatedLetters,
    )
    this.attachTimeline(timeline)
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
        idleTimeoutMs,
      )

      if (idleResult === 'abort') {
        const abortMessage = this.autoAbortReason ?? '用户中止了邮件起草'
        pushState('error')
        timeline.addSuffix({
          id: 'sys-abort',
          kind: 'error',
          time: nowTime(),
          title: this.autoAbortReason ? '失败' : '已中止',
          body: abortMessage,
        })
        flushTimeline()
        emit({
          type: 'done',
          ok: false,
          productId,
          message: abortMessage,
        })
        return { ok: false, message: abortMessage }
      }

      if (idleResult === 'timeout') {
        throw new Error('等待 OpenCode 会话 idle 超时')
      }

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
          this.lastModelError ??
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
      this.abort = null
    }
  }

  async runDraftOutreachEmailSlot(
    options: {
      productId: string
      leadId: string
      audience: 'company' | 'person'
      email?: string
      recipientKey?: string
    },
    emit: AgentEventSink,
  ): Promise<{ ok: boolean; message: string; recipientKey?: string }> {
    if (this.running) {
      throw new Error('已有 Agent 任务在运行，请稍候或先中止')
    }

    const client = this.getClient()
    if (!client) {
      throw new Error('OpenCode 未就绪，请先在设置页确认运行时状态')
    }

    const productId = options.productId.trim()
    const leadId = options.leadId.trim()
    const audience = options.audience === 'person' ? 'person' : 'company'
    const email = options.email?.trim() || ''
    let recipientKey =
      options.recipientKey?.trim() ||
      (audience === 'company' ? 'company' : '')
    if (!recipientKey && audience === 'person' && email) {
      recipientKey = recipientKeyFromEmail(email) || ''
    }
    if (!productId) throw new Error('缺少 productId')
    if (!leadId) throw new Error('缺少 leadId')
    if (audience === 'person' && !email && !recipientKey) {
      throw new Error('个人向起草需要 email 或 recipientKey')
    }

    const profile = loadProfile(productId)
    if (!profile) {
      throw new Error(`未找到产品画像：${productId}`)
    }

    const idleTimeoutMs = 10 * 60_000
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
      let readiness = '单槽起草中'
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
          { label: '线索', value: leadId.slice(0, 18) },
          { label: '槽', value: recipientKey || audience },
          { label: '产品', value: productId.slice(0, 18) },
          { label: '耗时', value: `${mm}:${ss}` },
        ],
      })
    }

    const promptText = buildDraftOutreachSlotPrompt({
      productId,
      leadId,
      audience,
      email: email || undefined,
      recipientKey: recipientKey || undefined,
    })
    this.attachTimeline(timeline)
    timeline.reset()
    timeline.addPrefix({
      id: 'sys-prepare',
      kind: 'system',
      time: nowTime(),
      title: '系统',
      body: `准备为 ${productId}（${profile.companyName || '未命名'}）单槽起草 · ${leadId} · ${recipientKey || audience}`,
    })
    timeline.addPrefix({
      id: 'user-draft-slot',
      kind: 'user',
      time: nowTime(),
      title: '你的指令 · 单槽邮件起草',
      body: promptText,
      collapsed: true,
    })
    pushState('running')
    flushTimeline()

    let stopEvents: (() => void) | null = null

    try {
      const created = await client.session.create({
        title: `draft-outreach-email-slot · ${leadId}`,
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
        idleTimeoutMs,
      )

      if (idleResult === 'abort') {
        const abortMessage = this.autoAbortReason ?? '用户中止了单槽邮件起草'
        pushState('error')
        timeline.addSuffix({
          id: 'sys-abort',
          kind: 'error',
          time: nowTime(),
          title: this.autoAbortReason ? '失败' : '已中止',
          body: abortMessage,
        })
        flushTimeline()
        emit({
          type: 'done',
          ok: false,
          productId,
          message: abortMessage,
        })
        return { ok: false, message: abortMessage }
      }

      if (idleResult === 'timeout') {
        throw new Error('等待 OpenCode 会话 idle 超时')
      }

      if (!recipientKey && audience === 'person' && email) {
        recipientKey = recipientKeyFromEmail(email) || recipientKey
      }
      const checkKey = recipientKey || 'company'
      const slot = await loadWithGrace(
        () => {
          const detail = getEmailDraftSlot(productId, leadId, checkKey)
          return detail.ok && detail.exists ? detail : null
        },
        { signal, attempts: 16, intervalMs: 500 },
      )

      if (!slot) {
        throw new Error(
          this.lastModelError ??
            `会话已结束，但未找到目标槽草稿（${checkKey}）。请确认已调用 email_draft_plan_slot 与 email_draft_save。`,
        )
      }

      try {
        clearEmailDraftZh(leadId, checkKey, getWorkspaceRoot())
      } catch {
        // 清空对照失败不阻断起草成功
      }

      const message = `单槽起草完成：${slot.draftPath}`
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
      })
      return { ok: true, message, recipientKey: checkKey }
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
      this.abort = null
    }
  }

  async runTranslateOutreachEmail(
    options: {
      productId: string
      leadId: string
      recipientKey?: string
    },
    emit: AgentEventSink,
  ): Promise<{ ok: boolean; message: string; recipientKey?: string }> {
    if (this.running) {
      throw new Error('已有 Agent 任务在运行，请稍候或先中止')
    }

    const client = this.getClient()
    if (!client) {
      throw new Error('OpenCode 未就绪，请先在设置页确认运行时状态')
    }

    const productId = options.productId.trim()
    const leadId = options.leadId.trim()
    const recipientKey = options.recipientKey?.trim() || 'company'
    if (!productId) throw new Error('缺少 productId')
    if (!leadId) throw new Error('缺少 leadId')

    const slotBefore = getEmailDraftSlot(productId, leadId, recipientKey)
    if (!slotBefore.ok || !slotBefore.exists) {
      throw new Error(`未找到草稿：${slotBefore.draftPath || recipientKey}`)
    }
    if (!slotBefore.subject?.trim() || !slotBefore.body?.trim()) {
      throw new Error('外文主题或正文为空，无法生成对照')
    }

    const idleTimeoutMs = 8 * 60_000
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
      let readiness = '翻译对照中'
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
        skill: 'translate-outreach-email',
        status,
        productId,
        meta: [
          { label: '状态', value: readiness, tone },
          { label: '线索', value: leadId.slice(0, 18) },
          { label: '槽', value: recipientKey },
          { label: '产品', value: productId.slice(0, 18) },
          { label: '耗时', value: `${mm}:${ss}` },
        ],
      })
    }

    const promptText = buildTranslateOutreachPrompt({
      productId,
      leadId,
      recipientKey,
      audience: slotBefore.audience,
      companyName: slotBefore.companyName,
      subject: slotBefore.subject,
      body: slotBefore.body,
    })

    this.attachTimeline(timeline)
    timeline.reset()
    timeline.addPrefix({
      id: 'sys-prepare',
      kind: 'system',
      time: nowTime(),
      title: '系统',
      body: `准备生成中文对照 · ${leadId} · ${recipientKey}`,
    })
    timeline.addPrefix({
      id: 'user-translate',
      kind: 'user',
      time: nowTime(),
      title: '你的指令 · 中文对照',
      body: promptText,
      collapsed: true,
    })
    pushState('running')
    flushTimeline()

    let stopEvents: (() => void) | null = null

    try {
      const created = await client.session.create({
        title: `translate-outreach-email · ${leadId}`,
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
        idleTimeoutMs,
      )

      if (idleResult === 'abort') {
        const abortMessage = this.autoAbortReason ?? '用户中止了中文对照生成'
        pushState('error')
        timeline.addSuffix({
          id: 'sys-abort',
          kind: 'error',
          time: nowTime(),
          title: this.autoAbortReason ? '失败' : '已中止',
          body: abortMessage,
        })
        flushTimeline()
        emit({
          type: 'done',
          ok: false,
          productId,
          message: abortMessage,
        })
        return { ok: false, message: abortMessage }
      }

      if (idleResult === 'timeout') {
        throw new Error('等待 OpenCode 会话 idle 超时')
      }

      const slot = await loadWithGrace(
        () => {
          const detail = getEmailDraftSlot(productId, leadId, recipientKey)
          const hasZh = Boolean(detail.subjectZh || detail.bodyZh)
          return detail.ok && detail.exists && hasZh ? detail : null
        },
        { signal, attempts: 16, intervalMs: 500 },
      )

      if (!slot) {
        throw new Error(
          this.lastModelError ??
            `会话已结束，但未写入中文对照。请确认已调用 email_draft_save_zh。`,
        )
      }

      const message = `中文对照已写入：${slot.draftPath}`
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
      })
      return { ok: true, message, recipientKey }
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
      this.abort = null
    }
  }

  async enrichLeadContacts(
    options: {
      productId: string
      leadId?: string
      leadIds?: string[]
      verifyEmails?: boolean
    },
    emit: AgentEventSink,
  ): Promise<{ ok: boolean; message: string }> {
    if (this.running) {
      throw new Error('已有 Agent 任务在运行，请稍候或先中止')
    }

    const client = this.getClient()
    if (!client) {
      throw new Error('OpenCode 未就绪，请先在设置页确认运行时状态')
    }

    const productId = options.productId.trim()
    const fromList = (options.leadIds ?? []).map((id) => id.trim()).filter(Boolean)
    const single = options.leadId?.trim() || ''
    const explicit = fromList.length > 0 || Boolean(single)
    const leadIds =
      fromList.length > 0
        ? fromList
        : single
          ? [single]
          : listScoredLeadsNeedingEnrich(productId)
    const verifyEmails = Boolean(options.verifyEmails)
    if (!productId) {
      throw new Error('缺少 productId')
    }
    if (leadIds.length === 0) {
      const message = explicit
        ? '未指定有效线索 ID'
        : '暂无待补全的已评分线索（需有官网域名且尚未有关键联系人）'
      emit({
        type: 'state',
        skill: 'enrich-lead-contacts',
        status: 'done',
        productId,
        meta: [
          { label: '状态', value: '无需补全', tone: 'success' },
          { label: '线索', value: '0' },
          { label: '验邮', value: verifyEmails ? '是' : '否' },
        ],
      })
      emit({ type: 'done', ok: true, productId, message })
      return { ok: true, message }
    }
    if (leadIds.length > 50) {
      throw new Error(`一次最多补全 50 条，当前 ${leadIds.length} 条，请缩小范围`)
    }

    this.running = true
    this.abort = new AbortController()
    const signal = this.abort.signal
    const startedAt = Date.now()
    const timeline = new TimelineBuilder()
    const targetLabel =
      leadIds.length === 1 ? leadIds[0].slice(0, 18) : `${leadIds.length} 条`

    const flushTimeline = () => {
      const items = timeline.emitIfChanged()
      if (items) emit({ type: 'timeline', items })
    }

    const pushState = (status: 'idle' | 'running' | 'done' | 'error') => {
      const elapsedSec = Math.max(0, Math.round((Date.now() - startedAt) / 1000))
      const mm = String(Math.floor(elapsedSec / 60)).padStart(2, '0')
      const ss = String(elapsedSec % 60).padStart(2, '0')
      let readiness = '补全中'
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
        skill: 'enrich-lead-contacts',
        status,
        productId,
        meta: [
          { label: '状态', value: readiness, tone },
          { label: '线索', value: targetLabel },
          { label: '验邮', value: verifyEmails ? '是' : '否' },
          { label: '耗时', value: `${mm}:${ss}` },
        ],
      })
    }

    const promptText = buildEnrichLeadContactsPrompt(productId, leadIds, verifyEmails)
    this.attachTimeline(timeline)
    timeline.reset()
    timeline.addPrefix({
      id: 'sys-prepare',
      kind: 'system',
      time: nowTime(),
      title: '系统',
      body:
        leadIds.length === 1
          ? `准备为 ${leadIds[0]} 补全联系人${verifyEmails ? '（含验邮）' : ''}`
          : `准备批量补全 ${leadIds.length} 条线索${verifyEmails ? '（含验邮）' : ''}`,
    })
    timeline.addPrefix({
      id: 'user-enrich',
      kind: 'user',
      time: nowTime(),
      title: '你的指令 · 补全联系人',
      body: promptText,
      collapsed: true,
    })
    pushState('running')
    flushTimeline()

    let stopEvents: (() => void) | null = null

    try {
      const created = await client.session.create({
        title:
          leadIds.length === 1
            ? `enrich-lead-contacts · ${productId} · ${leadIds[0]}`
            : `enrich-lead-contacts · ${productId} · ${leadIds.length}`,
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
        15 * 60_000 * Math.min(Math.max(leadIds.length, 1), 10),
      )

      if (idleResult === 'abort') {
        const abortMessage = this.autoAbortReason ?? '用户中止了补全联系人'
        pushState('error')
        timeline.addSuffix({
          id: 'sys-abort',
          kind: 'error',
          time: nowTime(),
          title: this.autoAbortReason ? '失败' : '已中止',
          body: abortMessage,
        })
        flushTimeline()
        emit({ type: 'done', ok: false, productId, message: abortMessage })
        return { ok: false, message: abortMessage }
      }

      if (idleResult === 'timeout') {
        throw new Error('等待 OpenCode 会话 idle 超时')
      }

      const message =
        leadIds.length === 1
          ? `补全联系人完成：${leadIds[0]}`
          : `批量补全联系人完成：${leadIds.length} 条`
      timeline.addSuffix({
        id: 'sys-done',
        kind: 'system',
        time: nowTime(),
        title: '完成',
        body: message,
      })
      flushTimeline()
      pushState('done')
      emit({ type: 'done', ok: true, productId, message })
      return { ok: true, message }
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
      emit({ type: 'done', ok: false, productId, message })
      return { ok: false, message }
    } finally {
      stopEvents?.()
      this.running = false
      this.abort = null
    }
  }

  async runDiscoverLeads(
    productId: string,
    emit: AgentEventSink,
    options?: {
      rounds?: string[]
      maxQueries?: number
      channel?: 'r1' | 'r2' | 'r3'
    },
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

    const channel = options?.channel ?? 'r1'
    const isR2 = channel === 'r2'
    const isR3 = channel === 'r3'
    const skillName = isR3
      ? 'discover-leads-r3'
      : isR2
        ? 'discover-leads-r2'
        : 'discover-leads'
    const roundName = isR3
      ? 'R3 地图发现'
      : isR2
        ? 'R2 社媒发现'
        : 'R1 广撒网'
    const rounds = isR3 ? ['R3'] : isR2 ? ['R2'] : ['R1']
    const availableCount = isR3
      ? expansion.search_queries.filter(
          (q) =>
            String(q.round).toUpperCase() === 'R3' && !String(q.site_id || '').trim(),
        ).length
      : isR2
        ? expansion.search_queries.filter(isEligibleR2Query).length
        : expansion.search_queries.filter((q) => String(q.round).toUpperCase() === 'R1')
            .length
    if (availableCount === 0) {
      throw new Error(
        isR3
          ? 'expansion.json 中没有 R3 地图发现词，请重新扩展关键词'
          : isR2
            ? 'expansion.json 中没有带站点的 R2 搜索词，请重新扩展关键词'
            : 'expansion.json 中没有 R1 轮次的搜索词',
      )
    }
    // 未传 maxQueries 时按当前轮次可用词数全量执行（不再默认截断为 10）
    const maxQueries = Math.max(1, options?.maxQueries ?? availableCount)

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
          ? `${run.queries_executed}/${Math.min(maxQueries, availableCount)}`
          : `0/${Math.min(maxQueries, availableCount)}`
      emit({
        type: 'state',
        skill: skillName,
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

    const promptText = isR3
      ? buildDiscoverLeadsR3Prompt(productId, maxQueries)
      : isR2
        ? buildDiscoverLeadsR2Prompt(productId, maxQueries)
        : buildDiscoverLeadsPrompt(productId, { rounds, maxQueries })
    this.attachTimeline(timeline)
    timeline.reset()
    timeline.addPrefix({
      id: 'sys-prepare',
      kind: 'system',
      time: nowTime(),
      title: '系统',
      body: `准备为 ${productId}（${profile.companyName || '未命名'}）执行 ${roundName} · 最多 ${maxQueries} 词（可用 ${availableCount}）`,
    })
    timeline.addPrefix({
      id: 'user-discover',
      kind: 'user',
      time: nowTime(),
      title: `你的指令 · 开始 ${roundName}`,
      body: promptText,
      collapsed: true,
    })
    pushState('running')
    flushTimeline()

    let stopEvents: (() => void) | null = null

    try {
      const created = await client.session.create({
        title: `${skillName} · ${productId}`,
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
        const abortMessage = this.autoAbortReason ?? `用户中止了 ${roundName}`
        const abortedRun = failLatestRunningExploration(
          productId,
          afterIso,
          abortMessage,
        )
        pushState('error', abortedRun ?? undefined)
        timeline.addSuffix({
          id: 'sys-abort',
          kind: 'error',
          time: nowTime(),
          title: this.autoAbortReason ? '失败' : '已中止',
          body: abortedRun
            ? `${abortMessage}\nrun ${abortedRun.id} 已标记为 failed`
            : abortMessage,
        })
        flushTimeline()
        emit({
          type: 'done',
          ok: false,
          productId,
          message: abortMessage,
          explorationRun: abortedRun ?? undefined,
        })
        return {
          ok: false,
          message: abortMessage,
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

      let run = await loadWithGrace(
        () => findLatestRunAfter(productId, afterIso),
        { signal, attempts: 12, intervalMs: 500 },
      )

      if (!run) {
        throw new Error(
          this.lastModelError ??
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
        const message = `${roundName}未完成：${run.id} · 已执行 ${run.queries_executed} 词 · 线索 ${run.leads_found}`
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
        const message = `${roundName}失败：${run.id} · 已执行 ${run.queries_executed} 词 · 线索 ${run.leads_found}`
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

      const message = `${roundName}完成：${run.id} · ${run.queries_executed} 词 · 线索 ${run.leads_found}`
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
    this.attachTimeline(timeline)
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
        const abortMessage = this.autoAbortReason ?? '用户中止了画像生成'
        pushState('error')
        timeline.addSuffix({
          id: 'sys-abort',
          kind: 'error',
          time: nowTime(),
          title: this.autoAbortReason ? '失败' : '已中止',
          body: abortMessage,
        })
        flushTimeline()
        emit({
          type: 'done',
          ok: false,
          productId: bootstrap.productId,
          message: abortMessage,
        })
        return { ok: false, message: abortMessage }
      }

      if (idleResult === 'timeout') {
        throw new Error('等待 OpenCode 会话 idle 超时')
      }

      let profile = await loadWithGrace(
        () => loadProfile(bootstrap.productId),
        { signal, attempts: 12, intervalMs: 500 },
      )

      if (!profile) {
        throw new Error(
          this.lastModelError ??
            '会话已结束，但未找到 profile.json。请向上滚动查看工具调用与模型输出。',
        )
      }

      profile = patchProfileSourceInputs(bootstrap.productId) ?? profile

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
  ): { stop: () => void } {
    let stopped = false
    const messageRoles = new Map<string, Message['role']>()
    let retrySince = 0
    let lastRetryBody = ''
    let sawSessionError = false
    let watchdogTimer: ReturnType<typeof setTimeout> | null = null

    const applySnapshot = (item: AgentTimelineItem): void => {
      timeline.upsertSessionItem(item)
      flush()
    }

    const disarmWatchdog = (): void => {
      if (watchdogTimer != null) {
        clearTimeout(watchdogTimer)
        watchdogTimer = null
      }
    }

    const failEventBridge = (err: unknown): void => {
      if (stopped) return
      stopped = true
      disarmWatchdog()
      const detail =
        err instanceof Error ? err.message : err != null ? String(err) : '未知错误'
      this.autoAbortReason = `OpenCode 事件流不可用：${detail}`
      timeline.addSuffix({
        id: 'sse-fatal',
        kind: 'error',
        time: nowTime(),
        title: '事件订阅失败',
        body: `${this.autoAbortReason}\n任务已中止，请检查 OpenCode 运行时状态后重试。`,
      })
      flush()
      void client.session.abort({ sessionID: sessionId }).catch(() => undefined)
      this.abort?.abort()
    }

    const armWatchdog = (): void => {
      if (watchdogTimer != null) return
      watchdogTimer = setTimeout(() => {
        if (stopped) return
        const reason = `模型服务持续不可用（自动重试超过 ${Math.round(RETRY_WATCHDOG_MS / 60000)} 分钟），任务已自动停止。\n${lastRetryBody}`
        this.autoAbortReason = reason
        timeline.addSuffix({
          id: 'session-retry-watchdog',
          kind: 'error',
          time: nowTime(),
          title: '已自动停止',
          body: reason,
        })
        flush()
        void client.session.abort({ sessionID: sessionId }).catch(() => undefined)
        this.abort?.abort()
      }, RETRY_WATCHDOG_MS)
    }

    const handleEvent = (event: Event): void => {
      switch (event.type) {
        case 'server.instance.disposed':
          failEventBridge(new Error('OpenCode 实例已释放'))
          return

        case 'permission.asked':
        case 'permission.v2.asked':
          if (event.properties.sessionID !== sessionId) return
          void client.permission
            .reply({ requestID: event.properties.id, reply: 'always' })
            .catch(() => undefined)
          return

        case 'message.updated': {
          if (event.properties.sessionID !== sessionId) return
          const { info } = event.properties
          messageRoles.set(info.id, info.role)
          if (info.role === 'assistant' && info.error) {
            const body = formatMessageError(info.error)
            this.lastModelError = body
            timeline.addSuffix({
              id: `error-${info.id}`,
              kind: 'error',
              time: nowTime(),
              title: '模型调用失败',
              body,
            })
            flush()
          }
          return
        }

        case 'message.part.updated': {
          if (event.properties.sessionID !== sessionId) return
          const { part } = event.properties
          if (messageRoles.get(part.messageID) === 'user') return
          if (part.type === 'text') {
            if (part.ignored === true) return
            if (!part.text || part.text.trim() === userPrompt.trim()) return
            applySnapshot({
              id: `assistant-${part.id}`,
              kind: 'assistant',
              time: nowTime(),
              title: '模型回复',
              body: part.text,
            })
            return
          }
          if (part.type === 'reasoning') {
            if (!part.text) return
            applySnapshot({
              id: `reasoning-${part.id}`,
              kind: 'reasoning',
              time: nowTime(),
              title: '思考',
              body: part.text,
              collapsed: part.text.length > COLLAPSE_BODY_CHARS,
            })
            return
          }
          if (part.type === 'tool') {
            applySnapshot(toolPartToTimelineItem(part))
          }
          return
        }

        case 'message.part.removed': {
          if (event.properties.sessionID !== sessionId) return
          const { partID } = event.properties
          timeline.removeSessionItem(`assistant-${partID}`)
          timeline.removeSessionItem(`reasoning-${partID}`)
          timeline.removeSessionItem(`tool-${partID}`)
          flush()
          return
        }

        case 'session.error': {
          if (event.properties.sessionID && event.properties.sessionID !== sessionId) return
          sawSessionError = true
          const err = event.properties.error
          const body = err ? formatMessageError(err) : '模型调用失败（未返回错误详情）'
          this.lastModelError = body
          timeline.addSuffix({
            id: 'session-error',
            kind: 'error',
            time: nowTime(),
            title: '模型调用失败',
            body,
          })
          if (retrySince) {
            timeline.addSuffix({
              id: 'session-retry',
              kind: 'error',
              time: nowTime(),
              title: '模型重试失败，已停止',
              body: lastRetryBody,
            })
            retrySince = 0
          }
          disarmWatchdog()
          flush()
          return
        }

        case 'session.status': {
          if (event.properties.sessionID !== sessionId) return
          const { status } = event.properties
          if (status.type === 'retry') {
            if (!retrySince) retrySince = Date.now()
            const waitSec = Math.max(1, Math.round((status.next - Date.now()) / 1000))
            lastRetryBody = [
              `原因：${friendlyRetryReason(status.message)}`,
              `约 ${waitSec} 秒后进行下一次尝试`,
              '若持续重试约 2 分钟仍不可用，任务将自动停止；欠费请先充值后再试。',
            ].join('\n')
            timeline.addSuffix({
              id: 'session-retry',
              kind: 'error',
              time: nowTime(),
              title: `模型调用失败，重试中 · 第 ${status.attempt} 次`,
              body: lastRetryBody,
            })
            armWatchdog()
            flush()
            return
          }
          if (status.type === 'idle') {
            if (retrySince && !sawSessionError) {
              timeline.addSuffix({
                id: 'session-retry',
                kind: 'system',
                time: nowTime(),
                title: '模型重试已恢复',
                body: `${lastRetryBody}\n已恢复，继续执行。`,
              })
              flush()
            }
            retrySince = 0
            sawSessionError = false
            disarmWatchdog()
          }
          return
        }

        default:
          return
      }
    }

    void (async () => {
      try {
        const sub = await client.event.subscribe()
        for await (const event of sub.stream) {
          if (stopped) break
          handleEvent(event)
        }
      } catch (err) {
        failEventBridge(err)
      }
    })()

    return {
      stop: () => {
        stopped = true
        disarmWatchdog()
      },
    }
  }
}
