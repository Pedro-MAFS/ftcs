# US-HC-04 详细设计：自定义通道仍自备 Key 直连

> **需求**：[../42-需求-官方通道网关代调Hunter-客户端.md](../42-需求-官方通道网关代调Hunter-客户端.md) · **US-HC-04** · Related [#156](https://github.com/Pedro-MAFS/ftcs/issues/156)  
> **状态**：**回归守门。** 自定义协议不改，不走 [契约附录](US-HC-网关代调契约草案.md)。通道分叉落地时用本页验收。不关 #156。  
> **范围**：`FTCS_CHANNEL_MODE=custom` 时的 Key、测试、查找、按开关验邮、抽屉单条验证。  
> **依赖**：现网 [US-C-03](US-C-03-Skill与桌面.md)、[US-C-04](US-C-04-抽屉people与手工维护.md)。官方删除分支是 [US-HC-05](US-HC-05-去掉官方通道自备Key直连.md)。  
> **不做**：删除自定义 Key；把自定义通道改成代调；扣官方余额；改查找参数与翻页（[US-HC-08](US-HC-08-补全联系人查找参数与翻页.md)）；改验邮开关含义（[US-HC-09](US-HC-09-验邮开关允许对关键人验证.md)）。  
> **索引**：[US-HC-官方通道网关代调Hunter.md](US-HC-官方通道网关代调Hunter.md)

---

## 1. 对应需求

自定义通道下 Key 可编辑，可配置多个（上限 `HUNTER_API_KEYS_MAX = 5`），可测试连接。未配置时线索页按钮不可用，引导仍指向设置 → 集成。查找、实际发起的验邮、抽屉单条验证都直连 `https://api.hunter.io`。这些调用不经过 Token 网关，不扣官方余额。未配置 Key 时画像、探索、评分、开发信仍可用。查找可带的可选字段在 US-HC-08，验谁在 US-HC-09。本故事只守直连与不计官方余额。

## 2. 模块与界面

`SettingsView.vue` 在 `channelMode === 'custom'` 时保持现在的「Hunter · 补全联系人」整块：多行 Key、显示/隐藏、添加、删除、验邮勾选、「费用由 Hunter 收取」、Hunter 服务条款、打开 Hunter、「测试连接」。

`LeadsView.vue` 在自定义且 `hunterKeySet === false` 时保持：

- `enrichTitle` / 批量按钮 title：「请先在设置 → 集成中配置 Hunter API Key」或「请先在设置 → 集成配置 Hunter API Key」
- 横幅：「补全联系人需 Hunter Key（设置 → 集成）」
- `canEnrichLead` 仍要求 `hunterKeySet`

抽屉在自定义且无 Key 时保持 `LeadDetailDrawer.vue` 的禁用 title 与 `onVerifyPerson` 提示。

有 Key 时，查找提示可以继续写「约 1 credit」，验邮提示可以继续写「约 0.5 credit/封」。这是用户自己的 Hunter 额度，不是官方单价。

## 3. 数据与状态

| 键 | 行为 |
|----|------|
| `HUNTER_API_KEYS` | 逗号分隔，槽位保存走 `resolveHunterApiKeysSlots` |
| `HUNTER_API_KEY` | 旧单 Key。`readHunterKeysFromEnv` / `getHunterApiKeys` 仍合并进池 |
| `HUNTER_VERIFY_EMAILS` | 缺省为开。关闭则技能不调用 `email_verifier`。开启后实际发起的验邮仍直连。验谁见 US-HC-09，不要实现成对全部联系人自动验邮。查找参数与翻页见 US-HC-08，本故事不验收 `limit` / `offset` |
| Key 池 | `key-pool.ts`：429 `markKeyExhausted`，401 `markKeyInvalid`。只服务于自定义直连 |

切到官方再切回自定义：上述键还在，输入框恢复可编辑。删除只发生在用户于自定义区块清空并保存。见 US-HC-05 的保存规则。

## 4. 代码衔接与调用链

自定义通道保持今天的三条直连，分叉落地时用通道把它们圈住，而不是删掉：

| 动作 | 现网符号 | 目的地 |
|------|----------|--------|
| 查找 | `HunterClient.domainSearch` → `requestWithFailover("/domain-search")` | `https://api.hunter.io/v2/domain-search`，头 `X-API-Key` |
| 补全验邮 | `HunterClient.verifyEmail` → `requestOnce("/email-verifier")`，202 轮询最多约 24s | 同上 `/email-verifier` |
| 抽屉验邮 | `callEmailVerifier` | 同上。401 换 Key，402 停止并提示 Hunter 充值。202 不轮询 |
| 测试 | `testHunterConnectivity` → `fetchAccount` | `https://api.hunter.io/v2/account` |

`rewriteMcpWorkspaceEnv` 在自定义时的 `hunterEnv` 继续只放 `FTCS_WORKSPACE` 和用户 Key。不把 `FTCS_GATEWAY_API_KEY` 注入 `hunter-api`。

自定义直连上的 HTTP 401/429/402 仍是 Hunter 自己的 Key 与额度，映射保持 `mapHttpError` / 抽屉现有句子。不要改成附录里的 `reason=insufficient_quota` 或官方凭证文案。官方 429 只出现在代调响应里。

技能错误句保留：`HUNTER_NO_KEY` / `HUNTER_UNAUTHORIZED` 提示配置 Key；`HUNTER_QUOTA_EXCEEDED` / `HUNTER_ALL_KEYS_EXHAUSTED` 提示 Hunter 额度。`buildEnrichLeadContactsPrompt` 里这两句在自定义通道保留。

主路径：`needsHunter` 仍只挂在 `enrich-lead-contacts`。无 Key 时 `resolveHunterStart` 的自定义分支保持现在的失败句（`hunter-start.ts`）。

## 5. 验收与回归

- [ ] 自定义、多 Key：可编辑、可测试。测试请求发往 `api.hunter.io/v2/account`，不发往网关。
- [ ] 自定义、未配置 Key：补全按钮与抽屉「验证」不可用，引导是设置 → 集成。探索、评分、开发信仍可启动。
- [ ] 自定义查找、开关打开后实际发起的验邮、抽屉验证：host 为 `api.hunter.io`，头为用户 Hunter Key。请求里不出现 `FTCS_GATEWAY_API_KEY`，host 也不是 `{base}/hunter/`。本条验收直连目的地，不验收「对全部联系人验邮」。
- [ ] 官方余额（`refreshOfficialUsage` / `usage/me`）不因这些调用变化。桌面没有 Hunter 官方扣费账本可看；验收时以「请求未到网关」为准，不要求本故事去对网关账单。
- [ ] 从官方切回自定义后，切走之前保存的 Key 仍在，测试与直连可用。

## 6. 依赖与未决

没有新的网关字段要写。分叉代码若把自定义也改成代调，或官方失败后调用本节这些函数，就算本故事失败。回归与 US-HC-05 同一次验收。

---

## 修订记录

| 日期 | 说明 |
|------|------|
| 2026-11-16 | 初稿。列出现网直连符号，作为分叉时的回归清单。Related #156。 |
| 2026-11-16 | 标明自定义的 401/429/402 不改成官方 `reason` 表。 |
| 2026-11-17 | 查找参数指向 US-HC-08，验谁指向 US-HC-09。本故事仍只守自定义直连。Related #165。 |
