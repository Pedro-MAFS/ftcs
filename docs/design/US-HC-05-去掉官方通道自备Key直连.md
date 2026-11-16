# US-HC-05 详细设计：去掉官方通道的自备 Key 直连

> **需求**：[../42-需求-官方通道网关代调Hunter-客户端.md](../42-需求-官方通道网关代调Hunter-客户端.md) · **US-HC-05** · Related [#156](https://github.com/Pedro-MAFS/ftcs/issues/156)  
> **状态**：**不可实现。** 删除必须和 US-HC-01 的代调分支同一次落地。契约未锁定时先删，官方用户会失去补全。不关 #156。  
> **范围**：官方通道不再读取、注入、回退到用户 Hunter Key。已保存的 Key 留在本机。  
> **依赖**：[US-HC-01](US-HC-01-官方通道免配Key查找联系人.md) 的代调查找；[US-HC-04](US-HC-04-自定义通道仍自备Key直连.md) 的直连仍然存在。  
> **不做**：删除自定义直连；向客户端下发一把官方 Hunter Key。  
> **索引**：[US-HC-官方通道网关代调Hunter.md](US-HC-官方通道网关代调Hunter.md)

---

## 1. 对应需求

官方通道的查找与验邮不读取、不注入用户 Hunter Key。代调失败、余额不足或凭证不可用时，不回退到本机 Key 直连 `api.hunter.io`。要改用自备 Key，用户把模型通道切到自定义。仓库里不保留一条只给官方通道、运行时却不再走到的「自备 Key + 直连」兼容分支。切到官方不清除已保存的 Key。切回自定义后按 US-HC-04 恢复可编辑、可直连。官方通道的保存不会把自备 Key 写成当次调用的上游凭证。

## 2. 模块与界面

设置页官方区块不提供可提交的 Key 输入，布局见 US-HC-06。本故事约束保存：

`SettingsView.vue` 的 `onSave` 今天总是提交 `hunterApiKeys: hunterKeySlots`。官方若把输入卸掉、槽位变成空数组，`settings-service.ts` 会把 `clearHunterKeys` 设为 true，Key 被删掉。

官方保存改为与 Places 相同的省略方式：`channelMode === 'official'` 时不传 `hunterApiKeys`（Places 已是 `custom` 才传 `placesApiKey`）。`saveSettings` 在 `hunterApiKeys === undefined` 时保留 `readHunterKeysFromEnv` 的原值。验邮开关照常传。

用户要改 Key，先把通道选成自定义，用现有槽位保存。官方保存不把这些 Key 写进 MCP 环境。

## 3. 数据与状态

| 存储 | 官方当次调用 | 磁盘 |
|------|----------------|------|
| `HUNTER_API_KEYS` / `HUNTER_API_KEY` | 不读进代调，不注入 `hunter-api` | 保留 |
| `HUNTER_VERIFY_EMAILS` | 仍决定补全是否验邮 | 保留 |
| `FTCS_GATEWAY_API_KEY` | 官方代调的凭证，与搜索共用 | 仍是官方通道 sk，不是 Hunter Key |
| Key 池文件 `data/cache/hunter` 下的 exhausted/invalid 标记 | 官方分支不调用 `pickAvailableKey` | 不因切通道删除。自定义切回后池状态仍在 |

`getHunterApiKeys()` 在官方进程里应得到空列表，因为环境没注入。即便 `.env` 里还有 Key，官方分支也不调用它。禁止写成「Key 空则改打网关，Key 有则直连」。

## 4. 代码衔接与调用链

要拆开的现网入口：

| 位置 | 今天 | 官方落地后 |
|------|------|------------|
| `runtime.ts` `hunterEnv` | 始终展开 `HUNTER_API_KEYS` / `HUNTER_API_KEY` | 官方对象里没有这两键。自定义对象保持今天的展开 |
| `HunterClient` 构造 | `createClient()` 总是 `keys: getHunterApiKeys()` | 官方走代调函数，不进入 `requestWithFailover` / `verifyEmail` 的换 Key 循环 |
| `domainSearch` 缓存未命中 | 一律 `requestWithFailover("/domain-search")` | 官方只调用代调。代调抛错即结束 |
| `verify-person-email.ts` | 先读 Key，再 `callEmailVerifier` 循环 | 官方不进入该循环 |
| `testHunterConnectivity` | 用本机 Key 打 `/account` | 官方直接返回「官方通道不使用自备 Hunter Key」，`fetch` 次数为 0 |
| `account_info` | 对每把 Key `fetchAccountData` | 官方不发 HTTP。沿用 `errorPayload`，中文说明官方通道不查询 Hunter 账号额度，余额看设置里的官方账户。不新增网关「查 Hunter 账户」接口 |
| 常量 `BASE_URL` | 全类共用 | 只留在自定义直连函数里。官方分支的源码路径上不能再出现这个 URL，也不能在 `catch` 里调用它 |

「物理删除」指官方分支的源码不再包含直连调用，而不是用 flag 把直连函数留在官方调用栈上。自定义文件与函数按 US-HC-04 保留。

搜索的官方失败不会改去调 Tavily。Hunter 同样：代调失败的 `catch` 里不调用 `requestOnce`、`callEmailVerifier`、`testHunterConnectivity`。

## 5. 验收与回归

- [ ] 官方、`.env` 里仍有 `HUNTER_API_KEYS`：补全进程环境没有这两键。代调失败后的下一次出站仍然不是 `api.hunter.io`。
- [ ] 在官方通道保存验邮开关或模型项：磁盘上的 Hunter Key 与保存前一致。
- [ ] 切到自定义：Key 输入恢复，直连与测试按 US-HC-04。
- [ ] 仓库里不存在「`channelMode === official` 且失败则用用户 Key 再请求一次」的分支。
- [ ] 官方调用 `settings:test-hunter` 或 `account_info`：无 HTTP。
- [ ] 自定义直连测试仍打 `api.hunter.io`。

## 6. 依赖与未决

| 项 | 说明 |
|----|------|
| O1 | 未锁定时代调函数没有可填的请求。本故事不能先于它合并实现 |
| US-HC-04 | 删除时要留下的符号清单 |
| 保存省略 `hunterApiKeys` | 客户端规则，不依赖网关字段。仍须与代调同一次发布，避免界面已承诺免配 Key、调用仍要求 Key |
| HC7 | 不实现「下发 Hunter Key 再直连」 |

---

## 修订记录

| 日期 | 说明 |
|------|------|
| 2026-11-16 | 初稿。写明官方注入、保存与失败回退的删除点。实现等待 O1。Related #156。 |
