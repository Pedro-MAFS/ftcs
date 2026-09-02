# US-E-08 R3 Skill：Places 发现、补官网、官网判断写入

> **用户故事**：[../17-需求-业务效率工具.md](../17-需求-业务效率工具.md) · US-E-08  
> **状态**：编码已落地（待手工 P1–W5 验收）  
> **范围**：新增独立 Skill **`discover-leads-r3`**。对 R3 词做 Places Text Search → 本地过滤 → 限量 Place Details → 解析/校验官网（无则 Tavily 补）→ 打开**官网**按 R1 口径判断 → 通过才写入 `raw/R3.jsonl`  
> **依赖**：US-E-06（R3 出词）；US-E-07（`places-api` MCP custom）；现网 `search-api.search_web`（Tavily 补官网）；`chrome-devtools`；`lead-store`  
> **不做**：探索页「开始 R3」与 Preflight（US-E-09）；`agent-runner` 接线；改 `discover-leads` / `discover-leads-r2`；打开 Google 地图真页；Places 响应单独落线索；`ExplorationRun.api_usage` 扩展 Places 计数字段（缓做）  
> **文档位置**：`docs/design/`

---

## 0. 相对现网（US-E-07 之后）

| 现网 | **本期（E-08）** |
|------|------------------|
| 有 R3 词预览，无 R3 执行 Skill | 新 Skill **`discover-leads-r3`** 可 Cursor / OpenCode 直调 |
| `places-api` MCP 可手工调工具 | Skill **编排** Search → Details → Tavily → chrome → `lead_append_raw` |
| R1/R2 各自独立 Skill | R3 **禁止**给 `discover-leads` / `discover-leads-r2` 加 `rounds=["R3"]` 分支 |
| 无 `raw/R3.jsonl` 写入路径 | 判断通过写入 `data/leads/{product_id}/raw/R3.jsonl`，`round=R3` |
| 探索页无「开始 R3」 | **本故事仍不接按钮**；验收用 Cursor 直调 Skill（与 E-03 点收 R2 同理） |

管道与 R2 **同构三步**（17 §5.7）：Places 发现 → 解析官网（含 Tavily 补）→ 打开官网 R1 判断。**缺任一步不写 Lead**。

---

## 1. 已确认选型

| 项 | 决定 |
|----|------|
| **Q1 Skill 名称** | **`discover-leads-r3`**。禁止 `discover-leads` / `discover-leads-r2` 兼跑 R3 |
| **Q2 执行哪些词** | 只跑 `round === "R3"` 且 **无** `site_id` 的词。带 `site_id`、含 Google 运算符 → **跳过**。不按设置页再滤（与 E-06 一致） |
| **Q3 Places 工具** | **`places-api.places_text_search`**、**`places-api.place_details`**。**禁止**用 `search_web` + 地图 `include_domains` 作发现 |
| **Q4 `textQuery`** | 与 expansion `search_query.query` **原样**对齐（E-06 已保证为合法 Places 自然语言句） |
| **Q5 `languageCode`** | 用关键词 `search_query.language`（BCP-47，如 `de`、`en`） |
| **Q6 `regionCode`** | Skill 从画像 + query 推断 ISO 3166-1 alpha-2（见 [§4](#4-regioncode-推断)）；推断不出则 **省略**（仍可调 Search） |
| **Q7 `pageSize`** | **冻结 20**（与 E-07 / 预研一致；不翻页）。写入 Skill 常量，**本故事不做设置页** |
| **Q8 `max_details_per_keyword`** | **冻结 N = 15**（预研候选 10/15/20；首发取中间值平衡 Details 成本与 website 覆盖率）。过滤后候选按 Search 返回顺序取前 N 条调 Details（见 [§7.3](#73-details-上限与顺序)） |
| **Q9 中间产物** | **不**新增 `r3-candidates.jsonl`。解析出的「商户 + 官网候选」仅在当次运行内存中进入官网判断段 |
| **Q10 补官网** | Places 无可用 `websiteUri` 时，调 **`search_web`（无 include_domains）**，走现网 R1/R2 **同一搜索通道**（自定义 Tavily / 官方 gateway）。**禁止**把 Places 参数传给 Tavily |
| **Q11 判断口径** | **复制** `discover-leads` Step 2b 是/否标准（与 R2 E-04 相同策略：正文复制，保持同步） |
| **Q12 去重** | chrome 打开前：`lead_list_raw` 按**官网域名**跳过已有线索（可合并 R1/R2/R3 raw）。**禁止**用 `place_id` 单独去重键；域名为主 |
| **Q13 `source.type`** | 继续 **`tavily_search`**（与 R2 相同：不扩展 lead-store 枚举；发现路径写在 snippet / match_reason） |
| **Q14 Places Key** | E-08 **不做**桌面 Preflight。MCP 返回 `MISSING_PLACES_API_KEY` 时 Skill **整任务停止**并提示配置 Key（E-09 再在按钮前拦截） |
| **Q15 本故事怎么跑** | `product_id` + 可选 `max_queries`。Cursor：「请严格按 skill `discover-leads-r3` 执行」 |

---

## 2. 目标与非目标

### 2.1 目标

**前半（Places 发现 + 解析官网，不得写 Lead）**

1. 对每条合格 R3 词：`places_text_search` → 本地过滤 → 最多 N 次 `place_details`。  
2. **禁止** chrome 打开地图 URL、Places 列表页或任何 `google.com/maps` 域。  
3. 有 `websiteUri` 则校验（不得为地图/社媒/目录域）；无则 Tavily 二次搜（公司名 + 可选国家/品类）。  
4. 看不清商户主体、纯 POI、解析失败 → 丢弃该候选。  
5. 本段结束 **不得** `lead_append_raw`。

**后半（官网判断 + 写入）**

6. 仅对前半产出的稳定官网 URL 调 chrome-devtools。  
7. 判断规则与 R1 相同；通过才 `lead_append_raw`，`round=R3`。  
8. `source.url` / `company.website` = **打开并判断过的官网**；Places 发现信息仅进 `source.snippet` 前缀。  
9. 不跑 `score-and-dedupe`（与 R1/R2 相同，用户后续手动评分）。

### 2.2 非目标

| 不做 | 归属 |
|------|------|
| 探索页「开始 R3」、`buildDiscoverLeadsR3Prompt`、任务列表标 R3 | US-E-09 |
| Preflight 弹窗、未配 Key 时隐藏 MCP | US-E-09 |
| `provider=gateway` Places（MCP 占位，**E-10 无限期延后**） | 不实现 |
| Geocoding / `locationBias` 封装 | 缓做；E-08 用 `textQuery` + `regionCode` |
| 设置页暴露 `pageSize` / N | 已确认：Skill 常量；与 E-07 讨论结论一致 |
| 扩展 `ExplorationRun.api_usage` 的 Places 计数 | 缓做；汇报中口头统计 Places 调用次数 |
| 改 R1/R2 Skill 或合并三轮到同一 Skill | 已否决 |
| 打开地图真页；把 `websiteUri` 未验证直接写 Lead | 17 §5.7 禁止 |

---

## 3. Skill 契约

路径：[workspace/skills/discover-leads-r3/SKILL.md](../../workspace/skills/discover-leads-r3/SKILL.md)（编码时新建）。

### 3.1 Front matter

```yaml
name: discover-leads-r3
description: 执行 R3 地图发现：Places Text Search 与 Details 找本地商户，无官网则 Tavily 补，打开官网按 R1 口径判断后写入 raw/R3.jsonl。用户说开始 R3、地图发现、discover-leads-r3 时使用。不要用 discover-leads 或 discover-leads-r2 跑 R3。
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
```

`rounds` **不要**做成可传 R1/R2 的参数。本 Skill 固定只处理 R3。`exploration_start` 传 `rounds: ["R3"]`。

### 3.2 输入

| 参数 | 默认 | 说明 |
|------|------|------|
| `product_id` | 必填 | 与 R1/R2 相同 |
| `max_queries` | 全部合格 R3 词 | 按 priority 排序后截断。验收用 1～2 条即可 |

### 3.3 前置条件

- MCP：`lead-store`、`places-api`、`search-api`、`chrome-devtools`  
- 画像 `status == ready`  
- `keywords_get` 中至少 1 条合格 R3 词  
- `places-api` 可用（E-07）；无 Key 时工具会报错 — 见 [§11](#11-错误处理)  
- **不要**调用 `discover-leads` / `discover-leads-r2`

### 3.4 与 R1/R2 Skill 的分工

| | `discover-leads` | `discover-leads-r2` | **`discover-leads-r3`** |
|--|------------------|---------------------|-------------------------|
| 词 | `round=R1` | `round=R2` + `site_id` | `round=R3`，无 `site_id` |
| 发现 | Tavily 广域搜 | Tavily + `include_domains` | **Places** Text Search + Details |
| chrome 打开 | 搜索结果 URL | **只打开公司官网** | **只打开公司官网** |
| 补官网 | — | Tavily 无 include | Tavily 无 include（Places 无 website 时） |
| 写入 | `raw/R1.jsonl` | `raw/R2.jsonl` | **`raw/R3.jsonl`** |

---

## 4. `regionCode` 推断

`places_text_search` 的 `regionCode` **可选**；能推断则传，提高地理相关性。

**优先级（高 → 低）：**

1. **Query 中显式国家/地区词** → 映射 alpha-2（如 `Germany`/`Deutschland`→`DE`，`Texas` 句内仍有 `United States` 语境 → `US`）。  
2. **画像 `target_markets.countries`**：仅 1 个国家 → 用该国 alpha-2。  
3. **关键词 `language` 辅助**（仅当 profile 国家列表唯一匹配时）：如 `language=de` 且 profile 只有 `Germany` → `DE`；**禁止**在 profile 含 DE+AT+CH 时单凭 `de` 瞎猜。  
4. 仍无法确定 → **不传** `regionCode`。

**常用映射（Skill 正文附表，编码时从下列复制）：**

| 画像 / query 语境 | `regionCode` |
|-------------------|--------------|
| Germany / Deutschland / 德国 | `DE` |
| United States / USA / Texas / California | `US` |
| United Kingdom / UK / England | `GB` |
| France | `FR` |
| Canada | `CA` |
| Australia | `AU` |
| Austria / Österreich | `AT` |
| Switzerland / Schweiz | `CH` |
| Netherlands | `NL` |
| Italy / Italia | `IT` |
| Spain / España | `ES` |

---

## 5. Places 参数（Skill 内冻结常量）

| 常量 | 值 | 说明 |
|------|-----|------|
| `PLACES_PAGE_SIZE` | **20** | 传给 `places_text_search.pageSize`；不翻页 |
| `MAX_DETAILS_PER_KEYWORD` | **15** | 每词 Details 上限 N；见 [§7.2](#72-details-上限与顺序) |
| `PLACES_PROVIDER` | 不由 Skill 设置 | 运行时 env；custom（E-07）或 gateway（E-10） |

**成本提示（写入 Skill「何时使用」脚注）：** 每词约 1× Search Pro + 最多 15× Details Enterprise；超出 GCP 免费额度后详预研 §5.4。Tavily 补官网另计 `search_calls`。

---

## 6. 执行步骤（Skill 正文按此写）

### Step 0：准备

1. `lead-store.product_get` — 画像 ready  
2. `lead-store.keywords_get` — 取 `search_queries`  
3. `search-api.search_usage` — Tavily 日限额 / 官方余额提示（与 R1/R2 相同）  
4. `lead-store.exploration_start({ product_id, rounds: ["R3"] })` — 记住 `run_id`  
5. 内部计数器（汇报用，可选）：`places_search_calls`、`places_details_calls` 置 0  

**本 Step 不调用 Places**（除非 Step 1 立即开始）；若需冒烟可先调一次 `places_text_search` 验证 Key — 验收时再做。

### Step 1：筛选 R3 词

- `round === "R3"`  
- **无** `site_id`（有则跳过，标「旧格式/非 R3」）  
- `query` 不含 `\b(site|intitle|inurl|filetype)\s*:`  
- 按 `priority`：high → medium → low  
- 取前 `max_queries` 条  

向用户说明：本次 N 个 R3 词；跳过的不合格词数量即可。

### Step 2：逐词 — Places 发现（**不得写 Lead**）

对每个 R3 搜索词：

#### 2a. Text Search

```
places-api.places_text_search({
  textQuery: search_query.query,
  languageCode: search_query.language,
  regionCode: <§4 推断，可选>,
  pageSize: 20
})
```

- 成功：`places_search_calls` +1；读 `places[]`（无 `websiteUri`，E-07 设计）  
- `error` + `MISSING_PLACES_API_KEY` → **停止整任务**，`exploration_finish`，提示设置 → 探索  
- `PLACES_HTTP_ERROR`（401/403）→ 同上，提示 Key 无效或未启用 Places API (New)  
- `PLACES_GATEWAY_NOT_READY` → 停止，提示 E-10 未就绪或改 custom Key  
- 其他 HTTP/解析错误 → 该词记 `exploration_update.error`，**继续下一词**

#### 2b. 本地过滤（Search 结果，每条 place 摘要）

对 `places[]` 每一项，**在进入 Details 前**过滤。

**丢弃：**

| 条件 | 说明 |
|------|------|
| 空 `displayName` 或纯泛称（如仅 "Parking"、"ATM"） | 无公司主体 |
| `businessStatus === "CLOSED_PERMANENTLY"` | 永久关闭 |
| `types` 命中 **POI 黑名单**（[§7.1](#71-types--poi-黑名单)）且 **无** [§7.2 商户白名单](#72-商户-types-白名单辅助) type | 非目标商户 |
| `formattedAddress` 与画像目标国家 **明显冲突**（能判断时） | 地理错误 |
| 同一 `placeId` 本 run 已处理过 | 去重 |

**保留倾向：** 含 [§7.2 商户 types 白名单](#72-商户-types-白名单辅助) 中 type；或 title 像本地商户/公司。

过滤后列表记为 `candidates[]`（顺序保持 Search 原序）。

#### 2c. Place Details（限量）

对 `candidates` **按顺序**最多 **`MAX_DETAILS_PER_KEYWORD`（15）** 条：

```
places-api.place_details({
  placeId: candidate.placeId,
  languageCode: search_query.language
})
```

- 每条成功：`places_details_calls` +1  
- Details 失败 → 跳过该 candidate，继续下一个  
- **禁止**对同一 `placeId` 二次 Details  

合并 Search + Details 得到：`placeId`、`displayName`、`formattedAddress`、`websiteUri?`。

**本 Step 仍不得** `lead_append_raw`、**不得** chrome 打开任何 URL。

### Step 3：解析稳定官网（**仍不得写 Lead**）

对每个 Details 成功的 candidate：

#### 3a. Places 已有 `websiteUri`

- 规范化 URL；host 不得属于 [§9.1 不得当作官网的域名](#91-不得当作官网的域名)  
- 通过 → `website_url` + `company_name`（默认 `displayName`，官网页可后校正）→ Step 4  

#### 3b. 无 `websiteUri` 或 URI 无效

若本词 **Tavily 二次搜索**次数未达 [§10 上限](#10-上限与配额)：

```
search-api.search_web({
  query: <§9.2 模板>,
  language: search_query.language,
  num_results: 5
})
```

- **不传** `include_domains`  
- `search_calls` +1（计入 exploration_update）  
- 对结果做 [§9.3 消歧](#93-消歧)（与 R2 相同规则，公司名换 `displayName`）  
- 拿不准 → 跳过该 candidate  

解析失败 → `exploration_update` 可选 `error` 短句；处理下一 candidate。

### Step 4：打开官网并判断（**与 R2 Step 3 / R1 Step 2b 对齐**）

仅当 Step 3 得到 `website_url`。

打开前：

1. `lead_list_raw` 查重：**官网域名**已存在 → 跳过  
2. 本词 / 本轮 chrome 打开次数未超 [§10](#10-上限与配额)

```
chrome-devtools: new_page(url) 或 navigate_page → website_url
take_snapshot（必要时 evaluate_script）
```

**禁止：**

- 打开 `google.com/maps`、`maps.google.com`、`goo.gl/maps` 或任何地图 UI  
- 打开 Places 返回页当官网  
- 把未打开的 `websiteUri` 直接写入 Lead  

**判断标准（与 `discover-leads` Step 2b 一致，编码时从 R1 Skill 复制保持同步）：**

**是**，若满足大部分条件：

- 公司类型符合 `buyer_personas.company_types`  
- 国家/业务区域符合 `target_markets.regions`（若可判断）  
- 网站业务与 `products` 相关（经销、使用、项目采购、进口）  
- 不是纯资讯、招聘、政府、明显中国出口竞品官网  

**否**，若：

- 纯媒体/目录/个人博客  
- 与产品完全无关  
- 明显是中国同类出口商（竞品而非客户）  
- 无法识别为公司网站  
- 页面打不开、登录墙到空白、不是该公司  

打不开或否 → 不写 Lead；`crawl_pages` +1（尝试过打开）。

### Step 5：写入（仅判断为「是」）

```
lead-store.lead_append_raw({
  product_id,
  round: "R3",
  lead: {
    query_id: search_query.id,
    run_id,
    company: {
      name: "<displayName 或官网页校正>",
      website: "<打开过的官网 URL>",
      country: "...",
      description: "..."
    },
    source: {
      url: "<与 company.website 相同>",
      type: "tavily_search",
      snippet: "发现：place_id=<placeId>；<displayName>, <formattedAddress>"
    },
    match_reason: "<须具体：地图/Places 如何发现 + 官网页业务证据；禁止空泛>",
    contacts: [...],
    raw_score: 70
  }
})
```

**snippet 格式（冻结，对齐预研 §4.5 / R2「发现：」前缀）：**

```text
发现：place_id=ChIJxxx；Example Bodenbelag GmbH, Example Str. 1, München, Germany
```

- `place_id` **必须**在 snippet 中（Places 政策允许持久化）  
- **不得**把整段 Places JSON 写入 snippet  
- 可选在 snippet 后半追加一句 Tavily 摘要（若走过补官网）

`run_id` 必须与 Step 0 一致。`leads_found` +1。

### Step 6：每词进度

```
lead-store.exploration_update({
  product_id,
  run_id,
  queries_executed,
  leads_found,
  search_calls,    // 仅 Tavily（补官网）
  crawl_pages,     // 仅官网打开
  error            // 可选
})
```

`crawl_pages` **不计** Places 调用、**不计**地图页（从未打开）。

### Step 7：结束与汇报

`exploration_finish({ status: "completed" })`。允许 0 条 Lead。

向用户汇报：

- `run_id`、R3 词数  
- **Places**：Text Search 次数、Details 次数（内部计数）  
- **Tavily**：`search_calls`（补官网）  
- **chrome**：官网打开次数、写入线索数  
- 跳过原因分布（POI / 关店 / 无官网 / 目录域 / 去重 / 判断否）  
- 1～3 条写入样例或明确「无新线索」  
- 下一步：`score-and-dedupe`（与 R1/R2 相同）

---

## 7. Places 过滤细则

### 7.1 types / POI 黑名单

`types` 数组 **任一命中**下列且 **不**含 [§7.2 商户白名单](#72-商户-types-白名单辅助) 时 → 丢弃：

```
gas_station, parking, parking_garage, transit_station, bus_station,
train_station, subway_station, light_rail_station, airport, heliport,
atm, bank, church, mosque, synagogue, hindu_temple, hospital, doctor,
dentist, pharmacy, school, primary_school, secondary_school, university,
cemetery, funeral_home, police, fire_station, local_government_office,
city_hall, courthouse, embassy, zoo, amusement_park, casino, stadium
```

**说明：** 预研 spike 后仍可微调；编码时以 Skill 正文表为准。若明显是「建材城/卖场」但 types 噪声大，**以 displayName + 地址 + 后续官网为准**，不要机械丢光。

### 7.2 商户 types 白名单（辅助）

下列 type **倾向保留**（与其他信号结合，非充分条件）：

```
store, home_goods_store, hardware_store, furniture_store, flooring_store,
general_contractor, electrician, plumber, moving_company, supplier,
wholesaler, restaurant, shopping_mall  // mall 内单店仍可能有效，谨慎
```

### 7.3 Details 上限与顺序

- Search 返回 ≤20 → 过滤后 `candidates`  
- Details 调用 = `min(len(candidates), 15)`，**严格按 Search 顺序**  
- 不对过滤掉的条目调 Details  
- 不对同一 `placeId` 重复 Details  

---

## 9. 解析官网（Tavily 补官网）

### 9.1 不得当作官网的域名

在 **3a 校验 `websiteUri`** 与 **9.3 消歧** 中均适用。host 去 `www.` 后：

**地图（R3 硬禁）：**

- `google.com`（path 含 `/maps`）  
- `maps.google.com`  
- `goo.gl`（maps 短链）  
- `business.google.com`  

**社媒 / 平台（与 R2 §7.1 相同）：**

`linkedin.com`、`facebook.com`、`fb.com`、`instagram.com`、`x.com`、`twitter.com`、`tiktok.com`、`youtube.com`、`wikipedia.org`、`reddit.com`、`quora.com`、`pinterest.com`

**目录 / 聚合（ extensible ）：**

`kompass.com`、`europages.`、`yellowpages.`、`yelp.com`、`crunchbase.com`、`dnb.com`、`bbb.org`

以及 E-02 Tavily 黑名单同类站点。

### 9.2 二次搜索 query 模板

```text
{displayName} official website {country_or_region?} {product_or_category?}
```

- `{displayName}` = Places `displayName`（商户名）  
- 国家：画像 `target_markets` 或地址中已有国家词  
- 品类：画像主产品短名，可省略  
- **禁止** Google 运算符  

### 9.3 消歧

与 [US-E-03+04 §7.3](US-E-03+04-R2-Skill抽公司与官网判断.md#73-消歧) **相同规则**（标题含公司核心词、非黑名单域、非目录新闻、像品牌官网）。公司名改用 Places `displayName`。

---

## 10. 上限与配额

与 R2 对齐，便于 Agent 预算；**Places 调用不受下表限制**（仅受 N=15 / 词与 GCP 配额约束）。

| 上限 | 值 | 说明 |
|------|-----|------|
| 每词 Text Search | **1** | 不翻页 |
| 每词 Place Details | **15** | `MAX_DETAILS_PER_KEYWORD` |
| 每词 Tavily 补官网 | **2** | 无 `include_domains` 的 `search_web` |
| 每轮 Tavily 补官网 | **20** | 达到后不再补搜，无官网则跳过 |
| 每词官网打开（chrome） | **2** | |
| 每轮官网打开 | **15** | 达到后不再打开，后续解析成功也不写 |
| 每词 Tavily `num_results` | 5 | 补官网搜索 |

Tavily `DAILY_LIMIT_EXCEEDED` / 官方 402 → 停止探索，与 R1/R2 相同。  
Places 401/403 → 视为 Key 问题，**停止整任务**（非仅 skip 一词）。

`max_queries` 与上表独立：先截词，再在词内套用。

---

## 11. 错误处理

| 情况 | 处理 |
|------|------|
| 无合格 R3 词 | 不 start 或 start 后立即 finish；提示重新扩展关键词 |
| `MISSING_PLACES_API_KEY` | **停止**；提示设置 → 探索 → Places Key |
| `PLACES_HTTP_ERROR` 401/403 | **停止**；Key 无效或未开 API |
| `PLACES_GATEWAY_NOT_READY` | **停止**；E-10 或改 BYOK |
| 单词 Search 失败（5xx/超时） | 该词 error，继续下一词 |
| 单词 Details 失败 | 跳过该 candidate |
| Tavily 补搜失败 | 跳过该 candidate |
| chrome 不可用 | **停止**（E-08 完整验收必需 chrome） |
| 官网超时 | 跳过该 candidate |

---

## 12. 写入与去重

### 12.1 字段

见 Step 5。编码时在 [03-数据模型.md](../03-数据模型.md) 原始线索节补一句：

> R3：`source.url` / `company.website` 为打开过的官网；地图发现信息写在 `source.snippet` 的 `发现：place_id=…` 前缀中。

### 12.2 评分

本 Skill 不调用 `leads_score_and_dedupe`。去重键为 **官网域名**（`company.website`）。

### 12.3 合规

- 仅持久化 `place_id`、店名、地址（snippet）；不存 photo/rating/整段 Places JSON  
- 最终官网必须 chrome 验证，**不用** Places `websiteUri`  alone 落库  

---

## 13. 界面与 E-09 边界

**本故事无 UI。** 不改 `ExploreView`、不加「开始 R3」、不改 `agent-preflight`（E-09）。

E-09 将：

- 增加「开始 R3」按钮  
- `agent-runner` 新 prompt：`请严格按 skill discover-leads-r3`  
- Preflight：无 Places Key / 网关未就绪 → 禁止启动  
- 任务 `skill` 字段标 `discover-leads-r3`  

本详设不规定按钮文案。

---

## 14. 验收用例

开发期 **Cursor / OpenCode 直调 Skill**；须配置有效 `GOOGLE_PLACES_API_KEY`（E-09 前手工保证）。

### 14.1 Places 发现段（Must）

| # | Given | When | Then |
|---|--------|------|------|
| P1 | 合格 R3 德区词 + 有效 Key | `places_text_search` | `textQuery` 与 expansion 一致；`pageSize=20`；未调 chrome |
| P2 | P1 返回 ≥1 条 | 过滤 + Details | Details 次数 ≤15；不对黑名单 POI 调 Details |
| P3 | Details 无 website | Tavily 补搜 | `search_web` **无** include_domains；`search_calls` +1 |
| P4 | 全程 | 地图 URL | **从未** chrome 打开 google.com/maps |
| P5 | 解析全部失败 | 结束 | `raw/R3.jsonl` 无新行 |

### 14.2 官网判断与写入（Must）

| # | Given | When | Then |
|---|--------|------|------|
| W1 | 有稳定官网 | chrome 打开 | 判断口径与 R1 一致 |
| W2 | 判断通过 | `lead_append_raw` | `round=R3`；`source.url`=官网；snippet 以 `发现：place_id=` 开头 |
| W3 | 判断否或打不开 | — | 不写 raw |
| W4 | 官网域名已在 raw | 打开前 | 跳过 |
| W5 | 无 Key | 任一词 Search | 任务停止，`MISSING_PLACES_API_KEY` 类提示 |

### 14.3 回归

| # | Then |
|---|------|
| R1 | `discover-leads` / `discover-leads-r2` 行为不变 |
| R2 | R3 词不会被 R1/R2 Skill 执行 |
| R3 | `places-api` 工具 FieldMask 仍符合 E-07（Search 无 websiteUri） |

---

## 15. 编码任务顺序

1. 新建 `workspace/skills/discover-leads-r3/SKILL.md`（全文 Step 0～7 + 黑名单表 + 上限表）。  
2. 更新 [05-智能体技能规范.md](../05-智能体技能规范.md) 清单 + `discover-leads-r3` 小节。  
3. [03-数据模型.md](../03-数据模型.md) 补 R3 snippet 约定（一句）。  
4. 工作区模板同步：新 Skill 目录；若需强制用户区拉取则 **bump `WORKSPACE_TEMPLATE_VERSION`**（与 E-07 places-api 可同批或另开）。  
5. **手工 P1–W5**；更新 [17 号需求](../17-需求-业务效率工具.md) US-E-08 状态为「编码已落地」。  
6. **不在本故事**改 `agent-runner.ts` / 探索页（E-09）。

---

## 16. 相关文档

- 需求 §5.7 / §14：[../17-需求-业务效率工具.md](../17-需求-业务效率工具.md)  
- R3 出词：[US-E-06-按渠道出R3词与文案.md](US-E-06-按渠道出R3词与文案.md)  
- Places MCP：[US-E-07-Places-MCP自定义Key.md](US-E-07-Places-MCP自定义Key.md)  
- 预研 / 计费 / N 讨论：[R3-Places-API-预研.md](R3-Places-API-预研.md)  
- R2 管道参考：[US-E-03+04-R2-Skill抽公司与官网判断.md](US-E-03+04-R2-Skill抽公司与官网判断.md)  
- R1 判断原文：[../../workspace/skills/discover-leads/SKILL.md](../../workspace/skills/discover-leads/SKILL.md)  
- 探索按钮 / Preflight：[US-E-09-探索页开始R3与Preflight.md](US-E-09-探索页开始R3与Preflight.md)
