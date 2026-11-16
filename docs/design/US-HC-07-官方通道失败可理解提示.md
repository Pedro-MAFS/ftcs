# US-HC-07 详细设计：官方通道失败时给出可理解提示

> **需求**：[../42-需求-官方通道网关代调Hunter-客户端.md](../42-需求-官方通道网关代调Hunter-客户端.md) · **US-HC-07** · Related [#156](https://github.com/Pedro-MAFS/ftcs/issues/156)  
> **状态**：**不可联调、不可实现。** 网关尚未给出可区分「余额不足」和「凭证不可用」的结果。本文不写状态码、错误体字段或内部错误码。不关 #156。  
> **范围**：官方通道查找与验邮失败时，用户看到的两类提示，以及它们指向的现有入口。  
> **依赖**：[US-HC-01](US-HC-01-官方通道免配Key查找联系人.md)；网关分册写明区分方式。抽屉失败句由 [US-HC-03](US-HC-03-抽屉单条验证跟随通道.md) 显示到 `saveMessage`。  
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

预检阶段的凭证不可用已经由 US-HC-06 挡住，用户还没发出代调。本故事处理的是预检已通过、调用已经发出之后的失败：余额在预检后耗尽，或凭证随后失效。

推荐用户可见的两句（待马丰顺确认；不包含状态码）：

| 结果 | 推荐句 |
|------|--------|
| 官方余额不足 | 「官方通道余额不足。请到设置 → 模型通道查看余额并充值。」 |
| 官方凭证不可用 | 「官方通道凭证不可用。请到设置 → 模型通道登录、开通或检查官方通道。」 |

技能汇报、线索页 `actionMessage`、抽屉 `saveMessage` 使用工具或主进程返回的这句中文。不附带上游 URL、HTTP 数字或 Hunter 错误 id。

搜索里 `mapGatewayFailure` 已有 401 / 402 和「请到设置页充值后再搜索」等句子。那是 `docs/15` 与 `search-api/src/gateway.ts` 的搜索契约。**Hunter 代调不引用这些状态码。** 网关分册写出 Hunter 的区分方式之后，客户端只做一层映射：分册中的「余额不足」→ 上表第一句，「凭证不可用」→ 第二句。其他失败用一句「补全联系人暂时失败，请稍后重试」，仍然不直连、不提 Hunter Key。

## 3. 数据与状态

失败不写 `people[]`，不把半截验邮状态写成 `hunter_valid`。查找尚无结果时保持现网空态。验邮中途失败时，技能现规则是停止剩余验证，已有结果仍 patch；官方沿用这句，已写入的人保持原状态，不额外改枚举。

不新增本地扣费计数。官方搜索的 `incrementSearchUsage` 在网关模式本来就不走；Hunter 也不做一套本地 credit 计数。

## 4. 代码衔接与调用链

```text
官方 domainSearch / verifyEmail / verifyPersonEmail 的代调失败
  → 客户端映射成两类结果之一（映射表等网关分册）
  → MCP：现有 errorPayload 的 message 用上表中文
  → 技能与 buildEnrichLeadContactsPrompt：转述 message
  → 抽屉：verifyPersonEmail 的 message 用同一中文，显示在 saveMessage
```

`buildEnrichLeadContactsPrompt` 今天要求模型在 `HUNTER_QUOTA_EXCEEDED` / `HUNTER_ALL_KEYS_EXHAUSTED` 时停止并说明。这两句只留在自定义通道。官方提示改为：按工具返回的中文说明停止，不要改写成「配置 Hunter API Key」或「到 Hunter 充值」。技能 `SKILL.md` Step 3 的 `HUNTER_NO_KEY` 引导同样只描述自定义通道；官方工具不应再返回 `HUNTER_NO_KEY`。

映射实现放在代调函数旁边，与 US-HC-01 同一次落地。映射函数的输入在 O1 锁定前保持空，不写 `status === 402` 这类判断。

任何失败分支都不调用 `requestWithFailover`、`callEmailVerifier` 或 `fetch('https://api.hunter.io/...')`。

自定义通道保持 `HunterClient.mapHttpError`、`allKeysUnavailableError` 和抽屉里「Key 无效」「Hunter 额度不足，请到 Hunter 账户充值」。

## 5. 验收与回归

- [ ] 网关分册定义为余额不足的结果：用户看到设置 → 模型通道的余额 / 充值引导。句中没有 Hunter 充值，也没有单价。
- [ ] 网关分册定义为凭证不可用的结果：用户看到登录、开通或检查官方通道。句中没有更换 Hunter Key。
- [ ] 两类失败之后没有发往 `api.hunter.io` 的请求。`.env` 里的用户 Key 不被读走。
- [ ] 自定义 Key 无效、额度用尽：仍是现网 Hunter Key / Hunter 额度文案。
- [ ] 最终用户看不到上游 HTTP 细节。
- [ ] 验收用的失败样本等网关分册提供。在此之前不能用搜索的 401/402 充当 Hunter 用例。

## 6. 依赖与未决

| 项 | 说明 |
|----|------|
| O1 错误区分 | 未锁定。本故事不能发明状态码，也不能把搜索 401/402 写成 Hunter 已确认 |
| US-HC-01 | 没有代调就没有这类失败 |
| 两句推荐文案 | 待马丰顺确认。行为（去官方余额 / 去官方通道，不去 Hunter）已由需求锁定 |
| 余额与充值实现 | 已落地，本故事只指向它们。见 [US-G1-03](US-G1-03-设置页余额用量展示设计.md)、[US-G3-04](US-G3-04-客户端跳转充值入口设计.md) |

---

## 修订记录

| 日期 | 说明 |
|------|------|
| 2026-11-16 | 初稿。只定两类用户结果和现有入口。错误体留空。Related #156。 |
