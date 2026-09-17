---
name: translate-outreach-email
description: 将已有开发信外文稿译为中文对照（仅审阅），经 email_draft_save_zh 落盘；不改外发正文。用户说中文对照、翻译开发信、生成中文稿时使用。
phase: 1
inputs:
  - name: product_id
    type: string
    required: true
  - name: lead_id
    type: string
    required: true
  - name: recipient_key
    type: string
    required: false
outputs:
  - path: data/emails/{lead_id}/draft.json
    schema: EmailDraftZhFields
  - path: data/emails/{lead_id}/{recipient_key}/draft.json
    schema: EmailDraftZhFields
---

# translate-outreach-email

为**已存在**的开发信外文稿生成中文对照（`subject_zh` / `body_zh`），供中文业务员审阅。

- **不**改 `subject` / `body` / `status` / `language`
- **必须**用 `lead-store.email_draft_save_zh` 落盘
- **禁止**调用 `email_draft_save`、`email_draft_plan`、`email_draft_plan_slot`

## 何时使用

- 用户在邮件页点击「生成/刷新中文对照」
- 用户说「翻译这封开发信」「出中文对照」

## 前置条件

- MCP `lead-store` 已配置
- 目标槽已有 `draft.json`（公司向或个人向）
- 会话 Prompt 通常已嵌入外文 `subject` / `body`

## 输入参数

| 参数 | 默认 | 说明 |
|------|------|------|
| `product_id` | 必填 | 产品 ID（溯源） |
| `lead_id` | 必填 | 线索 ID |
| `recipient_key` | `company` | 公司向可省略或 `company`；个人向为邮箱派生 key |

## 执行步骤

### Step 1：确认外文稿

使用会话中给出的外文主题与正文；若缺失，停止并说明需要先有外文草稿。

### Step 2：翻译（辅助审阅）

1. 忠实译为简体中文主题与正文
2. 不扩写卖点、不改称呼对象
3. 公司名、产品型号等专有名词可保留英文或惯用译法
4. 对照仅供审阅，**不是**外发正文

### Step 3：落盘（必须）

调用：

```
lead-store.email_draft_save_zh({
  lead_id,
  recipient_key,   // 个人向必填；公司向可省略
  subject_zh,
  body_zh
})
```

确认返回 `success: true`。若 `draft_not_found` / `empty_zh`，说明原因并停止。

### Step 4：汇报

用一两句中文说明已写入中文对照；**不要**声称已改外文稿或已通过审核。

## 禁止事项

- 调用 `email_draft_save`（会误伤外文）
- 调用 `email_draft_plan` / `email_draft_plan_slot`
- 修改 scored lead / 画像
- 把中文写成外发选用正文
