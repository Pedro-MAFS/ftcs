# US-HC-07 详细设计：官方通道失败时给出可理解提示

> **需求**：[../42-需求-官方通道网关代调Hunter-客户端.md](../42-需求-官方通道网关代调Hunter-客户端.md) · **US-HC-07** · Related [#156](https://github.com/Pedro-MAFS/ftcs/issues/156)  
> **状态**：**可按联调草案实现映射。** 完整表在 [契约附录](US-HC-网关代调契约草案.md) §4。搜索的 402 不用于 Hunter。不关 #156。  
> **范围**：官方通道查找与验邮失败时的用户提示，以及它们指向的现有入口。  
> **依赖**：[US-HC-01](US-HC-01-官方通道免配Key查找联系人.md)。抽屉失败句由 [US-HC-03](US-HC-03-抽屉单条验证跟随通道.md) 显示到 `saveMessage`。
> **不做**：桌面自建扣费账本；把上游 HTTP 细节展示给最终用户；自定义通道改口。  
> **索引**：[US-HC-官方通道网关代调Hunter.md](US-HC-官方通道网关代调Hunter.md)

---

## 1. 对应需求

官方余额不足时，提示指向现有官方通道的余额 / 充值入口，不提示去 Hunter 充值。官方凭证不可用时，提示指向登录、开通或检查官方通道，不提示更换 Hunter Key。两类提示都不得再直连 `api.hunter.io`。自定义通道的 Key 无效、额度用尽，仍按现网指向用户自己的 Hunter Key / Hunter 额度。

## 2. 模块与界面

只复用已经在设置 → 模型通道里的官方入口，不在 Hunter 区块新做账本：

| 用户要去的地方 | 现网 |
|----------------|------|
| 看余额 | `SettingsView.vue` 账户用量，`balanceDisplay`。刷新按钮调用 `refreshOfficialUsageQuiet` → `refreshOfficialUsage` → `gateway-client.ts` 的 `getUsageMe`（已有的 `GET {base}/usage/me`，只查官方余额，不是 Hunter 代调） |
| 充值 | 同卡片按钮「充值」：`openOfficialRecharge` → `official-channel-service.ts` 的 `openOfficialRecharge`。设计见 [US-G3-04](US-G3-04-客户端跳转充值入口设计.md) |
| 登录 / 开通 | 同页「去登录」「开通官方通道」（`onAuthLogin`、`onProvisionOfficial`） |

预检阶段的凭证不可用已经由 US-HC-06 挡住。本故事处理代调发出之后的响应。用户可见的中文如下，不附带 URL、HTTP 数字或 `error.code` / `reason` 原文：

| 结果 | 句子 |
|------|------|
| 429 `reason=insufficient_quota` | 「官方通道余额不足。请到设置 → 模型通道查看余额并充值。」 |
| 401 的三个 `reason`，以及 403 `key_disabled` / `account_disabled` | 「官方通道凭证不可用。请到设置 → 模型通道登录、开通或检查官方通道。」 |
| 503 `hunter_upstream_unavailable`、`hunter_pricing_unavailable`，以及 `reason=missing_gateway_key_pepper` | 「补全联系人暂时不可用，请稍后再试。」不引导换 Hunter Key，也不引导充值 |
| 503 `hunter_rate_limited` | 「请求过于频繁，请稍后重试。」这不是余额不足 |
| 504 `hunter_verification_pending` | 「验证尚未完成，请稍后再次验证。」 |
| 502 `hunter_upstream_error` | 「补全联系人暂时失败，请稍后重试。」与 504 分开 |
| 400 `pagination_error` | 「当前查找范围超出限制。」不当余额不足 |
| 451 `hunter_claimed_email` | 停止该邮箱。同一次任务不自动重试 |
| 非 JSON、未知 code、500 `internal_error`、其他 400 | 「补全联系人暂时失败，请稍后重试。」 |

解析顺序：JSON 里有 `error.code` 用业务表；否则有 `reason` 用框架表；否则通用失败。`error.message` 是短码，不直接展示。

搜索 `mapGatewayFailure` 的 402 仍只属于搜索。Hunter 官方余额只认 429 `insufficient_quota`。

## 3. 数据与状态

失败不写 `people[]`，不把半截验邮状态写成 `hunter_valid`。查找尚无结果时保持现网空态。验邮中途失败时，技能现规则是停止剩余验证，已有结果仍 patch；官方沿用这句，已写入的人保持原状态，不额外改枚举。

不新增本地扣费计数。官方搜索的 `incrementSearchUsage` 在网关模式本来就不走；Hunter 也不做一套本地 credit 计数。

## 4. 代码衔接与调用链

```text
官方 domainSearch / verifyEmail / verifyPersonEmail 的代调失败
  → 先认 error.code，再认 reason，最后认非 JSON
  → MCP：errorPayload 的 message 用上表中文
  → 技能与 buildEnrichLeadContactsPrompt：转述 message，不自动再调工具
  → 抽屉：同一中文写入 saveMessage
  → 504 与超时不把该人写成已完成终态
  → 451 停止且不自动重试；若落盘，只沿用现有 hunter_invalid，不标成可继续联系的成功态
```

`buildEnrichLeadContactsPrompt` 今天要求模型在 `HUNTER_QUOTA_EXCEEDED` / `HUNTER_ALL_KEYS_EXHAUSTED` 时停止并说明。这两句只留在自定义通道。官方提示改为：按工具返回的中文说明停止，不要改写成「配置 Hunter API Key」或「到 Hunter 充值」。技能 `SKILL.md` Step 3 的 `HUNTER_NO_KEY` 引导同样只描述自定义通道；官方工具不应再返回 `HUNTER_NO_KEY`。

映射函数与 US-HC-01 的代调放在一起。判断用附录里的 `error.code` 与 `reason`，不要写 `status === 402`。

任何失败分支都不调用 `requestWithFailover`、`callEmailVerifier`，也不自动再 POST。超时断线走通用失败句，不假定未计费。

自定义通道保持 `HunterClient.mapHttpError`、`allKeysUnavailableError` 和抽屉里「Key 无效」「Hunter 额度不足，请到 Hunter 账户充值」。

## 5. 验收与回归

实现后用桩返回下列响应。本详设 PR 未执行。附件示例不能代替这些桩。

- [ ] 429 且 `reason` 为 `insufficient_quota`：余额/充值句。没有 Hunter 充值，也没有单价。不是搜索那套 402。
- [ ] 401 的 `missing_authorization` / `invalid_authorization` / `invalid_api_key`，以及 403 的 `key_disabled` / `account_disabled`：官方通道登录或开通句，不提更换 Hunter Key。
- [ ] 503 `hunter_upstream_unavailable` 与 `hunter_pricing_unavailable`：服务暂不可用，不提充值或 Hunter Key。
- [ ] 非 JSON 正文：通用失败句。
- [ ] 504 与 502 的句子不同。451 之后同一次任务没有第二下请求。
- [ ] 上述失败都没有发往 `api.hunter.io`。
- [ ] 自定义 Key 无效、额度用尽：仍是现网 Hunter 文案。

## 6. 依赖与未决

| 项 | 说明 |
|----|------|
| 草案 | 错误表可实现。联调若改 code，只改映射函数 |
| 生产 | 真实 401/429 响应还没在本仓打过。桩测不能代替结算联调 |
| 余额入口 | 已落地。见 [US-G1-03](US-G1-03-设置页余额用量展示设计.md)、[US-G3-04](US-G3-04-客户端跳转充值入口设计.md) |

---

## 修订记录

| 日期 | 说明 |
|------|------|
| 2026-11-16 | 初稿。只定两类用户结果和现有入口。错误体留空。Related #156。 |
| 2026-11-16 | 按草案写入双格式错误体。官方余额定为 429 `insufficient_quota`。 |
