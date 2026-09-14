# Hunter API v2 参考（FTCS 联系人 Enrichment）

> **用途**：US-C 联系人 Enrichment 集成（BYOK 扩展，非核心路径）  
> **在线原文**：[Hunter API v2](https://hunter.io/api-documentation/v2) · [Help Center — Hunter API](https://help.hunter.io/en/articles/1970956-hunter-api) · [agents.md](https://hunter.io/agents.md)  
> **FTCS 需求**：[20-需求-联系人Enrichment.md](../../20-需求-联系人Enrichment.md) · [US-C-决策-Hunter-MVP.md](../../research/US-C-决策-Hunter-MVP.md)  
> **整理日期**：2026-09-08（以 Hunter 在线文档为准，发版/计费争议时核对官网）

---

## 1. 概述

Hunter 提供 JSON REST API，用于按域名/公司查找邮箱、验证可达性，以及管理 Leads、Companies、Sequences 等资源。

**FTCS MVP 仅用以下端点**（用户自备 API Key，桌面 MCP 直连 `api.hunter.io`）：

| 优先级 | 端点 | FTCS MCP 工具 | 说明 |
|--------|------|---------------|------|
| **MVP** | `GET /v2/domain-search` | `domain_search` | 按线索域名拉取邮箱 + 姓名 + 职位 + sources |
| **MVP 可选** | `GET /v2/email-verifier` | `email_verifier` | 对候选人再验（开启后逐条） |
| **MVP 可选** | `GET /v2/account` | `account_info` | 余额/配额提示（免费，不扣 credit） |
| **不做** | `GET /v2/email-finder` | — | 需已有姓名；Domain Search 已覆盖 |
| **不做** | Discover / Multi-Domain Search / Enrichment / Sequences / Leads CRUD | — | 非 Enrichment MVP 范围 |

**Base URL**：`https://api.hunter.io/v2`

**响应结构**（成功）：

```json
{
  "data": { },
  "meta": { }
}
```

**响应结构**（失败）：

```json
{
  "errors": [
    {
      "id": "wrong_params",
      "code": 400,
      "details": "You are missing the domain parameter"
    }
  ]
}
```

---

## 2. 认证

每个请求必须携带 API Key，否则返回 `401 Unauthorized`。

| 方式 | 示例 |
|------|------|
| Query 参数 | `?api_key=YOUR_API_KEY` |
| Header | `X-API-KEY: YOUR_API_KEY` |
| Header（Bearer） | `Authorization: Bearer YOUR_API_KEY` |

- Key 在 [Hunter Dashboard → API](https://hunter.io/api-keys) 创建；可创建多个 Key 分用途。
- **FTCS**：Key 存 userData / `.env`（`HUNTER_API_KEY`），由 `hunter-api` MCP 封装，**不出现在 Skill 明文**。
- **测试 Key**：`test-api-key` — 校验参数但返回固定 dummy 响应；适用于 Domain Search、Email Finder、Email Verifier 的 plumbing 测试。

---

## 3. Credit 与配额

（来源：[Help Center — Hunter API](https://help.hunter.io/en/articles/1970956-hunter-api)，All-in-one / 统一 credits 计划）

| 端点 | Credit 消耗 | 备注 |
|------|-------------|------|
| **Domain Search** | **1 credit / 每域名 1～10 个邮箱** | 至少返回 1 条结果才计一次查询；无结果仍可能计 call（见官方说明） |
| **Email Verifier** | **0.5 credit / 次** | 异步 202 期间重复 poll 只计 1 次 |
| **Email Finder** | 1 credit / 次（仅找到邮箱时扣） | FTCS MVP 不做 |
| Email Enrichment / Company Enrichment / Combined | 0.2 credit（满足条件时） | 不做 |
| Discover | 免费（高级 filter 视计划） | 不做 |
| Multi-Domain Search | 搜索免费；reveal 按条扣 | 不做 |
| **Account / Usage** | 免费 | Preflight 可用 |

**FTCS 单线索预算（冻结）**：

- `domain_search`：**1 次**
- `email_verifier`：开启后对本线索 **全部** 候选人逐条验证

**配额查询**：`GET /v2/account` 或 `GET /v2/usage` — `requests.credits.remaining` 或分类型 `searches` / `verifications` 的 `remaining`（视计划结构而定）。

---

## 4. 速率限制

| 端点组 | 限制 |
|--------|------|
| Domain Search、Email Finder、Enrichment | 15 req/s，500 req/min |
| **Email Verifier** | **10 req/s，300 req/min** |
| Discover | 5 req/s，50 req/min |
| Email Count | 15 req/s |

超限：`403 Forbidden`（rate limit）或 `429 Too many requests`（usage limit）。

---

## 5. 通用 HTTP 状态码

| 状态码 | 含义 | FTCS 处理建议 |
|--------|------|----------------|
| 200 | 成功 | 正常解析 `data` |
| 202 | Verifier 异步进行中 | 同 URL 轮询，仍只计 1 credit |
| 222 | Verifier SMTP 异常 | 稍后重试 |
| 400 | 参数错误 | 检查 `errors[].id` |
| 401 | Key 无效/缺失 | 引导用户更新 Key |
| 403 | 速率限制 | 退避重试 |
| 429 | 配额用尽 | 提示充值 Hunter |
| **451** | **`claimed_email`** — 邮箱持有人要求停止处理其个人数据 | **不得再处理该邮箱** |
| 5xx | Hunter 服务端错误 | 重试 + 日志 |

---

## 6. Domain Search（MVP 核心）

### 6.1 请求

```
GET https://api.hunter.io/v2/domain-search?domain={domain}&api_key={key}
```

**必填（二选一）**：

| 参数 | 说明 |
|------|------|
| `domain` | 域名，如 `decodeckusa.com`（FTCS 用线索 eTLD+1） |
| `company` | 公司名；若与 `domain` 同传，**以 domain 为准** |

**常用可选参数**：

| 参数 | 说明 |
|------|------|
| `limit` | 每页条数，默认 10，最大 100 |
| `offset` | 分页偏移，默认 0 |
| `type` | `personal` \| `generic` |
| `seniority` | `junior` \| `senior` \| `executive`（可逗号多选） |
| `department` | 如 `sales`、`procurement`、`management` 等（可逗号多选） |
| `decision_maker` | `true` \| `false` — 仅决策人 / 非决策人 |
| `verification_status` | `valid` \| `accept_all` \| `unknown`（可逗号多选） |
| `aggregations` | `true` — 返回 `meta.aggregations` 部门/决策人统计 |

**FTCS MVP 建议参数**：`domain={eTLD+1}&limit=10`；Agent 侧再按 `buyer_personas` 对 `position` / `department` / `seniority` 打分，**不依赖** Hunter 侧复杂 filter。

**计费说明**：返回至少 1 条结果时计一次 Domain Search；Free 计划 `limit+offset` 有额外约束（如 >10 报 `pagination_error`）。

### 6.2 响应 — `data` 域级字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `domain` | string \| null | 解析到的域名；无结果时为 `null` |
| `organization` | string \| null | 组织名 |
| `pattern` | string \| null | 邮箱命名模式，如 `{first}` |
| `accept_all` | boolean | 域是否 catch-all |
| `disposable` | boolean | 是否一次性邮箱域 |
| `webmail` | boolean | 是否 webmail 域 |
| `linked_domains` | string[] | 关联域名 |
| `emails` | array | 邮箱列表（见下） |

**无结果仍 200**：`data.domain` / `pattern` / `organization` 为 `null`，`emails` 为空，`meta.results` 为 `0`。

### 6.3 响应 — `data.emails[]` 单条

| 字段 | 说明 |
|------|------|
| `value` | 邮箱地址 |
| `type` | `personal`（具名）或 `generic`（角色邮箱如 info@） |
| `confidence` | 0–100，Hunter 置信度 |
| `first_name` / `last_name` | 名/姓 |
| `position` / `position_raw` | 职位 |
| `seniority` | `junior` \| `senior` \| `executive` |
| `department` | 部门 slug |
| `decision_maker` | boolean \| null |
| `linkedin` / `twitter` / `phone_number` | 社交/电话（常有 null） |
| `sources` | 来源 URL 列表（**FTCS 要求每人须有 sources**） |
| `verification` | `{ "date": "YYYY-MM-DD", "status": "valid" \| "accept_all" \| "unknown" }` |

**sources[]**：

| 字段 | 说明 |
|------|------|
| `domain` | 来源站域名 |
| `uri` | 完整 URL |
| `extracted_on` / `last_seen_on` | 首次/末次发现日期 |
| `still_on_page` | 是否仍在页面上 |

每条邮箱最多 20 个 sources。

### 6.4 响应 — `meta`

| 字段 | 说明 |
|------|------|
| `results` | 该域总匹配数 |
| `limit` / `offset` | 分页 |
| `params` |  echo 请求参数 |
| `aggregations` | 仅 `aggregations=true` 时：部门人数、决策人数、personal/generic 分布 |

### 6.5 Domain Search 专用错误

| errors.id | 条件 |
|-----------|------|
| `wrong_params` | 缺少 `domain` 和 `company` |
| `invalid_type` / `invalid_seniority` / `invalid_department` |  filter 值非法 |
| `pagination_error` | `limit`/`offset` 非法；Free 计划超限 |

### 6.6 示例

```bash
curl -s "https://api.hunter.io/v2/domain-search?domain=decodeckusa.com&limit=10&api_key=YOUR_KEY"
```

---

## 7. Email Verifier（MVP 可选）

### 7.1 请求

```
GET https://api.hunter.io/v2/email-verifier?email={email}&api_key={key}
```

| 参数 | 必填 | 说明 |
|------|------|------|
| `email` | ✅ | 待验证邮箱 |

**行为**：最长等待约 20 秒；超时返回 **202**，对**同一 URL 轮询**直至 200，**整次验证只计 1 次 credit**。

### 7.2 响应 — `data` 字段

| 字段 | 说明 |
|------|------|
| **`status`** | **主状态**（优先使用）：`valid` \| `invalid` \| `accept_all` \| `webmail` \| `disposable` \| `unknown` |
| `result` | **已废弃**：`deliverable` \| `undeliverable` \| `risky` — 请用 `status` |
| `score` | 可达性分数 0–100；webmail/disposable 常为 50 |
| `email` | 被验邮箱 |
| `regexp` | 是否通过格式校验 |
| `gibberish` | 是否像自动生成地址 |
| `disposable` / `webmail` | 布尔标记 |
| `mx_records` / `smtp_server` / `smtp_check` / `accept_all` / `block` | SMTP 探测细节 |
| `sources` | 若 Hunter 索引中有该邮箱的公开来源（≤20 条） |

### 7.3 Verifier 专用状态码

| 状态 | 说明 |
|------|------|
| 202 | 验证进行中，继续 poll |
| 222 | 远端 SMTP 异常，建议稍后重试 |
| 400 `wrong_params` / `invalid_email` | 参数问题 |
| 451 `claimed_email` | 不得再处理 |

### 7.4 示例

```bash
curl -s "https://api.hunter.io/v2/email-verifier?email=info@decodeckusa.com&api_key=YOUR_KEY"
```

---

## 8. Email Finder（FTCS MVP 不做，备查）

```
GET https://api.hunter.io/v2/email-finder?domain={domain}&first_name={}&last_name={}&api_key={key}
```

**必填组合**：

- 身份：`domain` \| `company` \| `linkedin_handle`（至少一个）
- 姓名：`first_name`+`last_name` \| `full_name` \| `linkedin_handle`

- **Credit**：找到邮箱才扣 1 credit；内嵌 `verification`（`valid` / `accept_all` / `unknown`）。
- **451 `claimed_email`**：同 Verifier。
- FTCS 不做原因：Domain Search 已返回具名邮箱；Finder 需预先知道姓名，与「按域补全联系人」主路径重复。

---

## 9. Account Information（Preflight / 余额）

```
GET https://api.hunter.io/v2/account?api_key={key}
```

**免费**，不消耗 credit。

**`data` 常用字段**：

| 字段 | 说明 |
|------|------|
| `plan_name` / `plan_level` | 计划名称与等级 |
| `reset_date` | 本周期重置日 |
| `requests.credits` | 统一 credits 桶：`used` / `available` / **`remaining`** |
| `requests.searches` / `requests.verifications` | 分类型配额（非统一 credits 计划） |

另：`GET /v2/usage` — 当前周期剩余请求；`GET /v2/usage-history` — 审计历史（免费）。

---

## 10. FTCS 字段映射

### 10.1 Hunter → `people[]`

| Hunter（Domain Search `emails[]`） | FTCS `people[]` |
|-----------------------------------|-----------------|
| `value` | `email` |
| `first_name` / `last_name` | 同名字段 |
| `position` | `title` 或 `position`（实现时与 Schema 对齐） |
| `type === "personal"` | 优先入选；`generic` 降权 |
| `verification.status` | 见下表 → `email_status` |
| `sources` | `sources[]`（必填，用于 UI 溯源） |
| — | `provider: "hunter"` |
| — | `match_reason`（Agent 按 persona 打分后填写） |

### 10.2 `verification.status` / Verifier `status` → `email_status`

| FTCS `email_status` | Hunter 条件 | 默认收件人 |
|---------------------|-------------|------------|
| `hunter_valid` | `valid` | ✅ |
| `hunter_accept_all` | `accept_all` 或域级 `accept_all: true` | ⚠️ 黄标，非首选 |
| `hunter_invalid` | `invalid` / `disposable` | ❌ |
| `hunter_unknown` | `unknown`、未验、或 Verifier 202 未决 | ❌ |

Verifier 的 `webmail`：按产品决策可映射为 `hunter_unknown` 或单独展示（MVP 建议 **unknown**，不默认作 B2B 首选）。

### 10.3 MCP 工具 ↔ REST

| MCP 工具 | HTTP | 主要入参 | 主要出参 |
|----------|------|----------|----------|
| `domain_search` | `GET /v2/domain-search` | `domain`, `limit?`, `offset?` | `emails[]`, `organization`, `meta.results` |
| `email_verifier` | `GET /v2/email-verifier` | `email` | `status`, `score`, `sources?` |
| `account_info` | `GET /v2/account` | — | `requests.*.remaining`, `plan_name`, `reset_date` |

实现路径：`workspace/mcp-servers/hunter-api/`（对齐 `places-api` BYOK 模式）。

---

## 11. 其他 API（FTCS 不集成，索引备查）

Hunter 还提供完整 CRM/触达能力，**Enrichment MVP 不调用**：

| 类别 | 代表端点 | 说明 |
|------|----------|------|
| 发现 | `POST /v2/discover` | 按条件找公司 |
| 批量 | `POST /v2/multi-domain-search` + `/reveal` | 跨公司搜邮箱后按 handle 解锁 |
|  enrichment | `/v2/people/find`, `/v2/companies/find`, `/v2/combined/find` | 反向丰富 |
| 计数 | `GET /v2/email-count` | 域下邮箱数量（免费） |
| Leads / Companies | CRUD + lists + tags | Hunter 站内 CRM |
| Sequences | `/v2/sequences`, `/v2/campaigns` | 邮件序列触达 |
| 集成 | Webhooks、Connected Apps | 第三方同步 |

官方另有 [MCP Server](https://mcp.hunter.io)（Hunter 托管）；FTCS 采用**自研 `hunter-api` MCP** 以便与桌面 BYOK、Preflight、Schema 写回一致。

---

## 12. 合规与产品约束（FTCS）

- **BYOK**：用户 Key 直连 Hunter；FTCS **不**代调、不共享平台 Key（见 [US-C-决策-Hunter-MVP.md](../../research/US-C-决策-Hunter-MVP.md)）。
- **非核心（C0）**：无 Hunter Key 时，画像 / 探索 / 开发信主路径不受影响。
- **ToS**：[Hunter Terms of Service](https://hunter.io/terms-of-service)；不存整页简历；用户可删单条 person。
- **451 / claimed_email**：遇到即停止处理该邮箱，UI 勿 retry。
- **GDPR**：个人数据由用户自己的 Hunter 账户处理；FTCS 仅作集成扩展。

---

## 13. 测试清单（US-C-00 Spike）

1. 用 `test-api-key` 验证 MCP/HTTP plumbing。
2. **至少 2 条真实线索**用真实 Key 调 `domain-search`。
3. 记录：`meta.results`、personal 人数、`verification.status` 分布、空域比例、credit 消耗。
4. 可选：对 top 1～3 邮箱调 `email-verifier`，对比 Domain Search 内嵌 `verification`。
5. 产出：[联系人Enrichment-Hunter-spike.md](../../research/联系人Enrichment-Hunter-spike.md)（待建）。

**Spike 示例域**：

```bash
# plumbing
curl -s "https://api.hunter.io/v2/domain-search?domain=intercom.com&api_key=test-api-key"

# 真实线索（替换 YOUR_KEY）
curl -s "https://api.hunter.io/v2/domain-search?domain=decodeckusa.com&limit=10&api_key=YOUR_KEY"
curl -s "https://api.hunter.io/v2/account?api_key=YOUR_KEY"
```

---

## 14. 维护

- 计费与 credits 规则以 [Help Center](https://help.hunter.io/en/articles/1970956-hunter-api) 为准；2025 年 7 月起统一 credits 桶，旧计划可能仍显示 `searches` / `verifications` 分项。
- API 变更时核对 [v2 文档](https://hunter.io/api-documentation/v2) 与 [agents.md](https://hunter.io/agents.md)。
- FTCS 行为变更同步 [20-需求-联系人Enrichment.md](../../20-需求-联系人Enrichment.md) §6。
