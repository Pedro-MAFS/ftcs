import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import { evaluateStartTask } from "./start-task.js"

describe("evaluateStartTask", () => {
  it("accepts the four stages and leaves product empty", () => {
    assert.deepEqual(evaluateStartTask({ stage: "keywords" }), {
      ok: true,
      stage: "keywords",
      product_id: null,
      message: "参数已接受。不要再写文件，也不要再次启动。",
    })
    assert.equal(evaluateStartTask({ stage: " score ", product_id: "  prd_1 " }).ok, true)
    const score = evaluateStartTask({ stage: "score", product_id: " prd_1 " })
    assert.equal(score.ok && score.product_id, "prd_1")
    assert.equal(evaluateStartTask({ stage: "email", product_id: "" }).ok, true)
  })

  it("requires a channel only for explore", () => {
    assert.deepEqual(evaluateStartTask({ stage: "explore" }), {
      ok: false,
      code: "missing_channel",
      message: "不能从聊天启动这一步。",
    })
    assert.equal(evaluateStartTask({ stage: "explore", explore_channel: "r9" }).ok, false)
    const explore = evaluateStartTask({ stage: "explore", explore_channel: "r3", product_id: "prd_9" })
    assert.deepEqual(
      explore.ok
        ? { stage: explore.stage, channel: explore.explore_channel, product_id: explore.product_id }
        : explore,
      { stage: "explore", channel: "r3", product_id: "prd_9" },
    )
    const keywords = evaluateStartTask({ stage: "keywords", explore_channel: "r1" })
    assert.equal(keywords.ok && keywords.explore_channel, undefined)
  })

  it("rejects unknown stages, including profile and one-off mail actions", () => {
    for (const stage of ["profile", "enrich", "rewrite", "translate", "", "KEYWORDS"]) {
      const result = evaluateStartTask({ stage })
      assert.equal(result.ok, false)
      assert.equal(result.ok === false && result.code, "bad_stage")
    }
  })
})

describe("start_task tool copy", () => {
  it("tells the model when to call, and not to write files or start twice", () => {
    const src = readFileSync(fileURLToPath(new URL("../src/index.ts", import.meta.url)), "utf8")
    assert.equal(src.includes("用户明确要开始一轮获客步骤时才调用"), true)
    assert.equal(src.includes("画像不要调用"), true)
    assert.equal(src.includes("录入页"), true)
    assert.equal(src.includes("左侧按钮"), true)
    assert.equal(src.includes("不要再写文件"), true)
    assert.equal(src.includes("不要再启动第二次"), true)
    assert.equal(src.includes("补联系人"), true)
    assert.equal(src.includes("单封重写"), true)
    assert.equal(src.includes("中文对照"), true)
    assert.equal(src.includes("evaluateStartTask"), true)
    assert.equal(src.includes("runExpandKeywords"), false)
  })
})
