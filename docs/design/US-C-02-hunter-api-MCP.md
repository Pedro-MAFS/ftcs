# US-C-02 详细设计：hunter-api MCP

> **用户故事**：作为系统，我需要一个自研 `hunter-api` MCP，把 Hunter REST API 封装成 Agent 可调的工具（`domain_search` / `email_verifier` / `account_info`），Key 由用户自备（BYOK），供 `enrich-lead-contacts` Skill（US-C-03）调用。  
> **范围**：`workspace/mcp-servers/hunter-api/` 新包；opencode.json 登记；runtime.ts 最小 env 接线；打包脚本登记。  
> **关联**：[20-需求-联系人Enrichment.md](../20-需求-联系人Enrichment.md) §6.2；[US-C-01 详设](US-C-01-people-schema与leads-patch-scored.md)；[Hunter API 参考（离线）](../reference/hunter-api/README.md)；对齐 `places-api` BYOK 模式

---

## 1. 设计目标与边界

| 项 | 内容 |
|----|------|
| **做什么** | 本地 stdio MCP，直连 `https://api.hunter.io/v2`，封装 3 个工具 |
| **不做什么** | 不设官方网关代调（合规 C3）；不接 Hunter 托管 MCP（`mcp.hunter.io`）；不做 LinkedIn/爬虫 |
| **Key 链路** | 用户 → 设置页（US-C-03，支持**多 Key**）→ `.env` `HUNTER_API_KEYS`（逗号分隔，兼容单 Key `HUNTER_API_KEY`）→ `runtime.ts` 注入 MCP 子进程 env → MCP 读 `process.env` |
| **多 Key 策略** | **Key 池 + failover**：按配置顺序用 Key；遇 429 标记 exhausted（记 `reset_date`）、遇 401 标记 invalid，自动切下一个；全部不可用才报错。详见 §3.0 |
| **与 US-C-03 边界** | 本故事交付「MCP 可被 Agent 调用」；设置页 UI、Preflight 探测、「补全联系人」按钮属 US-C-03 |

**为什么自研而不复用 Hunter 托管 MCP**（agents.md 那条）：桌面端要求 Key 存 userData、Preflight 可控、Schema 写回一致；托管 MCP 面向 Cursor/Claude 等通用客户端，不参与 FTCS 的 BYOK 与错误引导体系。

---

## 2. 包结构

```
workspace/mcp-servers/hunter-api/
├── package.json            # @ftcs/hunter-api 0.1.0
├── tsconfig.json           # 对齐 lead-store
├── README.md
└── src/
    ├── index.ts            # MCP 入口，注册 3 个工具，统一错误格式
    ├── client.ts           # REST 客户端：header 认证、错误映射、Verifier 202 轮询
    ├── types.ts            # Hunter 响应 zod Schema（裁剪版）
    ├── provider.ts         # getHunterApiKeys()（对齐 places-api/provider.ts，返回 Key 数组）
    ├── key-pool.ts         # 多 Key 状态管理与 failover 选择（§3.0）
    ├── cache.ts            # domain_search 结果缓存（data/cache/hunter/）
    ├── paths.ts            # findProjectRoot()（复用 lead-store 模式）
    ├── client.test.ts      # mock fetch：错误映射 / 202 轮询 / 451
    └── fixtures.ts         # pantron.com 真实响应（2026-09-14 实测）作测试夹具
```

**依赖**：`@modelcontextprotocol/sdk`、`zod`。**不引入** undici / socks-proxy-agent（见 §8 风险：MVP 不支持代理，用全局 `fetch`，打包无需 bundled node_modules，比 places-api 简单）。

---

## 3. 工具定义

统一错误格式（对齐 [06-MCP工具规范.md](../06-MCP工具规范.md) §10.2）：`{ error: true, code, message, http_status? }`。

### 3.0 多 Key 池与 failover

**背景**：Hunter 额度为**账号级**——同账号多 Key 共享额度，只有不同账号的 Key 才能叠加。支持多 Key 的实际语义是「配置多个账号的 Key，一个用尽自动切下一个」。合规提示：用户应配置本人/团队合法持有的 Key；批量注册免费账号刷额度违反 [Hunter ToS](https://hunter.io/terms-of-service)，文档与设置页均不引导该用法。

**配置**：

- `.env` 新增 `HUNTER_API_KEYS=key1,key2,key3`（逗号分隔，顺序即优先级）。
- 兼容存量 `HUNTER_API_KEY`（单 Key）：两者并存时合并，`HUNTER_API_KEYS` 在前。
- `provider.ts` 导出 `getHunterApiKeys(): string[]`（去空白、去重）。

**选择策略：failover + 状态记忆**（不用「每次先调 account_info 选 Key」——happy path 零额外请求）：

1. 请求时按顺序取第一个 `status !== exhausted && status !== invalid` 的 Key。
2. 响应 429 → 该 Key 标记 `exhausted`，记录 `reset_date`（从错误响应或 account_info 补充），**自动用下一个 Key 重试本请求**。
3. 响应 401 → 该 Key 标记 `invalid`（永久，直到用户改配置），自动切下一个重试。
4. 其他错误（5xx/网络）→ **不**标记、不切换，直接报错（不是 Key 的问题）。
5. Verifier 的 202 轮询**固定用发起时的 Key**（credit 记在它头上）。

**状态持久化**：`data/cache/hunter/key-pool.json`，重启后记住 exhausted/invalid：

```json
{
  "keys": {
    "sha256(key)前12位": {
      "status": "exhausted",
      "exhausted_until": "2026-10-14",
      "last_error_at": "2026-09-14T08:00:00Z"
    }
  }
}
```

- **只存 Key 的哈希指纹，永不落盘明文 Key**。
- `exhausted` 到 `exhausted_until` 当日后自动复位为 `ok`（Hunter 按周期重置）。
- `invalid` 需用户在设置页改 Key 后自然消失（配置变化时按哈希对不上即重置）。
- 状态文件读写异常静默降级为纯内存态，不阻断请求。

**全部不可用时的错误**：

| 情形 | code | message 要点 |
|------|------|--------------|
| 全部 exhausted | `HUNTER_ALL_KEYS_EXHAUSTED` | 列出各 Key 指纹后4位 + 最近 `reset_date`，提示充值或加 Key |
| 全部 invalid / 未配置 | `HUNTER_NO_KEY` / `HUNTER_UNAUTHORIZED` | 引导设置页检查 |

**`account_info` 增强**：多 Key 时返回数组，逐 Key 报告 `fingerprint`（后4位）/ `plan_name` / `requests.*.remaining` / 池状态（`exhausted`/`invalid`），供 US-C-03 设置页与 Preflight 展示「哪个 Key 还有多少额度」。单 Key 时结构不变（向后兼容）。

**与缓存的关系**：domain_search 缓存 Key 只含域名+参数（§5），**不含 API Key**——任一 Key 写入的结果全池共享，换 Key 不击穿缓存。

### 3.1 `domain_search`

按线索域名拉取联系人（MVP 核心，1 credit/次）。

**入参**：

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `domain` | string | 必填 | eTLD+1，zod 正则 `^([a-z0-9-]+\.)+[a-z]{2,}$` |
| `limit` | int 1–100 | 10 | 免费计划 >10 会 `pagination_error`，Skill 固定传 10 |
| `type` | `personal` \| `generic` | — | 可选过滤 |
| `department` | string | — | 可选，逗号多选，透传 Hunter |
| `seniority` | string | — | 可选，逗号多选，透传 Hunter |

**行为**：

1. 经 §3.0 Key 池取 Key；无可用 Key → `HUNTER_NO_KEY` / `HUNTER_ALL_KEYS_EXHAUSTED`。
2. 查缓存（§5）：命中 → 返回 `cached: true`，**不消耗 credit**。
3. `GET /v2/domain-search`，Header `X-API-Key`（**不放 query**，避免进日志）；429/401 按 §3.0 failover 重试。
4. 成功 → 裁剪响应（§4）→ 写缓存 → 返回。

**返回**（成功）：

```json
{
  "domain": "pantron.com",
  "organization": "Pantron Automation",
  "pattern": "{first}",
  "accept_all": true,
  "disposable": false,
  "webmail": false,
  "emails": [
    {
      "value": "steve@pantron.com",
      "type": "personal",
      "confidence": 84,
      "first_name": null,
      "last_name": null,
      "position": null,
      "seniority": null,
      "department": null,
      "decision_maker": false,
      "verification": { "date": "2026-09-14", "status": "valid" },
      "sources": [{ "domain": "kfia.org", "uri": "https://...", "extracted_on": "2026-05-19", "last_seen_on": "2026-08-07", "still_on_page": true }],
      "source_count": 1
    }
  ],
  "meta": { "results": 7 },
  "cached": false
}
```

### 3.2 `email_verifier`

对单个邮箱验投递性（0.5 credit/次）。**是否调用由 Skill 的 `verify_emails` 开关决定**（C12），MCP 本身不做配额判断。

**入参**：`email`（zod email 校验）。

**行为**：

1. `GET /v2/email-verifier?email=`，Header 认证。
2. **202 轮询**：Hunter 异步验证最长约 20s。收到 202 后每 2s 以**同一 URL** 重试，总预算 24s；期间只计 1 次 credit。超时仍未决 → 返回 `status: "unknown"` + `pending: true`（映射 `hunter_unknown`）。
3. **222**（远端 SMTP 异常）→ `HUNTER_SMTP_RETRYABLE`，message 提示稍后重试。
4. **451**（`claimed_email`）→ `HUNTER_CLAIMED_EMAIL`，message 明确「不得再处理该邮箱」。

**返回**：`status` / `score` / `email` / `regexp` / `gibberish` / `disposable` / `webmail` / `mx_records` / `smtp_server` / `smtp_check` / `accept_all` / `block` / `sources?`（透传 Hunter `data` 主要字段，zod 裁剪）。**不缓存**（用户点「验证」要的是当下结果）。

### 3.3 `account_info`

查配额（**免费**），供 US-C-03 Preflight 与 Skill 执行前估算。

**入参**：无。

**返回**：单 Key 时 —— `plan_name` / `plan_level` / `reset_date` / `requests.credits.{used,available,remaining}`（分项配额计划同时透传 `requests.searches` / `requests.verifications`）。**多 Key 时返回 `keys[]` 数组**（§3.0）：每项含 `fingerprint`（后 4 位）/ `plan_name` / `requests.*.remaining` / 池内状态，另附 `total_remaining` 汇总。

---

## 4. 响应裁剪：sources 截断

**问题**（实测）：`sales@pantron.com` 带 17 条 sources、全响应数千 token，直接进 Agent 上下文浪费窗口。

**规则**：

- 每邮箱 `sources` **最多保留 5 条**：`still_on_page: true` 优先，再按 `last_seen_on` 降序。
- 原始条数记入 `source_count`。
- Schema 要求 `sources` **至少 1 条**（对齐 US-C-01 `PersonSourceSchema`，UI 溯源依赖）；Hunter 返回空 sources 的邮箱**丢弃**并在响应 `dropped_no_sources: number` 计数。

---

## 5. 缓存（domain_search）

| 项 | 决策 |
|----|------|
| 路径 | `data/cache/hunter/domain-search/{hash}.json` |
| Key | sha256(`domain` + `limit` + `type` + `department` + `seniority`) 前 16 位（**不含 API Key**） |
| TTL | **24h**（对齐 search-api 搜索缓存） |
| 动机 | 「补全联系人」人工重点、Skill 重试时不重复扣 credit |
| 不缓存 | `email_verifier`（要新鲜结果）、`account_info`（免费且要实时余额） |
| 失败处理 | 缓存读写异常静默降级为直调，不阻断主流程 |

---

## 6. 错误映射表

| Hunter 响应 | MCP code | message 要点 |
|-------------|----------|--------------|
| 无任何 Key 配置 | `HUNTER_NO_KEY` | 引导设置页配置（US-C-03 落地后文案对齐） |
| 401（单 Key 或全部 invalid） | `HUNTER_UNAUTHORIZED` | Key 无效，引导更换；多 Key 时逐个 failover 后仍 401 才报 |
| 429（全部 exhausted） | `HUNTER_ALL_KEYS_EXHAUSTED` | 列各 Key 指纹后4位 + 最近 `reset_date`，提示充值或加 Key |
| 400 `wrong_params` / `invalid_*` | `HUNTER_INVALID_PARAMS` | 透传 `errors[].details` |
| 400 `pagination_error` | `HUNTER_PAGINATION_ERROR` | 提示免费计划 limit+offset ≤ 10 |
| 403 / 429（单 Key） | `HUNTER_RATE_LIMITED` / `HUNTER_QUOTA_EXCEEDED` | 后者提示 Hunter 充值与 `reset_date` |
| 451 `claimed_email` | `HUNTER_CLAIMED_EMAIL` | 不得再处理该邮箱，UI 禁止 retry；**不 failover**（与 Key 无关） |
| 202 轮询超时 | （非错误）返回 `status: "unknown", pending: true` | 映射 `hunter_unknown` |
| 222 | `HUNTER_SMTP_RETRYABLE` | 稍后重试 |
| 5xx / 网络异常 | `HUNTER_UPSTREAM_ERROR` | 可重试，记日志；**不**标记 Key 状态 |

**安全**：错误 message 与日志**永不**包含 Key；请求异常对象只取 `status` + `errors[].details`。

---

## 7. 接线清单（本故事内）

### 7.1 `workspace/config/opencode/opencode.json`（模板，托管目录）

```json
"hunter-api": {
  "type": "local",
  "command": ["node", "mcp-servers/hunter-api/dist/mcp.js"],
  "enabled": true,
  "environment": {
    "FTCS_WORKSPACE": "."
  }
}
```

模板不含 Key（与 places-api 一致）。

### 7.2 `desktop/electron/opencode/runtime.ts`（最小注入）

`rewriteMcpWorkspaceEnv` 增加 `hunterEnv`，并在分发表加分支：

```typescript
const hunterEnv = {
  FTCS_WORKSPACE: workspaceRoot,
  ...(process.env.HUNTER_API_KEYS
    ? { HUNTER_API_KEYS: process.env.HUNTER_API_KEYS }
    : process.env.HUNTER_API_KEY
      ? { HUNTER_API_KEY: process.env.HUNTER_API_KEY }
      : {}),
}
// name === 'hunter-api' ? hunterEnv : ...
```

无 Key 时**不注入**，MCP 返回 `HUNTER_NO_KEY` 引导——不在进程层阻断（C0：无 Key 不影响主路径）。

### 7.3 打包脚本登记

| 文件 | 改动 |
|------|------|
| `desktop/scripts/build-mcp.mjs` | `MCP_NAMES` 加 `'hunter-api'` |
| `desktop/scripts/prepare-workspace-template.mjs` | `REQUIRED_MCP` 加 `'hunter-api'`（无 bundled node_modules 段，纯 bundle） |

### 7.4 版本

- `hunter-api/package.json`：`0.1.0` 起步。
- `WORKSPACE_TEMPLATE_VERSION`：**本故事不 bump**（结构变化随 US-C-03 Skill 落地一次性发布，见 US-C-01 提交时约定）。`mcpBundleNeedsSync` 对 hunter-api 的路径：用户区无此包 → `needsManagedSync` 的「关键资产缺失」检查只遍历**已存在**的 `mcp-servers/*`，不会主动发现新包——**这正是要靠 US-C-03 bump 模板版本触发整目录重同步来解决**，本文档记录该依赖。

---

## 8. 风险与对策

| 风险 | 等级 | 对策 |
|------|------|------|
| `api.hunter.io` 在部分用户网络不可达 | 中 | MVP 全局 `fetch`；US-C-03 Preflight 连通性探测会暴露；确需时按 places-api `fetch.ts` 模式补代理（届时加 undici + bundled node_modules 接线） |
| 多 Key 误解为「同账号多 Key 叠加额度」 | 中 | 设置页与文档写明：**额度是账号级**，同账号多 Key 共享池；多 Key 仅对多账号有意义 |
| 多 Key 被用于绕过免费额度（批量小号） | 中 | 产品不引导该用法；设置页文案注明「配置您合法持有的 Key」；ToS 责任在用户（BYOK） |
| 免费计划 limit>10 报 `pagination_error` | 低 | Skill 固定 `limit=10`；错误映射给明确文案 |
| 202 长轮询阻塞 Agent | 低 | 总预算 24s，超时返回 `pending` 而非死等 |
| Key 池状态文件损坏 | 低 | 读写异常静默降级为内存态；exhausted 到期自动复位 |
| 缓存陈旧（联系人离职） | 低 | TTL 24h；sources 展示 `last_seen_on` 供用户判断 |
| Key 泄露 | 高 | Header 传递；key-pool.json 只存哈希指纹；不写缓存 key/日志；`.env` 在 `SKIP_FILE_NAMES` 不进模板 |

---

## 9. 测试清单

### 9.1 单测（mock fetch，不碰真实 API）

| 用例 | 预期 |
|------|------|
| 无 Key 调 `domain_search` | `HUNTER_NO_KEY`，不发请求 |
| 401 响应 | 映射 `HUNTER_UNAUTHORIZED` |
| 429 响应（单 Key） | 映射 `HUNTER_QUOTA_EXCEEDED`，message 含 `reset_date` 提示 |
| 多 Key：key1 429 → key2 200 | failover 成功返回数据；key1 标记 exhausted 且后续请求直接用 key2 |
| 多 Key：key1 401 → key2 200 | key1 标记 invalid；failover 成功 |
| 多 Key：全部 429 | `HUNTER_ALL_KEYS_EXHAUSTED`，message 含各指纹后4位与 reset_date |
| Key 池状态持久化 | 写盘只含哈希指纹；重启后 exhausted 状态仍在；到期自动复位 |
| 5xx/网络错误 | 不标记 Key、不 failover，报 `HUNTER_UPSTREAM_ERROR` |
| 451 响应 | 映射 `HUNTER_CLAIMED_EMAIL`，不 failover |
| Verifier 202 → 第 2 次 poll 返回 200 | 轮询 2 次后返回 `status: "valid"`，全程同一 Key |
| Verifier 202 超预算 | 返回 `pending: true` |
| pantron 夹具 → 裁剪 | sources ≤5、`still_on_page` 优先、`source_count` 正确、无 sources 邮箱计入 `dropped_no_sources` |
| 同参数二次 `domain_search` | 第二次 `cached: true`，fetch 只调 1 次；换 Key 不击穿缓存 |
| 缓存 TTL 过期 | 重新发请求 |

### 9.2 Smoke（真实 API，手工执行，不进 CI）

```bash
# plumbing（不耗 credit）
HUNTER_API_KEY=test-api-key node dist/mcp.js   # domain_search domain=intercom.com

# 真实 Key（耗 1 credit）
HUNTER_API_KEY=<真实> domain_search domain=pantron.com → 7 条
HUNTER_API_KEY=<真实> account_info → remaining 减少核对
```

---

## 10. 验收标准

- [ ] `workspace/mcp-servers/hunter-api/` 三个工具注册，统一错误格式。
- [ ] 支持 `HUNTER_API_KEYS` 多 Key + 兼容 `HUNTER_API_KEY`；429/401 自动 failover；状态持久化只存哈希指纹。
- [ ] 全部 Key 用尽返回 `HUNTER_ALL_KEYS_EXHAUSTED`（含 reset_date）；全部无效返回 `HUNTER_UNAUTHORIZED`。
- [ ] Key 仅经 `X-API-Key` Header；无 Key 返回 `HUNTER_NO_KEY` 引导文案。
- [ ] `domain_search` 裁剪 sources（≤5、still_on_page 优先）、24h 缓存生效且跨 Key 共享。
- [ ] `email_verifier` 202 轮询（2s×≤12、同一 Key）、222/451 分别映射。
- [ ] `account_info` 多 Key 返回 `keys[]` 逐 Key 配额与池状态。
- [ ] opencode.json 模板 + runtime.ts + 两个打包脚本完成登记。
- [ ] 单测全绿；`test-api-key` smoke 通过；真实 Key 调 `pantron.com` 与今日实测数据一致。
- [ ] 单测覆盖率达到与 lead-store 相当水平（核心路径全覆盖）。

---

## 11. 变更记录

| 日期 | 说明 |
|------|------|
| 2026-09-14 | 初稿：3 工具 + sources 裁剪 + 24h 缓存 + 202 轮询；对齐 places-api BYOK 接线；模板版本 bump 留 US-C-03 |
| 2026-09-14 | **修订**：支持多 Key 池（`HUNTER_API_KEYS`）+ 429/401 failover + 状态持久化（哈希指纹）；`account_info` 多 Key 逐条报告；新增 `HUNTER_ALL_KEYS_EXHAUSTED`；明确同账号多 Key 共享额度的合规提示 |
