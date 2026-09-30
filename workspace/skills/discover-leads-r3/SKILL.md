---
name: discover-leads-r3
description: 执行 R3 地图发现：Google Places 按城市/品类找本地商户，补官网后打开公司站验证并写入 raw/R3.jsonl。用户说开始 R3、地图发现、discover-leads-r3 时使用。
phase: 1
inputs:
  - name: product_id
    type: string
    required: true
  - name: max_queries
    type: number
    required: false
outputs:
  - path: data/leads/{product_id}/raw/R3.jsonl
    schema: RawLead
  - path: data/exploration/{product_id}/runs/{run_id}.json
    schema: ExplorationRun
---

# discover-leads-r3

**R3 地图发现**：用 expansion 里的地图发现词，经 **Google Places API** 找本地商户 → 解析或补全 **公司官网** → **chrome 打开官网** 对照产品画像判断是否目标客户 → 通过才写入 `raw/R3.jsonl`。

```text
R3 词 → Places Search → 过滤 → Details(≤15) → 官网? → [无则 Tavily 补搜] → chrome 官网 → 判断 → lead_append_raw
```

发现层 **只用 Places**；补官网用 Tavily `search_web`（不带 `include_domains`）。**不**打开 Google 地图页面。

## 何时使用

- 画像 `ready`，且 `expansion.json` 含合格 **R3 词**（`round=R3`，无 `site_id`）
- 用户说「开始 R3」「地图发现」「discover-leads-r3」
- `GOOGLE_PLACES_API_KEY` 已配置（`places-api` MCP）；探索页「开始 R3」须 Preflight 通过

## 前置条件

- MCP：`lead-store`、`places-api`、`search-api`、`chrome-devtools`
- `data/products/{product_id}/profile.json` — `status == "ready"`
- `data/keywords/{product_id}/expansion.json` — 至少 1 条合格 R3 词

## 输入参数

| 参数 | 默认 | 说明 |
|------|------|------|
| `product_id` | 必填 | 产品 ID |
| `max_queries` | 全部合格 R3 词 | 按 priority 截断；验收可用 1～2 |

`exploration_start` 传 `rounds: ["R3"]`。

## 冻结常量

| 常量 | 值 | 说明 |
|------|-----|------|
| `PLACES_PAGE_SIZE` | **20** | `places_text_search.pageSize`；不翻页 |
| `MAX_DETAILS_PER_KEYWORD` | **15** | 每词 Place Details 上限 |

## 硬禁令

- **禁止**用 `search_web` + 地图 `include_domains` 作发现（发现只用 Places）。
- **禁止** chrome 打开 Google 地图（`google.com/maps`、`maps.google.com`、`goo.gl/maps` 等）。
- **禁止**在未打开官网并判断为「是」时 `lead_append_raw`。
- **禁止**未经 chrome 验证就把 Places `websiteUri` 写入 `company.website`。
- **禁止**把整段 Places JSON 写入 Lead；snippet 仅含 `place_id`、店名、地址。
- **禁止** query 含 `site:` / `intitle:` / `inurl:` / `filetype:`。

## `regionCode` 推断（可选）

传给 `places_text_search.regionCode`（ISO 3166-1 alpha-2）。推断不出则 **省略**。

**优先级：**

1. Query 中显式国家/地区词（如 `Germany`/`Deutschland`→`DE`，`Texas` 且美国语境→`US`）
2. 画像 `target_markets.countries` 仅 1 国 → 该国代码
3. `language` 辅助（**仅当** profile 国家唯一匹配；**禁止** DE+AT+CH 并存时单凭 `de` 猜）

| 语境 | `regionCode` |
|------|--------------|
| Germany / Deutschland | `DE` |
| United States / USA | `US` |
| United Kingdom / UK | `GB` |
| France | `FR` |
| Canada | `CA` |
| Australia | `AU` |
| Austria / Österreich | `AT` |
| Switzerland / Schweiz | `CH` |
| Netherlands | `NL` |
| Italy / Italia | `IT` |
| Spain / España | `ES` |

## 调用上限

| 上限 | 值 |
|------|-----|
| 每词 Text Search | 1（不翻页） |
| 每词 Place Details | 15 |
| 每词 Tavily 补官网 | `floor(本词 places_text_search 实际返回条数 × 0.75)`。已有官网的不补搜、不占次数。分母是 Search 返回的地点条数，不是 Details 条数 |
| 补官网 `num_results` | 任务指令中的 `search_num_results` |

先按 `max_queries` 截词，再套上表。已解析出的公司官网都打开并判断；同域名已有线索则跳过。不设每词、每轮的官网打开次数上限。

Tavily `DAILY_LIMIT_EXCEEDED` 或官方通道 402 → 立即停止并 `exploration_finish`。

Places `MISSING_PLACES_API_KEY` / 401 / 403 → **停止整任务**，提示设置 → 探索 → Places Key。

## POI / types 过滤

**黑名单**（`types` 任一命中且 **无** 白名单 type → 丢弃，不调 Details）：

`gas_station`, `parking`, `parking_garage`, `transit_station`, `bus_station`, `train_station`, `subway_station`, `light_rail_station`, `airport`, `heliport`, `atm`, `bank`, `church`, `mosque`, `synagogue`, `hindu_temple`, `hospital`, `doctor`, `dentist`, `pharmacy`, `school`, `primary_school`, `secondary_school`, `university`, `cemetery`, `funeral_home`, `police`, `fire_station`, `local_government_office`, `city_hall`, `courthouse`, `embassy`, `zoo`, `amusement_park`, `casino`, `stadium`

**白名单（辅助，非充分）**：`store`, `home_goods_store`, `hardware_store`, `furniture_store`, `flooring_store`, `general_contractor`, `electrician`, `plumber`, `moving_company`, `supplier`, `wholesaler`, `restaurant`, `shopping_mall`

另丢弃：空 `displayName`、纯泛称（如仅 "Parking"）、`businessStatus === "CLOSED_PERMANENTLY"`、地址与画像目标国家明显冲突、本 run 已处理过的 `placeId`。

过滤后按 Search **原顺序**取前 15 条调 Details。

## 不得当作官网的域名

校验 Places `websiteUri` 与 Tavily 结果时，host 去 `www.` 后：

**地图（硬禁）：** `google.com`（path 含 `/maps`）、`maps.google.com`、`goo.gl`（maps）、`business.google.com`

**社媒 / 平台：** `linkedin.com`, `facebook.com`, `fb.com`, `instagram.com`, `x.com`, `twitter.com`, `tiktok.com`, `youtube.com`, `wikipedia.org`, `reddit.com`, `quora.com`, `pinterest.com`, `amazon.`, `ebay.`

**目录 / 聚合：** `kompass.com`, `europages.`, `yellowpages.`, `yelp.com`, `crunchbase.com`, `dnb.com`, `bbb.org`

## Tavily 补官网消歧

无有效 `websiteUri` 时，用商户 `displayName`（可加画像国家/品类）做 `search_web`，**不传** `include_domains`。

从结果里选官网 URL，须同时满足：

1. 标题含公司核心词（与 `displayName` 一致或明显同一主体）
2. host 不属于上文「不得当作官网的域名」
3. 不像目录/黄页/新闻（Kompass、Europages、Yellow Pages、Crunchbase 列表、明显 `/news/` 文章）
4. 像公司自有站点（品牌域、首页或 about）

四条里任一条拿不准 → **跳过**该 candidate。

## 目标客户判断（打开官网后）

对照 `profile.json`，读 chrome 快照（必要时 `evaluate_script`）。

**写入 Lead（是）**，若满足 **大部分**：

- 公司类型符合 `buyer_personas.company_types`（distributor / importer / retailer / contractor 等）
- 国家/业务区域符合 `target_markets.regions`（若可判断）
- 网站业务与 `products` 相关（经销、使用、项目采购、进口）
- 不是纯资讯、招聘、政府站、明显竞品出口商官网

**跳过（否）**，若：

- 纯媒体/目录/个人博客
- 与产品完全无关
- 明显是同品类 **出口商/竞品**（非你的目标客户）
- 无法识别为公司网站
- 页面打不开、登录墙到空白、内容与 `displayName` 对不上

## 执行步骤

### Step 0：准备

1. `lead-store.product_get` — 画像 ready
2. `lead-store.keywords_get` — 读 `search_queries`
3. `search-api.search_usage` — 自定义通道查日配额；官方通道以余额为准
4. 筛合格 R3 词（Step 1）。若为 0：**不要** `exploration_start`，提示先 `expand-keywords`
5. `lead-store.exploration_start({ product_id, rounds: ["R3"] })` — 记住 `run_id`

计数：`search_calls`（Tavily 补官网）、`crawl_pages`（官网打开）、`leads_found`；汇报可加 `places_search_calls`、`places_details_calls`。

### Step 1：筛选 R3 词

- `round === "R3"`
- 无 `site_id`
- `query` 不含 `\b(site|intitle|inurl|filetype)\s*:`

按 `priority`：high → medium → low，取前 `max_queries` 条。向用户说明本次词数。

### Step 2：逐词 — Places 发现（不写 Lead）

#### 2a. Text Search

```
places-api.places_text_search({
  textQuery: search_query.query,
  languageCode: search_query.language,
  regionCode: <§regionCode 推断，可选>,
  pageSize: 20
})
```

- 成功：`places_search_calls` +1
- `MISSING_PLACES_API_KEY` / 401 / 403 → 停止整任务，`exploration_finish`，提示配 Key
- `PLACES_GATEWAY_NOT_READY` → 停止，提示网关未就绪或改 BYOK
- 其他错误 → 该词记 error，下一词
- **禁止** chrome

#### 2b. 本地过滤

对 `places[]` 应用 [POI / types 过滤](#poi--types-过滤) → `candidates[]`。

#### 2c. Place Details（≤15）

按顺序最多 15 次：

```
places-api.place_details({
  placeId: candidate.placeId,
  languageCode: search_query.language
})
```

- 成功：`places_details_calls` +1；失败跳过；同一 `placeId` 不重复调
- **禁止** `lead_append_raw`、**禁止** chrome

### Step 3：解析官网（仍不写 Lead）

对每个 Details 成功的 candidate：

**有 `websiteUri`：** 规范化 URL，host 不在黑名单 → `website_url`，进 Step 4。

**无或无效：** 若本词 Tavily 补搜次数还没达到 `floor(本词 places_text_search 实际返回条数 × 0.75)`：

```
search-api.search_web({
  query: "{displayName} official website {country_or_region?} {product_or_category?}",
  language: search_query.language,
  num_results: <任务指令 search_num_results>
})
```

按 [Tavily 补官网消歧](#tavily-补官网消歧) 选 URL；`search_calls` +1。失败 → 下一 candidate。

### Step 4：打开官网并判断

有 `website_url` 时：

1. `lead-store.lead_list_raw` — 按 **官网域名** 去重，该产品 raw 已有同域则跳过

```
chrome-devtools: new_page(url) 或 navigate_page → website_url
take_snapshot（必要时 evaluate_script）
```

`crawl_pages` +1。按 [目标客户判断](#目标客户判断打开官网后) 决策。否或打不开 → 不写 Lead。chrome 不可用 → 停止并提示启用 MCP。

### Step 5：写入（仅判断为「是」）

```
lead-store.lead_append_raw({
  product_id,
  round: "R3",
  lead: {
    query_id: search_query.id,
    run_id,
    company: {
      name: "<displayName，可用官网页校正>",
      website: "<打开过的官网 URL>",
      country: "...",
      description: "..."
    },
    source: {
      url: "<与 company.website 相同>",
      type: "tavily_search",
      snippet: "发现：place_id=<placeId>；<displayName>, <formattedAddress>"
    },
    match_reason: "<须具体：Places 如何发现 + 官网业务证据，禁止空泛>",
    contacts: [],
    raw_score: 70
  }
})
```

- `run_id` 与 Step 0 一致
- `source.snippet` **必须**以 `发现：place_id=` 开头
- `company.website` / `source.url` 为 **chrome 打开过的官网**，不是地图链
- `source.type` 固定 `tavily_search`
- `leads_found` +1

### Step 6：每词进度

```
lead-store.exploration_update({
  product_id,
  run_id,
  queries_executed: <累计>,
  leads_found: <累计>,
  search_calls: <累计 Tavily>,
  crawl_pages: <累计>,
  error: "<可选>"
})
```

`crawl_pages` 不计 Places、不计地图页。

### Step 7：完成与汇报

```
lead-store.exploration_finish({ product_id, run_id, status: "completed" })
```

0 条 Lead 也可 `completed`。

汇报：`run_id`、路径、`raw/R3.jsonl`；R3 词数、Places Search/Details 次数、Tavily/官网打开次数、写入数；跳过原因；1～3 条样例或「无新线索」；下一步 `score-and-dedupe`。

## 错误处理

| 情况 | 处理 |
|------|------|
| 无 expansion 或无合格 R3 词 | 提示先 `expand-keywords` |
| `MISSING_PLACES_API_KEY` | 停止；设置 → 探索 → Places Key |
| Places 401/403 | 停止；Key 无效或未启用 Places API (New) |
| `PLACES_GATEWAY_NOT_READY` | 停止；改 BYOK 或等官方网关 |
| 单词 Search 5xx/超时 | 该词 error，继续 |
| Details / Tavily / 官网失败 | 跳过 candidate |
| chrome 不可用 | 停止 |

## 数据约定

### RawLead — `data/leads/{product_id}/raw/R3.jsonl`

| 字段 | 说明 |
|------|------|
| `round` | `R3` |
| `company.website` / `source.url` | 已打开并判断过的官网 |
| `source.snippet` | `发现：place_id=…；店名, 地址` |
| `source.type` | `tavily_search` |
| `match_reason` | Places 发现 + 官网证据 |
| `query_id` / `run_id` | 搜索词与本次运行 |

### 探索运行 — `data/exploration/{product_id}/runs/{run_id}.json`

`rounds`: `["R3"]`。

### places-api

- Search：`textQuery` = expansion `query` 原样；`pageSize=20`
- Details：过滤后前 15 条；FieldMask 由 MCP 冻结
- 响应在 `content[0].text`；`error: true` 时读 `code` / `message`

## 示例对话

> 请对 prod_20260712_001 按 skill `discover-leads-r3` 执行，最多 1 个 R3 词。

## 流水线

- **上一步**：`expand-keywords`（含 6～12 条 R3 地图发现词）
- **下一步**：`score-and-dedupe`
