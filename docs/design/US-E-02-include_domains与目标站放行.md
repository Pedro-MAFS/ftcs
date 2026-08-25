# US-E-02 include_domains 与目标站放行设计

> **用户故事**：[../17-需求-业务效率工具.md](../17-需求-业务效率工具.md) · US-E-02  
> **状态**：编码已落地（桌面直连与官方请求已发 `include_domains` / `exclude_domains`；官方点收仍待网关透传）  
> **范围**：`search_web` 可传 `include_domains` 并到达 Tavily；带该参数时放行目标社媒 URL；不带时 R1 仍过滤社媒；丢掉个人主页路径；官方通道把同一字段交给网关  
> **依赖**：现网 `search-api`（自定义直连 Tavily；官方 `POST /v1/search`）；E-01 登记表的 `include_domains` 字符串（本故事只按原样传入，不改 yaml）  
> **不做**：抽公司 / 二次搜官网（E-03）；打开页面写线索（E-04）；「开始 R2」（E-05）；改 `discover-leads`；`include_raw_content` / `search_depth=advanced`；打开社媒真页  
> **文档位置**：`docs/design/`

---

## 0. 相对现网

| 现网 | **本期** |
|------|----------|
| `search_web` 只有 `query` / `language` / `num_results` | 增加可选 `include_domains: string[]` |
| 自定义 `searchTavily`、官方 `searchViaGateway` 请求体都不带站点限定 | 有值则写入 Tavily / 网关请求的 `include_domains` |
| `mapTavilyResults` → `shouldExcludeUrl` 整站丢掉 Facebook / Instagram / X / TikTok 等 | **站点收窄改由上游完成**：无 include 时请求带 `exclude_domains`；有 include 时只带 `include_domains`。MCP 不再按站点黑/白名单过滤。个人主页路径仍丢 |
| 缓存 key = `query\|language\|num_results` | key 必须带上规范化后的 `include_domains`，避免 R1 / R2 串缓存 |
| 无 UI、无 R2 Skill | **本故事仍无探索页按钮、不写 `discover-leads-r2`**。验收用 MCP `search_web` 直调 |

LinkedIn **本来就不在** `EXCLUDED_HOST_PATTERNS` 里。R1 主要靠 `discover-leads` 文案跳过「社交媒体」。本故事**不要**把 `linkedin.com` 加进黑名单，以免改变 R1 的 MCP 过滤面。R1 回归以 Facebook（在黑名单里）为准。

---

## 1. 已确认选型

| 项 | 决定 |
|----|------|
| **Q1 工具参数** | 只加 `include_domains`。**不加** `site_id`。`site_id` → 域名列表的查找留给 E-03 Skill（读 E-01 登记表）。E-02 手工验收直接传入 yaml 里的字符串，如 `["linkedin.com/company"]` |
| **Q2 空值** | `undefined`、缺省、`[]`、去掉空串后为空 → 与现网相同，**不**把该字段发给 Tavily/网关 |
| **Q3 过滤顺序** | 上游：有 include 传 `include_domains`，无 include 传 `exclude_domains`（直连与官方网关相同）。MCP：非法 URL 丢 → 个人主页路径丢。不再本地按站点黑名单/include 前缀收窄 |
| **Q4 个人主页** | 即使 include 命中也丢。Must：`linkedin.com/in/`、`linkedin.com/pub/`。Should：`facebook.com/profile.php`、`facebook.com/people/`、`facebook.com/groups/`。不在本故事对 Instagram 用户名做「公司/个人」分类 |
| **Q5 缓存** | `buildCacheKey` 增加 include 段：排序、小写、去空白后加入 hash。同一 query 有/无 include 不得撞 key |
| **Q6 官方通道** | `searchViaGateway` 请求 JSON **原样带上** `include_domains`（有值时）。网关须转到 Tavily 后，官方路径才能点收。网关未透传 ≠ 桌面没传 |
| **Q7 自定义可先收** | 自定义直连 Tavily 的 A 组用例通过即可把 **自定义路径**标完成。官方路径单独勾选，依赖 token-gateway |
| **Q8 谁调用** | 本故事不改探索页、不改 `discover-leads`。开发用 MCP 直调或单测；E-03 起由 R2 Skill 每条词传**该词 `site_id` 对应的** `include_domains`（通常 1 个站点、1～N 条域名） |

---

## 2. 目标与非目标

### 2.1 目标

1. 调用 `search_web({ query, include_domains: ["linkedin.com/company"] })` 时，自定义通道请求体含该数组，且返回里可以出现 `linkedin.com/company/...`。  
2. `include_domains: ["facebook.com"]` 时，返回里可以出现 `facebook.com` 公共页 URL，**不会**被现网黑名单整站丢掉。  
3. 不传 `include_domains` 时，Facebook 等仍被过滤（R1 回归）。  
4. `linkedin.com/in/` 即使在 include 为 `linkedin.com` 或 `linkedin.com/company` 时也不出现在 `results`。  
5. 官方通道桌面/MCP 把同一字段放进 `POST /v1/search`；网关透传后官方与自定义行为一致。

### 2.2 非目标

| 不做 | 归属 |
|------|------|
| 从 `site_id` 读 yaml、写 R2 Skill | US-E-03 |
| 打开任何页面、写 Lead | E-03 / E-04 |
| 「开始 R2」 | US-E-05 |
| 给 `discover-leads` 加 R2 或删「跳过社交媒体」 | 已否决兼跑；R1 Skill 保持现网 |
| 扩黑名单（补 `instagram.com` 无 www 等历史空洞） | 非本故事；无 include 时黑名单字节级保持现网 |
| `include_raw_content` / `search_depth=advanced` | 缓做（17 §5.6） |
| 实现 token-gateway 转发 | 网关仓库；本详设只定桌面请求字段 |

---

## 3. `search_web` 契约

[`workspace/mcp-servers/search-api/src/index.ts`](../../workspace/mcp-servers/search-api/src/index.ts)

```ts
{
  query: z.string(),
  language: z.string().default("en"),
  num_results: z.number().int().min(1).max(10).default(5),
  include_domains: z.array(z.string().min(1).max(200)).max(10).optional(),
}
```

规范化（handler 内、写缓存前）：

- trim；丢掉空串  
- 小写  
- 去掉开头的 `https://` / `http://` / `www.`（只规范化比较与 cache key；**发给 Tavily 的字符串用登记表原样**，见下）  
- 去重  

**发给上游的值**：与 E-01 yaml 条目一致，便于路径前缀生效。推荐编码时：校验用规范化；`POST` body 使用调用方传入、trim 后的原始列表（调用方应按登记表传，如 `linkedin.com/company` 而不是 `https://www.linkedin.com/company`）。非法项（含空格、无点号的纯词）整次调用失败，返回 `SEARCH_FAILED` / 明确 message，不要静默丢。

`include_domains` 有值时写入：

- 自定义：[`searchTavily`](../../workspace/mcp-servers/search-api/src/tavily.ts) 的 JSON，与现网字段并列（`query`、`search_depth: "basic"`、`max_results`、`include_answer: false`、`include_raw_content: false`）。  
- 官方：[`searchViaGateway`](../../workspace/mcp-servers/search-api/src/gateway.ts) 的 JSON，与现网 `query` / `max_results` / `search_depth` / `language` 并列。**仍然不要**传 `api_key`、`num_results`、`include_answer`。

无值时请求体与现网字节级兼容（不要发 `include_domains: []`）。

编码时同步改 [06-MCP工具规范.md](../06-MCP工具规范.md) `search_web` 示例、[search-api README](../../workspace/mcp-servers/search-api/README.md)、[15-官方搜索通道对接.md](../15-官方搜索通道对接.md) §6「请求要点」加可选 `include_domains`。

search-api `package.json` version **递增**（现 0.4.1），以便工作区同步 `dist/mcp.js`（与 E-01 lead-store 同样问题）。

---

## 4. 结果过滤

站点黑/白名单 **不要**在 [`mapTavilyResults`](../../workspace/mcp-servers/search-api/src/tavily.ts) 里做，改由 Tavily 请求字段：

- R1：`exclude_domains` = `TAVILY_EXCLUDE_DOMAINS`（Facebook / Google / Wikipedia 等）
- R2：只传该词的 `include_domains`，**不要**同时传 `exclude_domains`

[`buildSearchDomainFilters`](../../workspace/mcp-servers/search-api/src/tavily.ts) 直连与官方网关共用。

### 4.1 include 原样发给上游

登记表字符串原样进入 `include_domains`（如 `linkedin.com/company`）。路径前缀是否生效由 Tavily 决定，MCP 不再二次按前缀丢掉「站外」URL。

### 4.2 个人主页（Must / Should）

域名排除表达不了路径，MCP 仍丢：

| 模式 | 级别 |
|------|------|
| `linkedin.com` 且 path 以 `/in/` 或 `/pub/` 开头 | Must 丢 |
| `facebook.com` 且 path 以 `/people/`、`/groups/` 开头，或 path 为 `/profile.php` | Should 丢 |

### 4.3 与黑名单

黑名单只作为 R1 的 `exclude_domains` 发给上游。有 include 时不发排除列表，以便 Facebook 等出现在 R2 结果里。

`mapTavilyResults` 仍最多 10 条、重排 `position`。

---

## 5. 缓存

[`cache.ts`](../../workspace/mcp-servers/search-api/src/cache.ts) `buildCacheKey(query, language, numResults, includeDomains?: string[])`。

include 段：规范化、排序、`"none"`（无 include）与 `"a.com,b.com"` 区分。

`readCache` / `writeCache` 签名一并加上。旧缓存文件 key 不含 include ≡ `none`，与今日 R1 一致，不必迁移。

---

## 6. 官方网关

桌面侧（本仓库）编码完成即：**有 include 时 JSON 一定带该字段**。

网关（`token-gateway`，不在本故事编码范围）需要：

- 接受可选 `include_domains: string[]`  
- 原样传给 Tavily `include_domains`  
- 忽略未知字段的旧网关 = 官方 E-02 **不能点收**

契约补丁写在网关 `US-G5-*` / `docs/15`；本文件与 [15-官方搜索通道对接.md](../15-官方搜索通道对接.md) 交叉引用，不在桌面详设里复制价目。

手工验官方路径：抓 MCP 出站 body 含 `include_domains`；再在网关日志或 Tavily 侧确认转发。只看到桌面传了、网关丢了 → 记「桌面完成、官方阻断在网关」。

---

## 7. 与 E-01 / E-03 衔接

| 故事 | 本故事提供 | 本故事不提供 |
|------|------------|--------------|
| E-01 | 登记表里的 `include_domains` 字符串原样可传给本工具 | 不读 prefs、不出词 |
| E-03 | 可调用已放行社媒结果的 `search_web` | 不写 Skill、不抽公司。E-03 对每条 R2 词：查 `site_id` → yaml 的 `include_domains` → 本工具。无 `site_id` 的旧 R2 词跳过，不当 E-02/E-03 样本 |
| E-03 二次搜官网 | 不传 `include_domains`，走现网黑名单 | — |
| `discover-leads` | 不改。R1 调用不传 include，Facebook 仍被 MCP 过滤 | 不删 Skill 里「跳过社交媒体」 |

不要在 E-02 把 yaml 解析搬进 search-api。避免 MCP 依赖探索配置；E-03 再决定是 Skill 读文件还是抽共享模块。

---

## 8. 界面

无新 UI。设置页「探索」站点开关仍只影响**下次出词**（E-01），不调用本故事的搜索。

---

## 9. 验收用例

自定义通道（Must，可点收本故事自定义路径）：

| # | Given | When | Then |
|---|--------|------|------|
| A1 | 自定义 + Tavily Key | `search_web`：`query` 为产品/买家句，`include_domains: ["linkedin.com/company"]` | 出站 Tavily JSON 含该数组；`results` 中可出现 company 路径 URL；无 `linkedin.com/in/` |
| A2 | 同上 | `include_domains: ["facebook.com"]` | 出站含 `facebook.com`；`results` 可出现 facebook 公共页；无 `profile.php` / `/people/` / `/groups/`（若上游给了则被过滤掉） |
| A3 | 同上 | **不传** `include_domains`，query 故意容易命中 Facebook | `results` 无 `facebook.com`（现网黑名单） |
| A4 | 同一 `query`+language+num | 一次无 include、一次有 include | 两次缓存文件不同；有 include 的结果不是「无 include 缓存里滤掉社媒后的那份」 |
| A5 | include 为 `linkedin.com/company` | 上游混入 `linkedin.com/in/foo` 或 `https://example.com` | 这两类都不在最终 `results` |
| A6 | `include_domains: []` 或全空串 | 调用 | 与不传相同，请求体无该字段 |

官方通道（Must 才能宣称「官方 E-02 完成」；网关未就绪可暂缓）：

| # | Given | When | Then |
|---|--------|------|------|
| G1 | 官方通道已开通 | 同 A1 的 `search_web` | 出站 `POST {gateway}/v1/search` JSON 含 `include_domains` |
| G2 | 网关已透传到 Tavily | 同 A1 | 行为与自定义 A1 一致（可出现 company URL） |

单测（不打网、Must）：R1 请求含 `exclude_domains` 且含 `facebook.com`；R2 请求含 `include_domains` 且不含 `exclude_domains`；`linkedin.com/in/` 仍被 MCP 丢掉；cache key 随 include 变化。

---

## 10. 编码任务顺序

1. `tavily.ts`：include 匹配、个人路径、`mapTavilyResults` 选项；单测。  
2. `cache.ts`：key 纳入 include；单测。  
3. `searchTavily` / `searchViaGateway` / `search_web` 入参与透传；非法 include 报错。  
4. 递增 search-api 版本并 `npm run build`（同步用户区 `dist/mcp.js`）。  
5. 更新 06 / 15 / search-api README。  
6. 自定义通道走 A1–A6；官方有网关则走 G1–G2。17 号本条改为「编码已落地」（官方未透传则在故事里注明「自定义已落地，官方待网关」）。

---

## 11. 已确认点汇总

| # | 议题 | 决定 |
|---|------|------|
| Q1 | 工具字段 | 仅 `include_domains`，无 `site_id` |
| Q2 | 空数组 | 等同不传 |
| Q3 | 过滤 | include 收窄 + 个人路径；无 include 保持现网黑名单 |
| Q4 | 个人页 | LinkedIn `/in/` `/pub/` 必丢；Facebook profile/people/groups 丢 |
| Q5 | 缓存 | key 含 include |
| Q6 | 官方 | 桌面必传；点收依赖网关转发 |
| Q7 | 收口 | 自定义可先完成 |
| Q8 | UI / Skill | 本故事都没有 |
