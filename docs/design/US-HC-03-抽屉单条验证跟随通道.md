# US-HC-03 详细设计：抽屉单条验证跟随通道

> **需求**：[../42-需求-官方通道网关代调Hunter-客户端.md](../42-需求-官方通道网关代调Hunter-客户端.md) · **US-HC-03** · Related [#156](https://github.com/Pedro-MAFS/ftcs/issues/156)  
> **状态**：**不可联调、不可实现。** 依赖 US-HC-05，且验邮代调契约未锁定。不关 #156。  
> **范围**：线索抽屉里对一条已有邮箱再点「验证」。  
> **依赖**：[US-HC-05](US-HC-05-去掉官方通道自备Key直连.md)；现网这条路径不另起补全任务。  
> **不做**：新的批量验邮；改徽章文案规则；让这一下受「补全联系人时验证邮箱」开关控制。  
> **索引**：[US-HC-官方通道网关代调Hunter.md](US-HC-官方通道网关代调Hunter.md)

---

## 1. 对应需求

官方通道下，「验证」的可用条件改为官方凭证可用，而不是本机已有 Hunter Key。点击后只验这一条，经网关代调，写回现网同一套验邮状态。自定义通道仍须已配置自备 Key，并直连 Hunter；未配置时的提示与现网一致。单条验证不启动 `enrich-lead-contacts`。

## 2. 模块与界面

`desktop/src/components/shared/LeadDetailDrawer.vue`：

| 现网 | 本故事 |
|------|--------|
| `hasHunterKey` 来自 prop `hunterKeySet` | 官方看凭证可用（设置快照里的 `channelMode === 'official'` 且 `officialProvisioned`）。自定义仍看 `hunterKeySet` |
| 无 Key 时按钮禁用，title「请先在设置 → 集成配置 Hunter API Key」 | 官方未开通时 title 指向登录 / 开通官方通道（句子与 US-HC-06 预检同一句）。自定义保持现句 |
| `onVerifyPerson` 在无 Key 时把同一句写到 `saveMessage` | 官方未开通时写开通提示，不写 Hunter Key |
| `canVerifyPerson`：仅 `hunter_unverified` 或 `hunter_unknown` 才显示按钮 | 保持。不改 `emailStatusLabel` |

`LeadsView.vue` 把 `:hunter-key-set="hunterKeySet"` 传给抽屉。改为同时传入通道和 `officialProvisioned`，抽屉自己算「当前通道能否验证」。不要在官方通道把 `hunterKeySet` 伪装成 true，否则本机留着的自定义 Key 又会变成可用条件。

## 3. 数据与状态

写回仍在 `verifyPersonEmail` 内，直接改 `data/leads/{productId}/scored.json` 的该人：

- `email_status` 经 `mapHunterVerifierStatus`
- `confidence` 用返回分数，否则保留原值
- 符合 `shouldAppendContactC7` 时追加 `contacts[]`（personal、`hunter_valid`、confidence ≥ 70）

不改这些函数。官方成功结果要先变成 `mapHunterVerifierStatus` 已经认识的状态字符串（`valid` / `accept_all` / `invalid` / `disposable` / 空）。网关用哪一个字段承载这个状态，等 O1。

这条路径不写 `people[].sources`，也不调用 `leads_patch_scored`。保持现状。

## 4. 代码衔接与调用链

```text
LeadDetailDrawer.onVerifyPerson
  → window.ftcs.verifyPersonEmail
  → IPC LEADS_VERIFY_PERSON_EMAIL
  → verifyPersonEmail（desktop/electron/leads/verify-person-email.ts）
```

这里没有 `launchButton`，没有技能，没有 `domain_search`。官方通道必须继续保持「不另起补全任务」。

`verifyPersonEmail` 今天开头就 `readHunterKeysFromEnv`，没有 Key 就返回「请先在设置 → 集成配置 Hunter API Key」，然后 `callEmailVerifier` 请求 `https://api.hunter.io/v2/email-verifier`，头是 `X-API-Key`。按通道拆开：

| 通道 | 行为 |
|------|------|
| `official` | 不读 Key 文件来决定成败。凭证不可用时返回 US-HC-06 的开通提示，不发 HTTP。凭证可用时走代调。失败不进入下面的 Key 循环 |
| `custom` | 保持现有 Key 循环、`callEmailVerifier`、401 换下一把、402 停止。文案保持「Key 无效」「Hunter 额度不足，请到 Hunter 账户充值」「验证仍在处理中，请稍后重试」 |

官方代调与 MCP `verifyEmail` 的官方分支使用同一份网关分册，禁止抽屉单独假设另一条路径。两条进程可以各写一个函数，但路径与字段必须同源，且在 O1 锁定前函数体不填 HTTP。

现网抽屉对 HTTP 202 不轮询，直接告诉用户稍后重试。官方是否还有「处理中」、要不要轮询，等验邮契约。不要把 MCP 里 24 秒轮询搬进抽屉作为已确认行为。

## 5. 验收与回归

- [ ] 官方、已开通、无 Hunter Key：未验证或未知的那一条可以点「验证」。完成后状态仍经 `mapHunterVerifierStatus` 写回。任务列表不出现 `enrich-lead-contacts`。
- [ ] 该次请求的 host 不是 `api.hunter.io`，头里没有用户 Hunter Key。
- [ ] 官方未开通：按钮不可用，提示去登录或开通，不出现 Hunter 注册。
- [ ] 自定义、已配置 Key：仍直连，402 仍提示 Hunter 账户充值。
- [ ] 自定义、未配置 Key：提示仍是「请先在设置 → 集成配置 Hunter API Key」。
- [ ] 验邮开关关闭时，抽屉「验证」仍可点（官方看凭证，自定义看 Key）。开关只约束补全任务。

## 6. 依赖与未决

| 项 | 说明 |
|----|------|
| US-HC-05 | 官方直连分支还在时，抽屉会继续用本机 Key。本故事不能先于删除落地 |
| O1 | 验邮代调未锁定，`verifyPersonEmail` 的官方分支不能写请求 |
| US-HC-07 | 官方余额不足 / 凭证不可用的句子接到这次 `saveMessage`，不新做账本 |
| 徽章 | `emailStatusLabel` 不改 |

---

## 修订记录

| 日期 | 说明 |
|------|------|
| 2026-11-16 | 初稿。抽屉仍走主进程单条验邮，官方分支等待同一份验邮契约。Related #156。 |
