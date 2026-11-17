# US-HC 附录：官方通道 Hunter 代调契约（联调草案）

> **来源**：2026-11-16 用户提供的《Hunter 官方通道网关对接文档》。本文只摘客户端要实现的部分。  
> **状态**：联调草案，以当时网关实现为依据。真实 Hunter、客户端和结算联调还没做完，接口可能再改。附件里的 JSON 是示意，不是实测样本。  
> **没有写入本文的内容**：联调环境地址、价目、测试账号，以及附件里点名、但没有随附件提供的网关需求/设计文件。本仓不新建 `token-gateway/`，也不编这些地址。  
> **索引**：[US-HC-官方通道网关代调Hunter.md](US-HC-官方通道网关代调Hunter.md) · Related [#156](https://github.com/Pedro-MAFS/ftcs/issues/156)

按本附录可以写客户端。网关要先部署该功能、打开 `HUNTER_ENABLED`、配好服务端 Hunter Key，并给 `hunter.domain_search` 与 `hunter.email_verifier` 各自配上有效价目。缺价目时该接口按草案返回 503 `hunter_pricing_unavailable`。这些没就绪时，客户端代码可以合入，不能当成生产已打通。

## 1. 地址与鉴权

`getTokenGatewayBaseUrl` / 搜索侧 `getGatewayBaseUrl` 的默认值已是 `https://token.ai-utills.com/v1`，并且只去掉末尾 `/`。官方 Hunter 的 URL 是：

| 操作 | 拼法 |
|------|------|
| 查找 | `` `${base}/hunter/domain-search` `` |
| 验邮 | `` `${base}/hunter/email-verifier` `` |

不要再接 `/v1`。`base` 已含 `/v1` 时，`/v1/hunter/...` 会变成 `/v1/v1/hunter/...`。

```http
POST {base}/hunter/domain-search
Authorization: Bearer <FTCS_GATEWAY_API_KEY 的原文>
Content-Type: application/json
Accept: application/json
```

头与 `searchViaGateway` 一样，只加 `Bearer `，不要给已经是 `sk-` 的凭证再加一层前缀。正文和头都不放用户 Hunter Key，也不放 `api_key`。官方失败后不改打 `https://api.hunter.io`。

`X-Request-Id` 只用于排查：1–64 字符，仅字母、数字、`.`、`_`、`-`；不合法时网关会另生成。每次出站若要带，当场新生成。它不是幂等键，重试不得靠复用它去重。不要把凭证、邮箱或域名写进这个 ID。官方路径不做自动重试，因此正常只有一次请求。

## 2. 查找

工具入参是 `domain_search({ domain, limit?, type?, department?, seniority?, offset? })`。传哪些由智能体决定（US-HC-08）。客户端可传 `limit`（1–100）、`type` / `department` / `seniority`、`offset`。省略的字段不传，也不要传 `null`。

客户端代码不按 `meta.results` 自动翻页。只在技能或智能体再次调用工具并传入新的 `offset` 时，才再请求一页。网关不代翻页。非空页按次计费（见 §5）。`job_titles` 本期不传。

下列旧句作废，不要再按它们实现：工具不加 `offset`；技能仍只发 `limit: 10`（含常量 `DOMAIN_SEARCH_LIMIT`）；本产品固定 10。

正文只允许下表这些字段。不要传 `company`、`job_titles`、`api_key` 或用户 Hunter Key：

| 字段 | 规则 |
|------|------|
| `domain` | 必填。传域名，不传 URL 或邮箱。网关再转小写 |
| `limit` | 可选。整数 1–100。调用方传入才写入正文。超出 1–100 由工具拒绝，不要截成 10。省略则不传该字段，不传 `null`，客户端不代填 10、25、30 或 50。网关在字段缺席时的缺省不是客户端固定值 |
| `offset` | 可选。非负整数。调用方传入才写入正文，包含传入的 0。省略则不传该字段，不传 `null`。网关在字段缺席时视为 0，并且不代翻页 |
| `type` | 仅 `personal` 或 `generic`。省略则不传，不默认 `personal` |
| `department`、`seniority` | 非空字符串，多值逗号分隔；合法值由上游校验。省略则不传 |

HTTP 200 的体是 `{ data, meta }`。客户端继续用现有 `HunterDomainSearchResponseSchema` 做校验，并容忍额外字段（现有 zod 对象默认丢掉未知键）。`meta.results` 缺失时，沿用 `parsed.meta?.results ?? parsed.data.emails.length`。`meta.results_approximate` 可以出现，不参与写回。校验通过后仍走 `trimDomainSearch` 再 `writeDomainSearchCache`。

`data.emails` 为 `[]` 仍是 200。技能按现网空态说明，不编造邮箱。计费看上游本页 `emails` 是否非空，不看裁剪掉无 `sources` 的条目之后还剩几条。`pagination_error` 是 400 `hunter_invalid_request` 的 `detail`，不是余额不足。

## 3. 验邮

一次 `POST {base}/hunter/email-verifier`，正文只有 `{ "email" }`。工具入参仍是 `email_verifier({ email })`。网关自己对上游 202 约每 2 秒轮询，预算从首次出站起 60 秒。客户端不再发 202，也不要复用自定义通道的 `VERIFIER_POLL_INTERVAL_MS`（2 秒）和 `VERIFIER_POLL_BUDGET_MS`（24 秒）。

官方这条 `fetch` 的超时设为 **90 秒**（大于 60 秒，并留下网络余量）。实现时核对这几层，避免先被更短的超时切断：

| 层 | 现网 | 官方验邮 |
|----|------|----------|
| `createOpencode({ timeout: 60_000 })` | 只限制 OpenCode 进程拉起 | 不要拿它当验邮 HTTP 超时 |
| `opencode.json` 的 `hunter-api` | 没有 `timeout`。`lead-store` 的 10 分钟只写在那个服务上 | 给 `hunter-api` 显式超时，且不小于 90 秒 |
| `taskTimeout` 的 `enrich-lead-contacts` | 15 分钟 × `min(目标条数, 10)` | 一条线索最多约 10 封、每封都打满预算时，整段任务可能先被掐断。不要把这段改成 60 秒。掐断时该次结果未知 |
| 抽屉 `callEmailVerifier` | 直连且无超时 | 官方分支单独 90 秒。自定义直连保持现状 |

HTTP 200 表示上游已是终态。`data.status` 可能为 `valid`、`invalid`、`accept_all`、`webmail`、`disposable`、`unknown`。`unknown` 也是终态，按一次验证计费。写回用 `mapHunterVerifierStatus`：`unknown` → `hunter_unknown`，`webmail` → `hunter_invalid`。返回给技能时 `pending` 必须为 false。不要把 `unknown` 当成自定义轮询里的 `pending: true`。

504 `hunter_verification_pending` 是轮询预算用尽，仍未决，与 502 `hunter_upstream_error` 不是同一种失败。504 不写 `email_status`，不返回 `pending: true`。用户稍后再验是一次新请求。

客户端或中间代理若提前断线，不能判断网关是否已经完成，也不能假定这次没计费。这种情况不自动重放。

## 4. 两种错误体

先解析 JSON。有 `error.code` 时走业务错误；有 `reason` 时走网关框架错误。两种都要认。非 JSON、或两种字段都没有，走通用失败，不引导换 Hunter Key，也不当余额不足。`error.message` 目前是短码，不要直接显示给用户。未知 `error.code` 同样走通用失败。

业务错误（`error.code`）：

| HTTP | code | 用户侧 |
|------|------|--------|
| 400 | `hunter_invalid_request` | 参数错误。`detail === "pagination_error"` 时说明查找范围超出限制，不当余额不足。其他 `detail` 不展示给用户 |
| 451 | `hunter_claimed_email` | 停止处理该邮箱，不自动重试。沿用现有「权利人要求停止处理」的含义 |
| 503 | `hunter_smtp_retryable` | 可稍后由用户再试。客户端不自动重试 |
| 503 | `hunter_rate_limited` | 上游限流，不是官方余额不足。不自动重试 |
| 503 | `hunter_upstream_unavailable` | 功能关闭、平台 Key 或上游认证/额度不可用。提示服务暂不可用，不引导换 Hunter Key 或充值 |
| 503 | `hunter_pricing_unavailable` | 价目未配置。提示服务暂不可用 |
| 502 | `hunter_upstream_error` | 上游故障或响应无效 |
| 504 | `hunter_verification_pending` | 验证尚未完成。不是余额，也不是 502 |

框架错误（`reason`）。官方余额是 **429 `insufficient_quota`**，不要用搜索的 402。

| HTTP | reason | 用户侧 |
|------|--------|--------|
| 401 | `missing_authorization`、`invalid_authorization`、`invalid_api_key` | 官方凭证不可用：去设置 → 模型通道登录、开通或检查 |
| 403 | `key_disabled`、`account_disabled` | 官方凭证或账户不可用，同一类入口 |
| 429 | `insufficient_quota` | 官方余额不足：去现有余额/充值入口 |
| 503 | `missing_gateway_key_pepper` | 服务暂不可用 |
| 400 | `invalid_body` | 请求格式错误 |
| 500 | `internal_error` | 服务暂时失败 |

Hunter 上游自己的 401/429 已由网关收成上面的 503，客户端不要再把它们当成用户的官方凭证失效或官方余额不足。

## 5. 计费与重试

草案口径（异步结算，单价不在客户端展示）：

| 结果 | 计费 |
|------|------|
| 查找 200 且本页上游 `emails` 非空 | 这一页计一次。每一页单独判断 |
| 查找 200 且本页 `emails` 为空 | 不收费 |
| 验证 200 终态，含 `unknown` | 计一次。网关内部 202 轮询不再另计 |
| 参数、鉴权、余额、价目预检失败；上游失败、无效响应、504 未决 | 不收费 |
| 本地缓存命中且没有请求网关 | 网关不收费 |

没有跨请求幂等。重复请求可能各自收费。官方客户端不自动重试、不重放。451 禁止自动重试。超时或断线时结果未知，不假定未收费，所以也不能靠「再打一次」补救。计量是 best-effort，落库失败可能漏计；客户端不自建账本。

## 6. 故事怎么用这份草案

| 故事 | 用到的契约 |
|------|------------|
| US-HC-01 | §1、§2 的单次请求不代翻页、缓存不收费、空页/非空页。条数与 `offset` 的现行口径见 US-HC-08，不再是固定 10 |
| US-HC-02 | §3 的单次 POST、`unknown` 终态、504 与 502 区分、90 秒 |
| US-HC-03 | 与 §3 同一条验邮；抽屉不复用 24 秒轮询 |
| US-HC-04 | 不用本附录。自定义仍直连 Hunter |
| US-HC-05 | §1 的凭证与「失败不回退」；不自动重试 |
| US-HC-06 | 不新增网关字段。O2/O4 已确认的界面 |
| US-HC-07 | §4 全表，外加 §5 的不重试 |
| US-HC-08 | §1、§2 的可传字段与不代翻页，§5 的非空页按次与缓存不收费 |
| US-HC-09 | 不改 §3。开关含义不在本附录。实际发起的验邮仍用 §3 |

---

## 修订记录

| 日期 | 说明 |
|------|------|
| 2026-11-16 | 按用户提供的联调草案写入客户端可执行契约。不链未提供的网关文件。Related #156。 |
| 2026-11-17 | 客户端工具开放 `offset`，可传 `limit`（1–100）与筛选。取消「工具不加 offset」「技能仍只发 limit: 10」「本产品固定 10」。Related #165。 |
