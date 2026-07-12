---
name: draft-outreach-email
description: 为高意向线索生成个性化意向邮件草稿（short/professional），保存 draft.json 与 draft.md。用户说写开发信、生成邮件、触达客户时使用。
phase: 1
inputs:
  - name: product_id
    type: string
    required: true
  - name: lead_ids
    type: array
    required: false
  - name: limit
    type: number
    required: false
outputs:
  - path: data/emails/{lead_id}/draft.json
    schema: EmailDraft
  - path: data/emails/{lead_id}/draft.md
    schema: markdown
---

# draft-outreach-email

为评分后的**高意向线索**生成开发信草稿，保存至 `data/emails/{lead_id}/`，并将线索状态更新为 `email_drafted`。

## 何时使用

- `score-and-dedupe` 完成后，需要为 high tier 线索撰写开发信
- 用户说「生成邮件」「写开发信」「为 Top 客户准备触达邮件」
- Phase 1 最后一环，完成后进入人工审核（Phase 2 发送）

## 前置条件

- MCP `lead-store` 已配置
- 存在 `data/leads/{product_id}/scored.json`
- 目标线索 `tier == "high"` 且 `status == "new"`（或用户指定 lead_ids）

## 输入参数

| 参数 | 默认 | 说明 |
|------|------|------|
| `product_id` | 必填 | 产品 ID |
| `lead_ids` | 无 | 指定线索 ID 列表；不填则取 Top high tier |
| `limit` | `5` | 最多生成几封（验收要求 Top 5） |

## 执行步骤

### Step 1：确认评分线索

1. 调用 `lead-store.leads_get_scored`，传入 `product_id`
2. 若无 scored 文件 → 停止，提示先运行 `score-and-dedupe`
3. 确认存在 `tier == "high"` 且 `status == "new"` 的线索

### Step 2：生成邮件草稿

调用：

```
lead-store.email_draft_generate({
  product_id,
  lead_ids,      // 可选
  limit: 5,
  write_markdown: true
})
```

该工具会：

1. 读取 `profile.json` 与目标线索
2. 为每条线索生成 2 个 variant：
   - **short**（≤ 120 词）：简洁直接
   - **professional**（≤ 200 词）：正式完整
3. 写入 `data/emails/{lead_id}/draft.json`
4. 写入 `data/emails/{lead_id}/draft.md`（供人工审核）
5. 更新线索 `status` → `email_drafted`
6. 记录 `personalization_evidence`（引用 match_reason、公司描述等）

### Step 3：智能体审阅与润色（推荐）

自动模板可作为基础。智能体应：

1. 调用 `email_draft_get` 读取草稿
2. 检查是否引用客户具体证据（网站产品、批发定位等）
3. 必要时润色 subject/body，使语气自然、不模板化
4. 调用 `email_draft_save` 保存修改

**邮件约束**：

- 必须有明确 CTA（报价、/catalog、15-min call）
- 禁止虚假承诺、夸大其词
- 首封邮件不附大附件
- 使用客户市场语言（Phase 1 默认 `en`）

### Step 4：输出摘要

向用户展示：

- 生成邮件数量
- 每条：公司名、收件邮箱、short 版 subject
- 草稿路径（`draft.json` / `draft.md`）
- 提示：**请人工审核后再发送**（Phase 2 才支持一键发送）

## 输出要求

- 每条目标线索各一份 `draft.json`
- 含 `variants`（short + professional）
- 含 `personalization_evidence`
- 对应线索 `status` 更新为 `email_drafted`

## 错误处理

| 情况 | 处理 |
|------|------|
| 无 scored.json | 提示先运行 `score-and-dedupe` |
| 无 high tier 线索 | 告知用户，可指定 lead_ids 或降低 tier 要求 |
| 草稿已存在 | 工具会 skip；可传 lead_ids 强制覆盖（save） |

## 示例对话

> 请为 prod_20260712_001 的 Top 5 高意向客户生成开发信草稿。

> 基于 scored.json，给 Covington Supply CO 写一封英文开发信。

## 相关文档

- 数据模型：`docs/03-数据模型.md` 第 4 节
- 下一步（Phase 2）：`review-and-send-email`
