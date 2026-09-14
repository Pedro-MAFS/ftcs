---
name: enrich-lead-contacts
description: 对单条已评分线索用 Hunter Domain Search 补全联系人并写入 people[]；可选验邮。用户说补全联系人、找决策人邮箱、enrich-lead-contacts 时使用。
phase: 2
inputs:
  - name: product_id
    type: string
    required: true
  - name: lead_id
    type: string
    required: true
  - name: verify_emails
    type: boolean
    required: false
outputs:
  - path: data/leads/{product_id}/scored.json
    schema: ScoredLead.people
---

# enrich-lead-contacts

对 **单条** 已评分线索做 Hunter Domain Search → 按邮箱质量排序 → 全量写入 `people[]`。  
**可选**对全部候选调用 Email Verifier，并把符合条件的个人邮箱同步到 `contacts[]`。

```text
website → domain → domain_search → 映射+排序 → leads_patch_scored
                         └─(verify_emails)→ email_verifier×每人 → patch + sync_valid_to_contacts
```

## 何时使用

- 用户说「补全联系人」「找决策人邮箱」「enrich-lead-contacts」等，且已给出（或上下文中明确）`product_id` + `lead_id`
- `score-and-dedupe` 之后，某条 scored 线索需要人员邮箱，而现有 `contacts` 多为 `info@` / `sales@` 等通用地址

## 前置条件

- MCP：`lead-store`、`hunter-api`
- 存在 `data/leads/{product_id}/scored.json`，且含目标 `lead_id`
- 该 lead 的 `company.website` 可解析出域名（无域名则停止，不要猜）

## 输入参数

| 参数 | 默认 | 说明 |
|------|------|------|
| `product_id` | 必填 | 产品 ID |
| `lead_id` | 必填 | 单条 scored 线索 ID |
| `verify_emails` | `false` | 是否对全部候选人验邮；未说明则按 `false` |

## 冻结常量

| 常量 | 值 | 说明 |
|------|-----|------|
| `DOMAIN_SEARCH_LIMIT` | **10** | `domain_search.limit`；禁止更大 |
| `SYNC_CONFIDENCE_MIN` | **70** | 验邮后同步 `contacts` 的 confidence 下限 |

## 硬禁令

- **禁止**按邮箱 pattern 猜邮或编造地址；邮箱只能来自 Hunter 返回。
- **禁止**在 `verify_emails=false`（或缺省）时调用 `email_verifier`。
- **禁止**在配额/鉴权错误后重试烧额度。
- **禁止**覆盖已有 form/phone；`contacts` 仅按规则 **追加** email。

## 执行步骤

### Step 1：确认线索

1. 调用 `lead-store.leads_get_scored({ product_id })`，定位 `lead_id`；不存在则停止。
2. 可选 `product_get` 读取 `buyer_personas`（辅助 `role_match` / `match_reason`）。

### Step 2：解析域名

从 `company.website` 解析域名（去协议、www、路径）。失败则停止并说明缺少有效官网域名。

### Step 3：Domain Search

调用 `hunter-api.domain_search({ domain, limit: 10 })`。

工具错误处理：

- `HUNTER_NO_KEY` / `HUNTER_UNAUTHORIZED` → 停止，提示用户配置有效的 Hunter API Key
- `HUNTER_QUOTA_EXCEEDED` / `HUNTER_ALL_KEYS_EXHAUSTED` → 停止，说明额度问题，**不要重试**
- `emails` 为空 → 如实说明未找到公开邮箱，**不要编造**

### Step 4：映射 PersonInput

对每条返回的 email（无 `sources` 的条目 MCP 已丢弃，跳过即可）：

| Person 字段 | 来源 |
|-------------|------|
| `name` | first+last；皆空则用邮箱 `@` 前本地部分 |
| `first_name` / `last_name` / `title` | Hunter（可 null） |
| `role_match` | 弱匹配 `buyer_personas`；无则 null |
| `match_reason` | 必填：类型 + confidence + 姓名/职位要点 |
| `email` | `value` |
| `email_status` | 见下表 |
| `confidence` | Hunter confidence（null→0） |
| `sources` | 返回中的 sources（≥1） |
| `provider` | `"hunter"` |

| Hunter `verification.status` | `email_status` |
|------------------------------|----------------|
| `valid` | `hunter_valid` |
| `accept_all` | `hunter_accept_all` |
| `invalid` / `disposable` | `hunter_invalid` |
| `null` / 缺失 | `hunter_unverified` |
| 其他 | `hunter_unknown` |

### Step 5：排序并全量写回

1. 排序：personal > generic → confidence 降序 → 有职位/角色优先 → 有姓名优先。
2. 调用 `leads_patch_scored({ product_id, lead_id, people: 全部按序, sync_valid_to_contacts: false })`。
3. **必须全量写入**，不要截断。

### Step 6：可选验邮

仅当 `verify_emails === true`：

1. 对 **people 中每一条** 调用 `hunter-api.email_verifier({ email })`。
   - `pending: true` → 将该人写为 `hunter_unknown`，继续下一条
   - `HUNTER_CLAIMED_EMAIL` → 标 `hunter_invalid` 或跳过
   - 配额类错误 → **停止**剩余验证；已有结果仍 patch
2. 再次 `leads_patch_scored`，且 **`sync_valid_to_contacts: true`**（工具会把 `hunter_valid` + personal + confidence≥70 的邮箱追加进 `contacts`）。

### Step 7：汇报

简短中文：域名、`people` 条数、是否验邮、代表邮箱摘要；若有配额/鉴权错误一并说明。

## 主要 MCP 工具

- `hunter-api.domain_search` / `email_verifier`
- `lead-store.leads_get_scored` / `leads_patch_scored`
