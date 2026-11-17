# US-HC-01 详细设计：官方通道免配 Key 查找联系人

> **需求**：[../42-需求-官方通道网关代调Hunter-客户端.md](../42-需求-官方通道网关代调Hunter-客户端.md) · **US-HC-01** · Related [#156](https://github.com/Pedro-MAFS/ftcs/issues/156)  
> **状态**：**可按联调草案实现查找。** 路径与字段见 [契约附录](US-HC-网关代调契约草案.md) §1、§2。真实上游与结算未联调，示例不是实测。不关 #156。  
> **范围**：官方通道、验邮开关关闭时的查找与 `people[]` 写回。  
> **依赖**：已开通官方通道（`officialProvisioned`）；现网补全写回。预检与文案归 [US-HC-06](US-HC-06-设置引导与预检随通道切换.md)。失败文案归 [US-HC-07](US-HC-07-官方通道失败可理解提示.md)。  
> **不做**：打开验邮（[US-HC-02](US-HC-02-官方通道按开关验邮.md)）；抽屉单条（[US-HC-03](US-HC-03-抽屉单条验证跟随通道.md)）；自定义通道（[US-HC-04](US-HC-04-自定义通道仍自备Key直连.md)）；查找条数、筛选与翻页（[US-HC-08](US-HC-08-补全联系人查找参数与翻页.md)）。旧句「给工具加 offset 或自动翻页 / 技能冻结 limit=10」已被 US-HC-08 超越。本故事仍不在客户端按 `meta.results` 自动翻页。  
> **索引**：[US-HC-官方通道网关代调Hunter.md](US-HC-官方通道网关代调Hunter.md)

---

## 1. 对应需求

官方通道、本机没有 Hunter Key、验邮关闭时，已评分且能解析官网域名的线索仍可「补全联系人」。出站目的地是 Token 网关代调。写回与现网查找结果一致。无结果时的空态与现网一致。界面不出现单价，也不把费用说成记在用户的 Hunter 账单上。画像、探索、评分、开发信在不做补全时仍可走完。

## 2. 模块与界面

本故事不新做页面。按钮仍在 `desktop/src/views/LeadsView.vue`：行内补全、`onBatchEnrichClick`、编排节点 `enrich-lead-contacts`。

官方且凭证可用时，按钮不再因为 `hunterKeySet === false` 而禁用。业务条件留下：`lead.phase === 'scored'`，并且 `parseCompanyDomain(lead.company.website || lead.domain)` 有域名。官方按钮提示用已确认的「补全联系人，费用从官方通道余额扣除」，去掉现句里的「约 1 credit」。

未开通时的禁用文案在 US-HC-06。

## 3. 数据与状态

| 项 | 现网 | 本故事 |
|----|------|--------|
| 工具入参 | 现网技能冻结 `DOMAIN_SEARCH_LIMIT = 10`，只发 `limit: 10` | 本故事不改条数与翻页。现行口径在 US-HC-08：删除该冻结，工具可传 `limit` / 筛选 / `offset`。不要再按「入参不改、固定 10」实现 |
| 写回 | 技能 Step 4～5：排序后 `leads_patch_scored`，`sync_valid_to_contacts: false` | 不改 `people[]` 字段、排序、`provider: "hunter"` |
| 结构 | `workspace/mcp-servers/lead-store/src/person-types.ts` 的 `EmailStatusSchema` / `PersonProviderSchema` | 不改 |
| 验邮开关 | `HUNTER_VERIFY_EMAILS`，缺省 true（`parseHunterVerifyEmails`） | 本故事验收时开关为关。关则技能禁止调用 `email_verifier` |
| 缓存 | `data/cache/hunter/domain-search/*.json`，TTL 24h，键不含 Key、不含通道 | O3 已确认：命中不出站，网关不收费 |

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

1. 先 `readDomainSearchCache`。命中则返回 `cached: true`，不发 HTTP。草案规定这次网关不收费。
2. 未命中且 `FTCS_CHANNEL_MODE=official`：`POST ${base}/hunter/domain-search`。`base` 用 `getGatewayBaseUrl()` 的规则（已含 `/v1`，只去尾部斜杠）。头是 `Authorization: Bearer <FTCS_GATEWAY_API_KEY>`、`Content-Type` 与 `Accept` 均为 JSON。不要拼第二段 `/v1`，不要带 Hunter Key 或 `api_key`。
3. 代调正文的字段规则以契约附录 §2 的现行口径为准（US-HC-08）。省略的字段不传 `null`。不传 `api_key`、不传用户 Hunter Key。单次 `domainSearch` 只请求当前这一页，不按 `meta.results` 再请求下一页。旧句「技能仍为 10、不传 offset」已被 US-HC-08 超越，不要再按该句编码。
4. 200 用现有 `HunterDomainSearchResponseSchema` 校验（容忍额外字段）。`meta.results` 缺失时仍用 `parsed.meta?.results ?? parsed.data.emails.length`。然后 `trimDomainSearch` + `writeDomainSearchCache`。`emails: []` 是成功空页。上游 `emails` 非空即按草案计一次，即使裁剪后 `dropped_no_sources` 把本页清空。
5. 失败交给 US-HC-07。不调用 `requestWithFailover`，不读 `getHunterApiKeys()`，不自动重试。超时或断线时不假定未收费。

`runtime.ts` 今日的 `hunterEnv` 无论通道都注入 `HUNTER_API_KEYS` / `HUNTER_API_KEY`。官方改为不注入这两项，改注入网关 sk、base 和 `FTCS_CHANNEL_MODE`。与搜索官方分支并列，不复用 `SEARCH_PROVIDER`。

主路径：`needsHunter` 只在 `kind === 'enrich-lead-contacts'` 时为真。`extract-profile`、探索、`score-and-dedupe`、`draft-email` 的预检不增加 Hunter 检查。

实现 PR 若改了 `hunter-api` 或技能，同一次升 `WORKSPACE_TEMPLATE_VERSION` 并打包 MCP。本详设不升。

## 5. 验收与回归

本详设 PR 不跑这些场景。实现时用桩或联调环境，不要把附录里的示例 JSON 当成已经打过的样本。

- [ ] 官方、未配置 Hunter Key、验邮关闭、线索已评分且有可解析域名：补全能写回；无邮箱时不编造。
- [ ] 未命中缓存时只有一次 `POST {base}/hunter/domain-search`。URL 不含 `/v1/v1/`。头是官方 sk，没有用户 Hunter Key，host 不是 `api.hunter.io`。
- [ ] 200 且本页 `emails` 为空：空态，按草案不收费。200 且上游 `emails` 非空：这一次调用只计这一页。客户端不按 `meta.results` 自动再请求。技能另传 `offset` 翻页不在本故事验收（US-HC-08）。
- [ ] 缓存命中：出站 0 次。
- [ ] `pagination_error` 的提示不是余额不足。失败不自动重试。
- [ ] 界面提示不含单价，也不写「记在 Hunter 账单」。
- [ ] 不做补全时，画像、探索、评分、开发信仍可用。自定义查找仍直连，归 US-HC-04。

## 6. 依赖与未决

| 项 | 说明 |
|----|------|
| 草案 | 可实现。部署、`HUNTER_ENABLED`、查找价目未就绪时，联调会得到 503，不是客户端路径写错 |
| 生产 | 真实 Hunter 与结算未完成。地址和单价不在本仓 |
| 计费差 | 裁剪掉无 sources 的邮箱后，本页仍可能已经计费 |
| 预检 | 归 US-HC-06。只改传输而预检仍要求 Key 时，无 Key 的官方用户仍会被挡住 |

---

## 修订记录

| 日期 | 说明 |
|------|------|
| 2026-11-16 | 初稿。只接现有补全链与缓存短路。代调 HTTP 留空。Related #156。 |
| 2026-11-16 | 写入草案路径、单页正文和计费口径。O3 改为已确认。 |
| 2026-11-17 | 查找条数与翻页改指 US-HC-08。旧「固定 limit=10、不传 offset」已被超越。本故事仍只验收代调传输。Related #165。 |
