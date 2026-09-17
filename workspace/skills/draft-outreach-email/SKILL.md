---
name: draft-outreach-email
description: 为已评分线索按 1+N 槽位计划撰写开发信（公司向 1 封 + contacts 个人向 N 封），经 MCP save 落盘。用户说写开发信、生成邮件、触达客户时使用。
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
  - path: data/emails/{lead_id}/{recipient_key}/draft.json
    schema: EmailDraft
---

# draft-outreach-email

为评分后的线索生成开发信草稿（**不限 tier**；默认取 `status=new` 按分数优先）。

- **公司向**：每条线索恰好 1 封 → `data/emails/{lead_id}/draft.json`
- **个人向**：来自该 lead **`contacts`** 中个人级邮箱，最多 5 封 → `data/emails/{lead_id}/{recipient_key}/draft.json`

正文由你直接撰写；MCP `email_draft_plan` 只返回槽位计划与称呼/路径提示，不落盘正文。

## 何时使用

- `score-and-dedupe` 完成后需要撰写开发信
- 用户说「生成邮件」「写开发信」「为客户准备触达邮件」
- Phase 1 最后一环，完成后进入人工审核

## 前置条件

- MCP `lead-store` 已配置
- 存在该产品的画像（`product_get` 可读）与 `data/leads/{product_id}/scored.json`

## 输入参数

| 参数 | 默认 | 说明 |
|------|------|------|
| `product_id` | 必填 | 产品 ID |
| `lead_ids` | 无 | 指定线索；不填则取 `status=new` 按分数 Top |
| `limit` | `5` | 最多几条线索（上限 50） |

## 执行步骤

### Step 1：读取自家画像与评分线索

1. 调用 `lead-store.product_get({ product_id })`，掌握卖方公司名、产品/卖点、认证、网站等（撰写时必须结合，禁止臆造自家能力）
2. 调用 `lead-store.leads_get_scored({ product_id })`；若无 scored 文件 → 停止，提示先运行 `score-and-dedupe`

### Step 2：获取 1+N 槽位计划

调用：

```
lead-store.email_draft_plan({
  product_id,
  lead_ids,   // 可选
  limit
})
```

工具只返回计划，不写 `draft.json`。关注：

- `plans[].slots[]`：每槽含 `audience`、`recipient_key`、`email`、`greeting_line`、`draft_path`、`personalization_hints`
- `skipped` / `warnings`（如 `person_slots_capped`）

### Step 3：逐槽撰写并保存（必须）

对 `plans` 中 **每一个** `slots[]` 元素：

1. 按会话中的 **用户行文风格** 撰写英文 `subject` + `body`（每槽仅一份正文）
2. **采用** plan 的 `greeting_line` 作为称呼（公司向须保持 Team 语义）
3. 内容须同时落脚 **线索侧**（`personalization_hints` / scored 已有事实）与 **自家侧**（`product_get` 中的公司/产品/卖点/认证等）；两边都禁止编造
4. 建议正文 ≤200 英文词；须有明确 CTA
5. 调用 `lead-store.email_draft_save`：

```
email_draft_save({
  lead_id,
  recipient_key,   // 公司向可省略或传 "company"
  write_markdown: true,
  draft: {
    product_id,
    audience,      // "company" | "person"
    language,      // 用 plan 的 language
    subject,
    body,
    style_prompt,  // 任务 Prompt 中的用户风格原文
    personalization_evidence: personalization_hints,
    recipient: {
      company: company_name,
      email,       // 公司向可空
      name,        // 个人向可用 display_name
      recipient_aliases  // 公司向可用 aliases
    }
  }
})
```

**禁止**用手写/Write 工具直接创建或覆盖 `draft.json`。

显式传入 `lead_ids` 时：覆盖该线索计划内已有稿。

## 单槽模式

当任务明确指定 **单条** `lead_id` + `audience`（及个人向 `email`）时，走单槽流程，只覆盖当前收件人。

### 何时使用

- 邮件页对某一收件人点击「起草」或「重写」
- 用户说「只给某人写一封」「重写公司向」等单收件人意图

### 执行步骤（单槽）

1. 调用 `lead-store.product_get({ product_id })`
2. 调用 `lead-store.email_draft_plan_slot`：

```
email_draft_plan_slot({
  product_id,
  lead_id,
  audience,   // "company" | "person"
  email       // 个人向必填
})
```

3. 按返回槽位撰写英文 `subject`/`body`（采用 `greeting_line`），再 **一次** `email_draft_save`（带 `style_prompt`、`write_markdown: true`）
4. **禁止**调用整 lead 的 `email_draft_plan`
5. 简短汇报落盘路径与 subject

## 输出摘要（批量 / 单槽通用）

用简短中文汇报：

- 线索数、成功落盘封数、`skipped` / `warnings`
- 每槽：公司名、收件邮箱（可空）、audience、subject、路径
- 提醒：**请人工审核后再发送**

## 错误处理

| 情况 | 处理 |
|------|------|
| 无 scored.json | 提示先运行 `score-and-dedupe` |
| 无产品画像 | 提示先完成产品画像 |
| 线索已有公司向且未指定 lead_ids | 出现在 `skipped`（`draft_already_exists`） |
| 个人邮箱过多 | `warnings.person_slots_capped`；仍写 cap 内槽位 |

## 流水线

- 上一步：`score-and-dedupe`
- 下一步：人工审核草稿；发送能力属后续阶段
