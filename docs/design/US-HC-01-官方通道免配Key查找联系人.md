# US-HC-01 详细设计：官方通道免配 Key 查找联系人

> **需求**：[../42-需求-官方通道网关代调Hunter-客户端.md](../42-需求-官方通道网关代调Hunter-客户端.md) · **US-HC-01** · Related [#156](https://github.com/Pedro-MAFS/ftcs/issues/156)  
> **状态**：**不可联调、不可实现。** 查找的方法、路径、字段属于 O1，本仓没有这份契约。本文只写客户端内部怎么接到现有补全链。不关 #156。  
> **范围**：官方通道、验邮开关关闭时的查找与 `people[]` 写回。  
> **依赖**：已开通官方通道（`officialProvisioned`）；现网补全写回；网关分册把查找契约写到可联调。预检与文案归 [US-HC-06](US-HC-06-设置引导与预检随通道切换.md)。  
> **不做**：打开验邮（[US-HC-02](US-HC-02-官方通道按开关验邮.md)）；抽屉单条（[US-HC-03](US-HC-03-抽屉单条验证跟随通道.md)）；自定义通道（[US-HC-04](US-HC-04-自定义通道仍自备Key直连.md)）；写死网关路径。  
> **索引**：[US-HC-官方通道网关代调Hunter.md](US-HC-官方通道网关代调Hunter.md)

---

## 1. 对应需求

官方通道、本机没有 Hunter Key、验邮关闭时，已评分且能解析官网域名的线索仍可「补全联系人」。出站目的地是 Token 网关代调。写回与现网查找结果一致。无结果时的空态与现网一致。界面不出现单价，也不把费用说成记在用户的 Hunter 账单上。画像、探索、评分、开发信在不做补全时仍可走完。

## 2. 模块与界面

本故事不新做页面。按钮仍在 `desktop/src/views/LeadsView.vue`：行内补全、`onBatchEnrichClick`、编排节点 `enrich-lead-contacts`。

官方且凭证可用时，按钮不再因为 `hunterKeySet === false` 而禁用。业务条件留下：`lead.phase === 'scored'`，并且 `parseCompanyDomain(lead.company.website || lead.domain)` 有域名。官方按钮提示改为「补全联系人，费用从官方通道余额扣除」，去掉现句里的「约 1 credit」。这句随 O2 一起等马丰顺确认；确认前不改 Vue。

未开通时的禁用文案在 US-HC-06。

## 3. 数据与状态

| 项 | 现网 | 本故事 |
|----|------|--------|
| 工具入参 | `domain_search({ domain, limit: 10 })`，技能冻结 `DOMAIN_SEARCH_LIMIT = 10` | 入参不改 |
| 写回 | 技能 Step 4～5：排序后 `leads_patch_scored`，`sync_valid_to_contacts: false` | 不改 `people[]` 字段、排序、`provider: "hunter"` |
| 结构 | `workspace/mcp-servers/lead-store/src/person-types.ts` 的 `EmailStatusSchema` / `PersonProviderSchema` | 不改 |
| 验邮开关 | `HUNTER_VERIFY_EMAILS`，缺省 true（`parseHunterVerifyEmails`） | 本故事验收时开关为关。关则技能禁止调用 `email_verifier` |
| 缓存 | `data/cache/hunter/domain-search/*.json`，TTL 24h，键不含 Key | 见 §4 的 O3 推荐 |

无邮箱时技能已要求如实说明、不编造。官方通道沿用这句。

## 4. 代码衔接与调用链

```text
LeadsView / 编排
  → IPC LEADS_ENRICH_CONTACTS（main.ts）
  → AgentRunController.launchButton('enrich-lead-contacts')
  → checkTaskEnvironment → runAgentPreflight（预检规则见 US-HC-06）
  → buildEnrichLeadContactsPrompt（verify_emails 来自 getSettingsSnapshot().hunterVerifyEmails）
  → 技能 enrich-lead-contacts Step 3
  → hunter-api.domain_search
  → HunterClient.domainSearch
```

编排同一条链：`WORKFLOW_NODE_PREFLIGHT['enrich-lead-contacts']` → `runWorkflowPreflight` → `ensureAgentReady`，真正执行仍是 `launchButton`。批量与单条共用 `buildEnrichLeadContactsPrompt`。不新造工具名。

官方分支接在 `HunterClient.domainSearch`：

1. 先 `readDomainSearchCache`。命中则返回，`cached: true`。这是 O3 的客户端推荐，官方命中同样不出站。
2. 未命中且 `FTCS_CHANNEL_MODE=official`：调用单独的代调函数。凭证用子进程里的 `FTCS_GATEWAY_API_KEY` 与 `FTCS_TOKEN_GATEWAY_BASE_URL`（桌面在 `rewriteMcpWorkspaceEnv` 注入，解析对齐 `getTokenGatewayBaseUrl`）。
3. 代调成功后，仍走现有 `trimDomainSearch` + `writeDomainSearchCache`，再把现有裁剪结构交回技能。网关响应怎样映射到 `HunterDomainSearchResponseSchema`，等 O1，本文不填字段。
4. 代调失败：把错误交给 US-HC-07 的两类用户结果。此处禁止再调用 `requestWithFailover`，禁止读 `getHunterApiKeys()`。

`runtime.ts` 今日的 `hunterEnv` 无论通道都注入 `HUNTER_API_KEYS` / `HUNTER_API_KEY`。官方改为不注入这两项，改注入网关 sk、base 和 `FTCS_CHANNEL_MODE`。与搜索官方分支并列，不复用 `SEARCH_PROVIDER`。

主路径：`needsHunter` 只在 `kind === 'enrich-lead-contacts'` 时为真。`extract-profile`、探索、`score-and-dedupe`、`draft-email` 的预检不增加 Hunter 检查。

实现 PR 若改了 `hunter-api` 或技能，同一次升 `WORKSPACE_TEMPLATE_VERSION` 并打包 MCP。本详设不升。

## 5. 验收与回归

契约锁定前，下面只是将来的验收，不是本 PR 已测项。

- [ ] 官方、未配置 Hunter Key、验邮关闭、线索已评分且有可解析域名：「补全联系人」能跑完，`people[]` 写回与现网查找一致；无结果时不编造邮箱。
- [ ] 该次未命中缓存的出站 host 是 `getTokenGatewayBaseUrl` 的 host。请求不带用户 Hunter Key，不出现 `api.hunter.io`。
- [ ] 缓存命中时出站次数为 0（按 O3 推荐）。单测不写死尚未锁定的路径字符串。
- [ ] 界面提示不含单价，也不写「记在 Hunter 账单」。
- [ ] 不做补全时，画像、探索、评分、开发信的预检与按钮仍可用。
- [ ] 自定义通道查找仍直连，归 US-HC-04，本故事不改它。

## 6. 依赖与未决

| 项 | 说明 |
|----|------|
| O1 查找契约 | 未锁定。没有方法、路径、字段就不能联调，也不能写代调函数体 |
| O3 | 客户端推荐「命中不出站」。这不代表网关已同意免费。跨通道共享同一缓存文件。待马丰顺确认 |
| 失败文案 | 归 US-HC-07。未区分余额与凭证前，不发明状态码 |
| 预检改口 | 归 US-HC-06。只改传输、预检仍要求 Key 时，官方无 Key 用户仍会被挡住 |

---

## 修订记录

| 日期 | 说明 |
|------|------|
| 2026-11-16 | 初稿。只接现有补全链与缓存短路。代调 HTTP 留空。Related #156。 |
