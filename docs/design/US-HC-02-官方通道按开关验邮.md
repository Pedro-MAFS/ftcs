# US-HC-02 详细设计：官方通道按开关验证邮箱

> **需求**：[../42-需求-官方通道网关代调Hunter-客户端.md](../42-需求-官方通道网关代调Hunter-客户端.md) · **US-HC-02** · Related [#156](https://github.com/Pedro-MAFS/ftcs/issues/156)  
> **状态**：**不可联调、不可实现。** 验邮代调契约属于 O1。不关 #156。  
> **范围**：同一次「补全联系人」里，官方通道按「补全联系人时验证邮箱」决定是否代调验邮。  
> **依赖**：[US-HC-01](US-HC-01-官方通道免配Key查找联系人.md) 的代调查找。开关在设置里仍可见，归 [US-HC-06](US-HC-06-设置引导与预检随通道切换.md)。  
> **不做**：抽屉上再点「验证」（[US-HC-03](US-HC-03-抽屉单条验证跟随通道.md)）；修改验邮状态枚举；改自定义通道的直连验邮。  
> **索引**：[US-HC-官方通道网关代调Hunter.md](US-HC-官方通道网关代调Hunter.md)

---

## 1. 对应需求

开关默认与现网一致（未配置时为开，`parseHunterVerifyEmails`）。官方通道开启时，同一次补全里的验邮经网关代调，写回现有验邮状态，用量计入官方通道。关闭时只查找，不发起验邮。验邮不使用用户 Hunter Key。

## 2. 模块与界面

勾选仍是 `SettingsView.vue` 的 `form.hunterVerifyEmails`，文案仍是「补全联系人时验证邮箱」。官方通道下这个勾选保留。

线索页现有提示「补全联系人并验证邮箱（约 0.5 credit/封）」在官方通道改为「补全联系人并验证邮箱，费用从官方通道余额扣除」。与 US-HC-01 的查找提示同一处 `enrichTitle`，随 O2 等确认。自定义通道可保留 credit 提示，因为费用仍在用户自己的 Hunter 额度上。

抽屉「验证」不看这个开关。用户点了就是再验一条，归 US-HC-03。

## 3. 数据与状态

| 项 | 约定 |
|----|------|
| 存储 | `.env` 的 `HUNTER_VERIFY_EMAILS`。保存仍走 `settings-service.ts` 里现有分支，与通道无关 |
| 生效点 | `main.ts` 的 `LEADS_ENRICH_CONTACTS` 用 `getSettingsSnapshot().hunterVerifyEmails`，忽略渲染进程传来的 `verifyEmails`。编排同样在启动参数里写入 `verify_emails` |
| 技能 | `verify_emails === true` 才对每人调用 `email_verifier`，然后再 `leads_patch_scored` 且 `sync_valid_to_contacts: true`。`false` 或缺省时技能硬禁令禁止调用 |
| 状态枚举 | 技能对照表不变：`valid` → `hunter_valid`，`accept_all` → `hunter_accept_all`，`invalid` / `disposable` → `hunter_invalid`，空 → `hunter_unverified`，其他 → `hunter_unknown`。`pending: true` 仍写成 `hunter_unknown` |
| 同步联系人 | 仍是 `hunter_valid` + personal + confidence ≥ 70。阈值在技能的 `SYNC_CONFIDENCE_MIN` 与 lead-store 现逻辑 |

验邮现网没有缓存文件。本故事不给 `verifyEmail` 加缓存。O3 只讨论查找缓存。

## 4. 代码衔接与调用链

查找成功并第一次写回之后，技能 Step 6 调用 `hunter-api.email_verifier({ email })`。工具入参只有 `email`，不改。

`HunterClient.verifyEmail` 在官方通道：

- 不调用 `pickAvailableKey`，不读用户 Key。
- 不请求 `https://api.hunter.io/v2/email-verifier`。
- 代调函数的 HTTP 等 O1。返回值仍要能被现有技能消费：`pending` 与现有 `HunterVerifierData` 字段（`status`、`score`、`email` 等）。网关若用另一套字段，映射写在这个函数里，等分册给出后再填。本文不假定 HTTP 202，也不把现网 24 秒轮询（`VERIFIER_POLL_INTERVAL_MS` / `VERIFIER_POLL_BUDGET_MS`）写成官方规则。自定义通道的轮询留下，归 US-HC-04。

官方代调失败时不切到下一把用户 Key。`verifyEmail` 里现有的 401/429 换 Key 循环只留在自定义分支。

`buildEnrichLeadContactsPrompt` 在官方通道仍传入 `verify_emails：true/false`。配额错误那两句（`HUNTER_QUOTA_EXCEEDED` / `HUNTER_ALL_KEYS_EXHAUSTED`）是自定义 Key 池的说法；官方改为转述工具返回的中文，具体句子归 US-HC-07。

## 5. 验收与回归

- [ ] 官方通道设置里开关仍在，默认与现网一致，能保存。
- [ ] 开关开启：同一次补全会验邮，`email_status` 仍是现有枚举；未命中任何「验邮缓存」（因为没有这层缓存）；出站不带用户 Hunter Key，host 不是 `api.hunter.io`。
- [ ] 开关关闭：同一次补全的工具调用里没有 `email_verifier`。
- [ ] 自定义通道开关仍是直连验邮，本故事不改 `requestOnce("/email-verifier")` 的自定义路径。
- [ ] 不改徽章文案（`LeadDetailDrawer.vue` 的 `emailStatusLabel`）。

## 6. 依赖与未决

| 项 | 说明 |
|----|------|
| US-HC-01 | 查找代调未落地时，没有「同一次补全」可挂验邮 |
| O1 验邮契约 | 未锁定。包括处理中时客户端是否轮询 |
| 用量 | 需求要求计入官方通道。单价与「按封还是按次」在网关分册，桌面不展示 |
| O2 | 按钮提示原句待确认 |

---

## 修订记录

| 日期 | 说明 |
|------|------|
| 2026-11-16 | 初稿。开关与写回沿用现网，官方验邮 HTTP 留空。Related #156。 |
