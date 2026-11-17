# US-HC-08 详细设计：补全联系人查找参数与翻页

> **需求**：[../42-需求-官方通道网关代调Hunter-客户端.md](../42-需求-官方通道网关代调Hunter-客户端.md) §2.5、HC14、§7 US-HC-08 · Related [#165](https://github.com/Pedro-MAFS/ftcs/issues/165)  
> **状态**：详设。实现排在本篇合入之后，不并入已合的 US-HC-06。不关 #165，不关 #156。  
> **范围**：两条通道共用 `enrich-lead-contacts` 与 `hunter-api.domain_search` 的条数、筛选和翻页。  
> **依赖**：官方代调查找 [US-HC-01](US-HC-01-官方通道免配Key查找联系人.md)；自定义直连 [US-HC-04](US-HC-04-自定义通道仍自备Key直连.md)；契约 [附录 §2](US-HC-网关代调契约草案.md)。  
> **不做**：自由文本关键词；`job_titles`；穷举翻页；验邮开关语义（[US-HC-09](US-HC-09-验邮开关允许对关键人验证.md)）；抽屉（[US-HC-03](US-HC-03-抽屉单条验证跟随通道.md)）；新造网关路径或错误码；本篇改 `desktop/`、`website/` 或升版本号。  
> **索引**：[US-HC-官方通道网关代调Hunter.md](US-HC-官方通道网关代调Hunter.md)

---

## 1. 对应需求

用 Domain Search 找这家公司的关键联系人。传哪些查找参数、如何组合，由智能体决定。技能可以翻页，翻是为了找到关键人，禁止把一家公司的邮箱从头翻到尾。不设产品硬顶页数。

两条通道共用这一技能和 `domain_search`。官方仍走代调，自定义仍直连。凭证与计费口径不变（HC1、HC2、HC4）。写回 `people[]`、排序和空态与现网一致。

旧口径「`limit` 写死 10」「技能冻结 `DOMAIN_SEARCH_LIMIT = 10`」「工具不加 `offset`」已被本故事超越。实现按本篇，不再按旧口径编码。

## 2. 模块与界面

不新做页面。入口仍是线索页补全、批量补全、编排节点 `enrich-lead-contacts`。

技能提示（`workspace/skills/enrich-lead-contacts/SKILL.md`，以及 `buildEnrichLeadContactsPrompt` 里现在写死 `limit=10` 的那两句）必须改成下面这些约束，并删除常量 `DOMAIN_SEARCH_LIMIT`：

- 用 `domain_search` 找关键联系人。`limit`、`type`、`department`、`seniority`、`offset` 传哪些、如何组合，由当次判断决定。
- 不写死 `type=personal`，不写死 `limit` 为 10、25、30 或 50。
- 需要下一页时，再次调用工具并传入新的 `offset`。禁止把一家公司可能多达数千的邮箱从头翻到尾。
- 不设最多翻几页。官方通道非空查找页按次计费，翻页会增加官方通道费用。提示里写清楚。不出现单价，不写账本明细。

桌面提示删除 `domain_search（limit=10）`。翻页约束以技能为准，桌面提示复述上面四条，不要另写一套条数。

## 3. 数据与状态

### 工具入参

`hunter-api.domain_search`：

| 字段 | 规则 |
|------|------|
| `domain` | 必填。域名，不是 URL 或邮箱 |
| `limit` | 可选。整数 1–100。超出则拒绝该次调用，不要截成 10。未传则省略，不代填 10、25、30、50 |
| `type` | 可选。只允许 `personal` 或 `generic`。未传不默认 `personal` |
| `department`、`seniority` | 可选。非空字符串，多值逗号分隔。合法值由上游校验 |
| `offset` | 可选。非负整数。未传则省略。不设产品最大页 |

现网工具 schema（`workspace/mcp-servers/hunter-api/src/index.ts`）没有 `offset`，`limit` 带 `.default(10)`，描述写着 free plan caps at 10。实现删除该默认值和这句描述，并加上 `offset`。

`job_titles` 不加入入参，正文也不传。

### 缓存

仍是 24 小时，目录 `data/cache/hunter/domain-search/`，命中不出站。O3 已确认：命中则网关不收费。键不含 API Key，不含通道。自定义写入的缓存，24 小时内切到官方，参数相同则命中且不出站。

现网 `DomainSearchCacheKey`（`workspace/mcp-servers/hunter-api/src/cache.ts`）只有 `domain`、`limit`、`type?`、`department?`、`seniority?`。哈希原文五段：

`domain小写|limit|type或空|department或空|seniority或空`

没有 `offset`。不同页会命中同一份结果。实现改键，固定六段：

`domain小写|limit或空|type或空|department或空|seniority或空|offset`

- `domain` 仍转小写。`type` / `department` / `seniority` 仍按传入字符串，空和未传都是空串。
- 未传 `limit` 用空串，不要写成 10。
- 未传 `offset` 与 `offset=0` 是同一页，都写成 `0`。其他 `offset` 用十进制，互不命中。
- 哈希仍是这段原文的 sha256 十六进制前 16 位。读写仍走 `readDomainSearchCache` / `writeDomainSearchCache`。
- 未命中时直接出站。不按旧五段键再读一次。

验邮不加缓存。本故事不加。

### 写回

技能 Step 4～5 保持现网：无 `sources` 的条目已经由 MCP 丢掉；排序为 personal 优先于 generic、confidence 降序、有职位或角色优先、有姓名优先；`leads_patch_scored` 全量写入，`sync_valid_to_contacts: false`。不要按 10 条截断。`emails` 为空则如实说明，不编造。

`pagination_error` 不是余额不足。官方已是 400 `hunter_invalid_request` 且 `detail === "pagination_error"`，用户句「当前查找范围超出限制。」（`OFFICIAL_PAGINATION_ERROR`）。自定义仍映射 `HUNTER_PAGINATION_ERROR`，不要映射成 `HUNTER_QUOTA_EXCEEDED`。现网自定义句子写「免费计划 limit+offset ≤ 10」，这句把翻页说成超免费档，实现时删除这句原因，改成与官方相同的「当前查找范围超出限制」，不要引导充值。不新造错误码。

## 4. 调用链

```text
enrich-lead-contacts
  → hunter-api.domain_search（智能体选定的字段，一次调用一页）
  → HunterClient.domainSearch
       先读缓存；命中即返回
       官方未命中：POST {base}/hunter/domain-search
       自定义未命中：直连 https://api.hunter.io/v2/domain-search
  → trimDomainSearch → writeDomainSearchCache
  → 技能排序并 leads_patch_scored
```

下一页只发生在技能或智能体再次调用工具、并传入新的 `offset` 时。`HunterClient` 和 MCP 不读 `meta.results` 循环请求。网关不代翻页。

`base` 用 `getTokenGatewayBaseUrl` / 搜索侧 `getGatewayBaseUrl`（`hunter-api` 里是 `normalizeHunterGatewayBase`，规则相同）。值已含 `/v1`，只去末尾 `/`。URL 是 `{base}/hunter/domain-search`，不要再拼 `/v1`。头是 `Authorization: Bearer <FTCS_GATEWAY_API_KEY>`，不要给已是 `sk-` 的凭证再加前缀。

官方正文可以含调用方真正传入的 `limit`、`offset`、`type`、`department`、`seniority`。省略的字段不出现，不传 `null`。不传 `job_titles`、`api_key`、用户 Hunter Key。现网 `buildOfficialDomainSearchBody` 把缺省 `limit` 写成 10，并且没有 `offset`。删除这个代填。

自定义查询串传同一组可选字段，头仍是用户的 `X-API-Key`。不经网关，不扣官方余额。多 Key 与失败换 Key 保持 US-HC-04。

200 的校验、`meta.results` 缺失时的回退、`trimDomainSearch` 与计费判断保持契约附录：本页上游 `emails` 非空计一次，空页不计；裁掉无 `sources` 的条目不改变「这一页已经计费」。缓存命中不出站、不计费。每一页单独判断。没有跨请求幂等，翻到新的一页且该页非空，再计一次。

官方失败不重试、不回退 `api.hunter.io`。超时或断线不假定未计费。文案仍按 US-HC-07，不在本故事新造。

实现若改了技能或 `hunter-api`，同一次把 `desktop/electron/config/workspace-init.ts` 的 `WORKSPACE_TEMPLATE_VERSION` 换成新字符串（不要复用当前值），并打包 MCP。本详设不升该版本号。

现网测试若断言「正文永远没有 offset」或「只许 limit=10」，改成：未传则省略，传入则原样带上；单次调用不自动再请求。旧断言不再是规格。

## 5. 验收

- [ ] 两条通道都能由技能传入 `limit`（1–100）、`type` / `department` / `seniority`、`offset`。未传的字段不出现在请求里，值不是 `null`。
- [ ] 技能与桌面提示里没有 `DOMAIN_SEARCH_LIMIT`，也没有写死的 `limit=10` / 25 / 30 / 50，没有写死的 `type=personal`。
- [ ] `limit` 为 0、101 或非整数时，工具拒绝，请求体里不会变成 10。
- [ ] 一次 `domainSearch` 只出站一次（未命中缓存时）。不会因为 `meta.results` 再请求下一页。再次调用并传入更大的 `offset` 才请求那一页。
- [ ] 官方 URL 是 `{base}/hunter/domain-search`，不含 `/v1/v1/`。头是官方 sk。正文没有 `job_titles`、`api_key`、用户 Hunter Key。
- [ ] 自定义 host 仍是 `api.hunter.io`，同一组可选字段出现在查询串里。官方余额不因这次直连变化。
- [ ] 缓存键能区分域名、limit、offset、type、department、seniority。`offset` 缺省与 0 命中同一条；`offset=10` 不命中首页。键里没有 Key、没有通道。命中时出站 0 次。
- [ ] 未命中时不会再拿旧五段键去读。
- [ ] 官方非空页按次计费。翻一页且该页非空，是另一次费用。提示写了「翻页会增加官方通道费用」，没有单价和账本明细。
- [ ] `pagination_error` 的提示不是余额不足，也不是「免费计划 limit+offset ≤ 10」。
- [ ] `people[]` 全量写回，排序与空态与现网一致。
- [ ] 本篇 PR 不改 `desktop/`、`website/`，不升 `WORKSPACE_TEMPLATE_VERSION`。

## 6. 依赖与未决

| 项 | 说明 |
|----|------|
| US-HC-01 / 04 | 传输与凭证已在那两篇。本篇只加可传字段和翻页。代调失败文案仍归 US-HC-07 |
| 网关缺省 | 字段省略时，网关自己的缺省（草案曾写 `offset` 默认 0、`limit` 缺省 10）不是客户端要写死的产品限制。客户端不代填。技能应在需要时显式传 `limit` |
| 历史详设 | `docs/design/US-C-02`、`US-C-03` 与 `docs/reference/hunter-api` 仍写固定 `limit=10`。那是已交付记录。本篇不改它们。实现以本篇和契约附录 §2 为准 |
| 价目 | 不在本仓。提示只说翻页增加官方通道费用 |

---

## 修订记录

| 日期 | 说明 |
|------|------|
| 2026-11-17 | 初稿。放开查找参数与翻页，删除写死的 limit=10，缓存键补上 offset。Related #165。 |
