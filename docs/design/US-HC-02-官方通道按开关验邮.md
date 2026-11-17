# US-HC-02 详细设计：官方通道按开关验证邮箱

> **需求**：[../42-需求-官方通道网关代调Hunter-客户端.md](../42-需求-官方通道网关代调Hunter-客户端.md) · **US-HC-02** · Related [#156](https://github.com/Pedro-MAFS/ftcs/issues/156)  
> **状态**：**可按联调草案实现。** 验邮是单次 `POST {base}/hunter/email-verifier`，见 [契约附录](US-HC-网关代调契约草案.md) §3。不关 #156。  
> **范围**：同一次「补全联系人」里，官方通道上实际发起的验邮走代调。验谁、验几封见 [US-HC-09](US-HC-09-验邮开关允许对关键人验证.md)。旧句「开关开启则对每人验邮」已被 US-HC-09 超越。  
> **依赖**：[US-HC-01](US-HC-01-官方通道免配Key查找联系人.md) 的代调查找。开关在设置里仍可见，归 [US-HC-06](US-HC-06-设置引导与预检随通道切换.md)。  
> **不做**：抽屉上再点「验证」（[US-HC-03](US-HC-03-抽屉单条验证跟随通道.md)）；修改验邮状态枚举；改自定义通道的直连验邮；在客户端轮询 202；决定验谁、验几封（US-HC-09）；改设置页标签原句（US-HC-09）。
> **索引**：[US-HC-官方通道网关代调Hunter.md](US-HC-官方通道网关代调Hunter.md)

---

## 1. 对应需求

开关默认与现网一致（未配置时为开，`parseHunterVerifyEmails`）。官方通道上实际发起的验邮经网关代调，写回现有验邮状态，用量计入官方通道。关闭时只查找，不发起验邮。验邮不使用用户 Hunter Key。开启不等于对查到的全部联系人自动验邮。本故事只验收实际发起的那几次走代调。

## 2. 模块与界面

勾选仍是 `SettingsView.vue` 的 `form.hunterVerifyEmails`，官方通道下这个勾选保留。标签原句改到 US-HC-09，推荐「允许对关键人验证邮箱」。旧句「补全联系人时验证邮箱」已被 US-HC-09 超越，不要再按旧句做界面。

线索页现有提示「补全联系人并验证邮箱（约 0.5 credit/封）」在官方通道改为已确认的「补全联系人并验证邮箱，费用从官方通道余额扣除」。与 US-HC-01 的查找提示同一处 `enrichTitle`。这句是费用提示，不表示会对全部联系人自动验邮。自定义通道可保留 credit 提示，因为费用仍在用户自己的 Hunter 额度上。

抽屉「验证」不看这个开关。用户点了就是再验一条，归 US-HC-03。

## 3. 数据与状态

| 项 | 约定 |
|----|------|
| 存储 | `.env` 的 `HUNTER_VERIFY_EMAILS`。保存仍走 `settings-service.ts` 里现有分支，与通道无关 |
| 生效点 | `main.ts` 的 `LEADS_ENRICH_CONTACTS` 用 `getSettingsSnapshot().hunterVerifyEmails`，忽略渲染进程传来的 `verifyEmails`。编排同样在启动参数里写入 `verify_emails` |
| 技能 | `verify_emails === false` 或缺省：硬禁止调用 `email_verifier`。`true` 时允许验邮，是否对某人调用由智能体决定（US-HC-09）。旧规定「true 就对每个写入的联系人都调验邮」已被 US-HC-09 超越，删除该规定。实际打出去的验邮仍是一封一次 `email_verifier`，成功后再 patch，且 `sync_valid_to_contacts: true` |
| 状态枚举 | 不新增枚举。官方 200 的 `data.status` 交给 `mapHunterVerifierStatus`：`unknown` → `hunter_unknown`（终态），`webmail` → `hunter_invalid`。技能官方结果与这个函数对齐。`pending: true` 只留在自定义 24 秒轮询用尽的返回里 |
| 同步联系人 | 仍是 `hunter_valid` + personal + confidence ≥ 70。阈值在技能的 `SYNC_CONFIDENCE_MIN` 与 lead-store 现逻辑 |

验邮现网没有缓存文件。本故事不给 `verifyEmail` 加缓存。O3 只讨论查找缓存。

## 4. 代码衔接与调用链

查找成功并第一次写回之后，技能 Step 6 只对智能体决定要验的邮箱调用 `hunter-api.email_verifier({ email })`。工具入参只有 `email`，不改。不要写成对 `people` 每一条循环。传输仍是下面这条。

`HunterClient.verifyEmail` 在官方通道：

- 不调用 `pickAvailableKey`，不读用户 Key，不进入 401/429 换 Key 循环。
- 一次 `POST ${base}/hunter/email-verifier`，正文只有 `{ "email" }`。不请求 `api.hunter.io`，也不在客户端对 202 轮询。自定义的 2 秒 / 24 秒轮询留在自定义分支（US-HC-04）。
- 这次 `fetch` 超时 90 秒。`opencode.json` 的 `hunter-api` 要有不小于 90 秒的 `timeout`。`createOpencode` 的 60 秒只用于拉起进程，不能当成这封邮件的超时。
- 200：解析 `data.status` / `score` / `email`。`status === "unknown"` 时 `pending: false`，技能写成 `hunter_unknown`。草案把这次终态计为一次验证；网关内部轮询不再另计。
- 504 `hunter_verification_pending`：`isError`，中文「验证尚未完成，请稍后再次验证」。不要返回 `pending: true`，也不要把这个人 patch 成 `hunter_unknown`。502 `hunter_upstream_error` 用另一句「验证暂时失败，请稍后重试」。同一次补全不自动再打这一封。

`buildEnrichLeadContactsPrompt` 仍传入 `verify_emails`。官方失败按工具中文转述，不要改写成 Hunter Key 或 Hunter 充值。自定义的 `HUNTER_QUOTA_EXCEEDED` / `HUNTER_ALL_KEYS_EXHAUSTED` 两句留下。

## 5. 验收与回归

- [ ] 官方通道设置里开关仍在，默认与现网一致，能保存。
- [ ] 开关开启后，实际发起的每一封都是一次 POST，URL 是 `{base}/hunter/email-verifier`，没有第二段 `/v1`，没有用户 Hunter Key。没有验邮缓存文件。不要按「每人一次」去循环 `people`。验谁归 US-HC-09。
- [ ] 200 且 `status=unknown`：`email_status` 为 `hunter_unknown`，不当成未完成。按草案计一次验证。
- [ ] 504：该人状态不变，提示尚未完成。502 的提示与 504 不同。两次都不会自动再请求。
- [ ] 开关关闭：同一次补全的工具调用里没有 `email_verifier`。
- [ ] 自定义通道开关仍是直连验邮，本故事不改 `requestOnce("/email-verifier")` 的自定义路径。
- [ ] 不改徽章文案（`LeadDetailDrawer.vue` 的 `emailStatusLabel`）。

## 6. 依赖与未决

| 项 | 说明 |
|----|------|
| US-HC-01 | 查找分支未落地时，没有同一次补全可挂验邮 |
| 超时 | 10 封都接近 60 秒时，15 分钟的 `taskTimeout` 可能先中止。中止后的那一次是否已计费未知，不自动重放 |
| 用量 | 终态按一次验证计。单价仍不在桌面展示。价目未配置时是 503，不是余额不足 |
| 生产 | 真实验邮联调未完成 |

---

## 修订记录

| 日期 | 说明 |
|------|------|
| 2026-11-16 | 初稿。开关与写回沿用现网，官方验邮 HTTP 留空。Related #156。 |
| 2026-11-16 | 写入单次 POST、90 秒超时、`unknown` 终态与 504。O2 文案改为已确认。 |
| 2026-11-17 | 验谁改指 US-HC-09。旧「对每人验邮」和设置页旧标签已被超越。本故事仍只验收官方实际发起的验邮走代调。Related #165。 |
