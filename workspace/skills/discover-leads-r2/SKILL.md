---
name: discover-leads-r2
description: 执行 R2 社媒发现：按站点 include_domains 搜索，从摘要抽公司并解析官网，打开官网按 R1 口径判断后写入 raw/R2.jsonl。用户说开始 R2、社媒获客、discover-leads-r2 时使用。不要用 discover-leads 跑 R2。
phase: 1
inputs:
  - name: product_id
    type: string
    required: true
  - name: max_queries
    type: number
    required: false
outputs:
  - path: data/leads/{product_id}/raw/R2.jsonl
    schema: RawLead
  - path: data/exploration/{product_id}/runs/{run_id}.json
    schema: ExplorationRun
---

# discover-leads-r2

基于关键词中的 **R2 社媒渠道词**执行获客：Tavily（带 `include_domains`）搜社媒摘要 → 抽公司名并解析稳定官网 → chrome 只打开**公司官网** → 按 R1 口径判断 → 通过才写入 `raw/R2.jsonl`。

**不要**调用 skill `discover-leads`，也不要给它传 `rounds: ["R2"]`。R1 / R2 不共用同一份 Skill。

## 何时使用

- 产品画像与关键词扩展已完成，且 expansion 里有带 `site_id` 的 R2 词
- 用户说「开始 R2」「社媒获客」「按 discover-leads-r2 执行」
- 探索页「开始 R2」接通前（US-E-05），在 Cursor / OpenCode 直调本 Skill

## 前置条件

- MCP `lead-store`、`search-api`、`chrome-devtools`（user-chrome-devtools）已配置
- `data/products/{product_id}/profile.json` 存在且 `status == "ready"`
- `data/keywords/{product_id}/expansion.json` 已生成，且至少有 1 条合格 R2 词（`round=R2` 且有可解析的 `site_id`）
- 工作区有 `config/explore-r2-sites.yaml`（读不到则用下文对照表）

## 输入参数

| 参数 | 默认 | 说明 |
|------|------|------|
| `product_id` | 必填 | 产品 ID |
| `max_queries` | 全部合格 R2 词 | 按 priority 截断；验收可用 1～3 |

本 Skill **固定只跑 R2**。不要接受 `rounds` 去跑 R1。

`exploration_start` 必须传 `rounds: ["R2"]`。

## 硬禁令

- **禁止**对社媒 URL 调用 chrome-devtools（`new_page` / `navigate_page`）。社媒只使用 Tavily 的 title / url / content。
- **禁止**在未打开官网并判断为「是」时调用 `lead_append_raw`。
- **禁止**把 `facebook.com` / `linkedin.com` 等社媒域名当作 `company.website` 或去重键。
- **禁止**在 query 里写 `site:` / `intitle:` / `inurl:` / `filetype:`。站点限定只用 `include_domains`。

## `site_id` → `include_domains`

读取 `config/explore-r2-sites.yaml`，按词上的 `site_id` 取 `include_domains` 数组，**原样**传给 `search_web`。文件与下表冲突时 **以 yaml 为准**。

| `site_id` | `include_domains` |
|-----------|-------------------|
| `linkedin_company` | `["linkedin.com/company"]` |
| `facebook_page` | `["facebook.com"]` |
| `instagram` | `["instagram.com"]` |
| `x` | `["x.com"]` |
| `tiktok` | `["tiktok.com"]` |

yaml 中找不到该 `site_id`、或 `include_domains` 为空 → **跳过该词**，不当验收样本。无 `site_id` 的旧 R2 词同样跳过。

**不要**按设置页 prefs 再过滤：prefs 只影响下次扩展出词；本次以 expansion 里已有的合格 R2 词为准。

## 上限（必须遵守）

| 上限 | 值 |
|------|----|
| 每词社媒 `num_results` | 5 |
| 每词二次搜索（无 include 的 `search_web`） | 2 |
| 每轮二次搜索 | 20 |
| 每词官网打开（chrome） | 2 |
| 每轮官网打开 | 15 |

先按 `max_queries` 截词，再在词内套上表。达到「每轮官网打开」后，即使又解析出官网也 **不打开、不写 Lead**。

日限额 `DAILY_LIMIT_EXCEEDED` 或官方通道 402 → 立即停止，`exploration_finish` 保存进度，告知用户。

## 执行步骤

### Step 0：准备

1. `lead-store.product_get` — 确认画像 ready
2. `lead-store.keywords_get` — 读取 `search_queries`
3. `search-api.search_usage` — 自定义通道确认日配额；官方通道以余额为准
4. 读取 `config/explore-r2-sites.yaml`
5. 筛出合格 R2 词（见 Step 1）。若数量为 0：**不要** `exploration_start`，提示先运行 `expand-keywords` 并确认设置页启用了社媒站点
6. `lead-store.exploration_start({ product_id, rounds: ["R2"] })` — 记住 `run_id`

维护计数：`search_calls`、`resolve_searches`（二次搜）、`crawl_pages`（仅官网打开）、`leads_found`、本词二次搜次数、本词官网打开次数。

### Step 1：筛选 R2 词

从 `search_queries` 筛选：

- `round === "R2"`
- 有非空 `site_id`，且 yaml/对照表能得到非空 `include_domains`

按 `priority`：`high` → `medium` → `low`。取前 `max_queries` 条。

向用户说明：本次 N 个 R2 词及各 `site_id`；被跳过的旧格式词（无 `site_id`）数量即可。

### Step 2：逐词 — 社媒搜索与解析官网（E-03）

对每个搜索词执行 2a～2c。**本 Step 不得 `lead_append_raw`。**

#### 2a. 社媒搜索

```
search-api.search_web({
  query: search_query.query,
  language: search_query.language,
  num_results: 5,
  include_domains: <该 site_id 的数组>
})
```

- `search_calls` +1
- **禁止**对返回 URL 调用 chrome

#### 2b. 从摘要抽公司

只使用每条结果的 `title`、`url`、`snippet`/`content`（最多 5 条）。

**丢弃（不进入 2c）：**

- 个人主页：LinkedIn `/in/`、`/pub/`；Facebook `profile.php`、`/people/`、`/groups/`；标题为「某人 - Job Title」且无公司主体
- 看不出公司名（只有产品名、话题、招聘、小组）
- 公司名是平台本身（LinkedIn、Meta、Facebook）

**抽出公司名：** 优先 title 去掉 ` | LinkedIn` / ` | Facebook` 等后缀；其次 snippet 中的组织名。必须是可用来搜官网的具体名称（允许 GmbH / Ltd / Inc）。不要用个人姓名去搜「某人公司」。

| 来源 | 倾向保留 | 倾向丢弃 |
|------|----------|----------|
| LinkedIn | `/company/...` 且 title 像组织名 | `/in/`、`/pub/`、招聘帖、个人顾问页 |
| Facebook | 公共主页 / 品牌页 | `profile.php`、`/people/`、`/groups/` |
| Instagram / X / TikTok | 能读出公司/品牌名的公共账号摘要 | 纯个人网红、无法对应公司 |

#### 2c. 解析稳定官网

**已有疑似官网**（snippet/content 里的 `http(s)` 链接，或明确 `website: example.com`）：

- host 去掉 `www.` 后不得属于下方「不得当作官网的域名」
- 路径像公司首页或公司根域（`/`、`/en`、短 path）；目录站、新闻文章不当官网

通过 → 得到 `website_url` 与 `social_url`（本条社媒结果 URL），进入 Step 3。本条 **不**二次搜索。

**没有官网：** 若本词二次搜 < 2 且本轮二次搜 < 20：

```
search-api.search_web({
  query: "{company_name} official website {country_or_region?} {product_or_category?}",
  language: search_query.language,
  num_results: 5
})
```

- **不要**传 `include_domains`
- `search_calls` +1，`resolve_searches` +1
- `company_name` 必有；国家来自画像 `target_markets.regions` 或摘要里已出现的国家词，没有则省略；品类来自画像主产品短名，没有则省略
- query **禁止** Google 运算符

对二次结果从上到下找**第一条同时满足**的：

1. 标题或 snippet 包含公司名核心词（允许法律后缀差异）
2. URL 不是「不得当作官网的域名」
3. 不像目录 / 黄页 / 新闻（Kompass、Europages、Yellow Pages、Crunchbase 列表页、明显 `/news/` 文章）
4. 像公司自己的站点（品牌域、首页或 about）

多条都像但指向不同注册公司（同名不同国家）→ 全部不用，跳过。一条明显更好（国家与画像一致 + 域名像品牌）→ 用那一条。拿不准 → **不猜**，跳过。

解析失败 → `exploration_update` 带 `error` 短句（公司名 + 原因），处理下一条社媒结果。解析失败只结束**本条社媒结果**，不是整词结束。

**不得当作官网的域名**（host 去 `www.` 后等于或为其后缀）：

`linkedin.com`、`facebook.com`、`fb.com`、`instagram.com`、`x.com`、`twitter.com`、`tiktok.com`、`youtube.com`、`wikipedia.org`、`google.`、`reddit.com`、`quora.com`、`pinterest.com`、`amazon.`、`ebay.`

### Step 3：打开官网并判断（E-04）

仅当 Step 2 得到 `website_url`。打开前：

1. `lead-store.lead_list_raw`（不要只查 R2，合并已有 R1/R2）按 **官网域名** 去重；已有则跳过，不打开
2. 本词官网打开 < 2 且本轮 < 15；否则不打开、不写 Lead

使用 **chrome-devtools-mcp**，目标必须是 `website_url`（官网），**禁止**传入社媒 URL：

```
new_page(url) 或 navigate_page
→ take_snapshot（必要时 evaluate_script 提取公司名、业务、国家、公开邮箱）
```

`crawl_pages` +1（只要尝试打开过官网）。

**智能体判断**是否目标客户（口径与 `discover-leads` Step 2b 相同）：

**是**，若满足大部分条件：

- 公司类型符合 `buyer_personas.company_types`（distributor / importer / retailer / contractor 等）
- 国家/业务区域符合 `target_markets.regions`（若可判断）
- 网站业务与 `products` 相关（经销、使用、项目采购、进口）
- 不是纯资讯、招聘、政府、明显竞品官网

**否**，若：

- 纯媒体/目录/个人博客
- 与产品完全无关
- 明显是中国同类出口商（竞品而非客户）
- 无法识别为公司网站
- 页面打不开、登录墙到空白、不是该公司

打不开或否 → **不写** Lead，只记跳过。

chrome-devtools 不可用 → 停止本轮，提示启用 MCP，`exploration_finish`（failed 或 completed 并说明未判断）。

### Step 4：写入（仅判断为「是」）

```
lead-store.lead_append_raw({
  product_id,
  round: "R2",
  lead: {
    query_id: search_query.id,
    run_id,
    company: {
      name: "<抽出的公司名，可用官网页校正>",
      website: "<打开过的官网 URL>",
      country: "...",
      description: "..."
    },
    source: {
      url: "<与 company.website 相同：打开并判断过的官网页>",
      type: "tavily_search",
      snippet: "发现：<社媒 URL> <可选：社媒摘要一句>"
    },
    match_reason: "<须具体：社媒上如何发现 + 官网页上何种业务证据，禁止空泛>",
    contacts: [],
    raw_score: 70
  }
})
```

- `run_id` **必须**与 Step 0 一致
- `source.snippet` **必须**以 `发现：` 开头并带上社媒 URL
- `company.website` 与 `source.url` 必须是官网，不得是社媒
- `contacts` 仅官网上公开的邮箱/电话等；没有就 `[]`
- 本 Skill **不**调用 `leads_score_and_dedupe`（用户之后按产品跑现网评分即可）
- `leads_found` +1

### Step 5：每词进度

每完成一个 search_query：

```
lead-store.exploration_update({
  product_id,
  run_id,
  queries_executed: <累计>,
  leads_found: <累计>,
  search_calls: <累计>,
  crawl_pages: <累计>,
  error: "<可选，本词跳过摘要>"
})
```

`crawl_pages` 只计官网打开，不计社媒。

### Step 6：完成与汇报

```
lead-store.exploration_finish({
  product_id,
  run_id,
  status: "completed"
})
```

即使 0 条 Lead（全程未通过官网判断）也允许 `completed`。

向用户展示：

- `run_id` 与保存路径（`data/leads/{product_id}/raw/R2.jsonl`、`data/exploration/{product_id}/runs/`）
- 执行 R2 词数 / 社媒搜索次数 / 二次搜索次数 / 官网打开次数 / 写入线索数
- 跳过原因分布（个人页 / 无公司名 / 解析失败 / 已存在域名 / 判断否 / 达上限）
- 3～5 条写入样例（公司名 + 官网 + match_reason 一句），或明确「无新线索」
- 下一步：`score-and-dedupe`

## 错误处理

| 情况 | 处理 |
|------|------|
| 无 expansion.json 或无合格 R2 词 | 提示先运行 `expand-keywords`，并确认设置页启用了社媒站点 |
| yaml 读不到 | 用上文对照表；仍找不到 `site_id` 则跳过该词 |
| `DAILY_LIMIT_EXCEEDED` / 官方 402 | 停止，保存进度，告知用户 |
| 社媒搜索失败 | 该词记 error，继续下一词；连续失败可 `finish` failed |
| 官网超时 / 打不开 | 跳过该候选，不写 Lead |
| chrome-devtools 不可用 | 停止，提示启用 MCP |

## 数据约定

### 原始线索 RawLead

路径：`data/leads/{product_id}/raw/R2.jsonl`

| 字段 | 说明 |
|------|------|
| `round` | 固定 `R2` |
| `company.website` / `source.url` | **已打开并判断过的官网页** |
| `source.snippet` | 以 `发现：{社媒 URL}` 开头 |
| `source.type` | `tavily_search` |
| `match_reason` | 社媒发现依据 + 官网页业务证据 |
| `query_id` / `run_id` | 来自搜索词与本次 `exploration_start` |

### 探索运行

路径：`data/exploration/{product_id}/runs/{run_id}.json`  
`rounds` 为 `["R2"]`。

### search-api 要点

- 社媒搜：必须带该站 `include_domains`
- 二次搜官网：不带 `include_domains`（走现网社媒黑名单）
- 空数组不要传 `include_domains`

## 示例对话

> 请对 prod_20260712_001 按 skill `discover-leads-r2` 执行，最多 2 个搜索词。

> 基于已有 R2 渠道词，从 LinkedIn 公司页 / Facebook 公共主页发现潜在客户，只打开解析出的官网。

## 流水线

- 上一步：`expand-keywords`（R2 词须带 `site_id`）
- 下一步：`score-and-dedupe`
- 并列：R1 仍用 `discover-leads`；探索页「开始 R2」由 US-E-05 接线
