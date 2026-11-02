/**
 * US-FD-03：只校验从聊天启动任务的参数。不读产品文件，不跑流水线。
 */

export const START_TASK_STAGES = ["keywords", "explore", "score", "email"] as const
export const START_TASK_CHANNELS = ["r1", "r2", "r3"] as const

export type StartTaskStage = (typeof START_TASK_STAGES)[number]
export type StartTaskChannel = (typeof START_TASK_CHANNELS)[number]

export type StartTaskResult =
  | {
      ok: true
      stage: StartTaskStage
      product_id: string | null
      explore_channel?: StartTaskChannel
      message: string
    }
  | {
      ok: false
      code: "bad_stage" | "missing_channel"
      message: string
    }

const ACCEPTED_MESSAGE = "参数已接受。不要再写文件，也不要再次启动。"

export function evaluateStartTask(input: {
  stage?: unknown
  explore_channel?: unknown
  product_id?: unknown
}): StartTaskResult {
  const stage = typeof input.stage === "string" ? input.stage.trim() : ""
  if (!isStage(stage)) {
    return {
      ok: false,
      code: "bad_stage",
      message: "不能从聊天启动这一步。",
    }
  }

  const productRaw = typeof input.product_id === "string" ? input.product_id.trim() : ""
  const product_id = productRaw || null

  if (stage !== "explore") {
    return {
      ok: true,
      stage,
      product_id,
      message: ACCEPTED_MESSAGE,
    }
  }

  const channel = typeof input.explore_channel === "string" ? input.explore_channel.trim() : ""
  if (!isChannel(channel)) {
    return {
      ok: false,
      code: "missing_channel",
      message: "不能从聊天启动这一步。",
    }
  }

  return {
    ok: true,
    stage: "explore",
    product_id,
    explore_channel: channel,
    message: ACCEPTED_MESSAGE,
  }
}

function isStage(value: string): value is StartTaskStage {
  return (START_TASK_STAGES as readonly string[]).includes(value)
}

function isChannel(value: string): value is StartTaskChannel {
  return (START_TASK_CHANNELS as readonly string[]).includes(value)
}
