# US-E-03 + US-E-04 R2 Skill：抽公司、解析官网、判断写入

> **用户故事**：[../17-需求-业务效率工具.md](../17-需求-业务效率工具.md) · US-E-03、US-E-04  
> **状态**：编码已落地（探索页「开始 R2」仍待 US-E-05）  
> **范围**：新增独立 Skill `discover-leads-r2`。对 R2 词做社媒搜索（`include_domains`）→ 从摘要抽公司 → 解析稳定官网 → 打开**官网**按 R1 口径判断 → 通过才写入 `raw/R2.jsonl`  
> **依赖**：US-E-01（R2 词 + `site_id` + 登记表）；US-E-02（`search_web` 的 `include_domains` 与目标站放行）。官方通道仍依赖网关透传 include（与 E-02 相同）  
> **不做**：「开始 R2」按钮与 `agent-runner` 接线（US-E-05）；改 `discover-leads`；打开社媒真页；无官网也写 Lead；人员主页建线索（US-C）；`include_raw_content` / `search_depth=advanced`  
> **文档位置**：`docs/design/`

---

## 0. 相对现网

| 现网 | **本期** |
|------|----------|
| 只有 `discover-leads`：搜完立刻 chrome 打开**搜索结果 URL** | 新 Skill：搜的是社媒；chrome **只打开解析出的公司官网** |
| R1 跳过「社交媒体」 | R2 必须吃社媒摘要；个人主页仍丢（MCP 已滤一层，Skill 再滤一层） |
| `search_web` 不带站点（R1） | 每条 R2 词：`site_id` → yaml 的 `include_domains` → `search_web` |
| 线索只进 `raw/R1.jsonl`（开始 R1） | 判断通过进 `raw/R2.jsonl`，`round=R2` |
| 探索页只能启动 `discover-leads` | **本故事仍不接按钮**；验收用 Cursor / OpenCode 直调 Skill（与 E-02 直调 MCP 同理） |

E-03 与 E-04 是**同一份 Skill 的前后段**，不是两个 Skill。中间候选不落新 jsonl（见 Q3）。用户故事仍分开点收。

---

## 1. 已确认选型

| 项 | 决定 |
|----|------|
| **Q1 名称** | `discover-leads-r2`。禁止给 `discover-leads` 加 `rounds=["R2"]` 分支 |
| **Q2 谁读 yaml** | Skill 读工作区 `config/explore-r2-sites.yaml`（与 E-01 同一文件）。**不**把解析搬进 search-api；**不**为本故事新增 MCP 工具。E-05 再在桌面 prompt 里注入 `site_id → include_domains` 表（与 `expand-keywords` 同类），本故事不改 runner |
| **Q3 中间产物** | 不新增 `r2-candidates.jsonl`。解析出的「公司名 + 官网」只在当次运行内存中进入 E-04。E-03 可观测点：向用户汇报解析成功/跳过；`exploration_update.error` 记跳过原因；**未进入官网判断则不得 `lead_append_raw`** |
| **Q4 社媒 URL 存哪** | **不改** RawLead Schema、不扩展 `source.type`。`company.website` 与 `source.url` 都指向**已打开并判断过的官网页**（与 R1、17 §5.5 一致）。社媒发现 URL 写入 `source.snippet` 开头：`发现：{social_url}`，其余仍可接 Tavily 摘要。`match_reason` 须同时点出社媒来源与官网页证据 |
| **Q5 执行哪些词** | 只跑 `round=R2` 且带合法 `site_id` 的词。无 `site_id` 的旧 R2、yaml 中找不到的 `site_id`、空 `include_domains` → **跳过该词**，不当验收样本。不按设置页 prefs 再滤一遍（prefs 只影响下次出词，与 E-01 一致） |
| **Q6 二次搜索** | 摘要里没有可用官网时，再调一次 `search_web`，**不传** `include_domains`。计入同一配额。query 用公司名 + 可选国家/品类，禁止再写 `site:` |
| **Q7 上限** | 见 [§9](#9-上限与配额)。靠 Skill 遵守；本故事不做 MCP 硬拦次数 |
| **Q8 判断口径** | **复制** `discover-leads` Step 2b 的是/否标准进 R2 Skill，不改 R1 Skill 一字。两边只对齐口径，不互相调用 |
| **Q9 去重** | chrome 打开官网前：`lead_list_raw` 按**官网域名**跳过已有线索。禁止用 `facebook.com` / `linkedin.com` 当公司去重键（`source.url` 不是社媒） |
| **Q10 本故事怎么跑** | `product_id` + 可选 `max_queries`。开发验收在 Cursor 说「按 skill `discover-leads-r2` 执行」。E-05 再接到探索页 |

---

## 2. 目标与非目标

### 2.1 目标

**E-03（Skill 前半，不得写 Lead）**

1. 对每条合格 R2 词：`search_web({ query, language, num_results: 5, include_domains })`，`include_domains` 来自该词 `site_id` 对应登记表条目。  
2. 不打开任何社媒 URL。只根据 title / url / content 抽公司名。  
3. 个人主页、看不清公司 → 该条丢弃。  
4. 摘要里已有疑似官网：排除社媒自身域名后可作为候选。  
5. 没有官网：二次 `search_web`（无 include），消歧后得到稳定官网或跳过。  
6. 解析失败或触达上限 → 该条结束，**不** `lead_append_raw`。

**E-04（Skill 后半）**

7. 仅对 E-03 产出的官网调用 chrome-devtools。判断规则与 R1 相同。  
8. 通过才 `lead_append_raw`，`round=R2`，写入 `data/leads/{product_id}/raw/R2.jsonl`。  
9. 官网打不开或不是买家 → 不写 raw，只记跳过。  
10. 评分不加来源加权（沿用现网六维，本 Skill 不跑 `score-and-dedupe`）。

### 2.2 非目标

| 不做 | 归属 |
|------|------|
| 探索页「开始 R2」、任务列表标 R2、预检接线 | US-E-05 |
| 改 `discover-leads` 或删「跳过社交媒体」 | 已否决兼跑 |
| 打开领英 / Facebook / Instagram 真页 | 17 §5.5；缓做/不做 |
| 无官网也写 Lead；个人主页建成公司线索 | 已否决 |
| 新增 RawLead 字段或 `source.type` 枚举值 | 本故事用 snippet 约定 |
| 把 yaml 解析做成 MCP | E-05 最多 prompt 注入；非必须 |
| 改 R1 判断口径 | R2 只复制 |

---

## 3. Skill 契约

路径：[workspace/skills/discover-leads-r2/SKILL.md](../../workspace/skills/discover-leads-r2/SKILL.md)（编码时新建）。

### 3.1 Front matter

```yaml
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
```

`rounds` **不要**做成可传 R1 的参数。本 Skill 固定只处理 R2。`exploration_start` 传 `rounds: ["R2"]`。

### 3.2 输入

| 参数 | 默认 | 说明 |
|------|------|------|
| `product_id` | 必填 | 与 R1 相同 |
| `max_queries` | 全部合格 R2 词 | 按 priority 排序后截断。E-05 再决定探索页默认值；本故事验收用 1～3 即可 |

### 3.3 前置条件

- MCP：`lead-store`、`search-api`、`chrome-devtools`（E-04 段需要；E-03 点收前半可不打开页，但完整 Skill 仍声明需要 chrome）  
- 画像 `status == ready`  
- `keywords_get` 中存在至少 1 条合格 R2 词；否则停止并说明先扩展关键词 / 启用站点后再扩展  
- **不要**调用 `discover-leads`

### 3.4 与 `discover-leads` 的分工

| | `discover-leads` | `discover-leads-r2` |
|--|------------------|---------------------|
| 词 | `round=R1` | `round=R2` 且有 `site_id` |
| 搜索 | 不传 `include_domains` | 传该站 `include_domains` |
| chrome 打开 | 搜索结果 URL（跳过社媒） | **只打开公司官网** |
| 写入 | `raw/R1.jsonl` | `raw/R2.jsonl` |

共用 MCP，不共用 Skill 正文。

---

## 4. `site_id` → `include_domains`

1. 读取 `config/explore-r2-sites.yaml`（工作区相对路径；与 [explore-r2-sites.yaml](../../workspace/config/explore-r2-sites.yaml) 一致）。  
2. 按 `search_query.site_id` 取 `include_domains` 数组，**原样**传给 `search_web`（例如 `["linkedin.com/company"]`），不要改写成 `site:`，也不要补 `https://`。  
3. Skill 正文附一张与 yaml 同步的对照表，防止模型漏读文件；**冲突时以 yaml 为准**。

现网默认表（编码时从仓库复制，勿手改含义）：

| `site_id` | `include_domains` |
|-----------|-------------------|
| `linkedin_company` | `linkedin.com/company` |
| `facebook_page` | `facebook.com` |
| `instagram` | `instagram.com` |
| `x` | `x.com` |
| `tiktok` | `tiktok.com` |

E-02 已保证：MCP 侧会丢掉 `linkedin.com/in/`、`/pub/` 以及 Facebook 个人/小组路径。Skill 仍须把「看起来是个人」的结果丢掉，不依赖 MCP 100% 清干净。

---

## 5. 执行步骤（Skill 正文按此写）

### Step 0：准备

1. `lead-store.product_get` — 画像 ready  
2. `lead-store.keywords_get` — 取 `search_queries`  
3. `search-api.search_usage` — 日限额（自定义通道）；官方通道以网关余额为准，失败码按现网处理  
4. 读 `config/explore-r2-sites.yaml`  
5. `lead-store.exploration_start({ product_id, rounds: ["R2"] })` — 记住 `run_id`

### Step 1：筛选 R2 词

- `round === "R2"`  
- 有非空 `site_id` 且能在 yaml 里查到非空 `include_domains`  
- 按 `priority`：high → medium → low  
- 取前 `max_queries` 条  

向用户说明：本次 N 个 R2 词、各 `site_id`。列出被跳过的旧格式词（无 `site_id`）数量即可，不必逐条展开。

### Step 2：逐词 — 社媒搜索与解析官网（**US-E-03**）

对每个搜索词：

#### 2a. 社媒搜索

```
search-api.search_web({
  query: search_query.query,
  language: search_query.language,
  num_results: 5,
  include_domains: <yaml 中该 site_id 的数组>
})
```

- `DAILY_LIMIT_EXCEEDED` / 官方 402 → 停止，`exploration_finish` 保存进度，告知用户  
- `search_calls` +1  
- **禁止**对返回 URL 调用 chrome / `navigate_page` / `new_page`

#### 2b. 从摘要抽公司（每条结果，最多 5 条）

只使用 `title`、`url`、`snippet`/`content`。

**丢弃（不进入 2c）**

- URL 或标题明显是个人主页（LinkedIn `/in/` `/pub/`；Facebook `profile.php` / `/people/` / `/groups/`；标题为「某人 - Job Title」且无公司主体）  
- 看不出公司名（只有产品名、话题、招聘、小组）  
- 公司名是平台本身（LinkedIn、Meta、Facebook）

**抽出公司名**：优先 title 去站点后缀（` | LinkedIn`、` | Facebook`）；其次 snippet 中的组织名。必须是可用来搜官网的具体名称（允许 GmbH / Ltd / Inc 等后缀）。

#### 2c. 解析稳定官网

**已有疑似官网**（snippet/content 中的 `http(s)` 链接，或明确 “website: example.com”）：

- 规范化后的 host **不得**属于社媒/平台（见 [§7.1](#71-不得当作官网的域名)）  
- 路径像公司首页或公司根域（允许 `/`、`/en`、短 path）；目录站、新闻文章不当官网  

通过 → 得到 `website_url`，进入 Step 3（E-04）。本条**不**二次搜索。

**没有官网**：若本词二次搜索次数未达 [§9](#9-上限与配额) 上限，则：

```
search-api.search_web({
  query: <见 §7.2 模板>,
  language: search_query.language,
  num_results: 5
})
```

不传 `include_domains`。`search_calls` +1。对二次结果做 [§7.3](#73-消歧) 消歧。拿不准 → 跳过该候选，**不猜**。

解析失败 → `exploration_update` 带 `error` 短句（公司名 + 原因），处理下一条社媒结果。

本 Step **结束时不得** `lead_append_raw`。

### Step 3：打开官网并判断（**US-E-04**）

仅当 Step 2 得到 `website_url`。打开前：

1. 用 `lead_list_raw`（可先不按 round 过滤，合并 R1/R2）检查是否已有同一**官网域名**；有则跳过，避免重复打开。  
2. 本词 / 本轮打开次数未超 [§9](#9-上限与配额)。

chrome-devtools：

```
new_page(url) 或 navigate_page  →  website_url
take_snapshot（必要时 evaluate_script）
```

**禁止**把社媒 URL 传给 chrome。

**判断标准（与 `discover-leads` Step 2b 对齐，编码时从 R1 Skill 复制，保持同步）：**

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

打不开或否 → 不写 Lead，记跳过，`crawl_pages` 仍 +1（尝试打开过）。

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
    contacts: [...],  // 仅官网上公开的；没有就 []
    raw_score: 70     // 可选，与 R1 同样是初判
  }
})
```

`run_id` 必须与 Step 0 一致。`leads_found` +1。

### Step 5：每词进度

```
lead-store.exploration_update({
  product_id,
  run_id,
  queries_executed,
  leads_found,
  search_calls,
  crawl_pages,
  error  // 可选，本词跳过摘要
})
```

`crawl_pages` 只计 **官网** 打开次数，不计社媒（社媒未打开）。

### Step 6：结束与汇报

`exploration_finish({ status: "completed" })`。即使 0 条 Lead（全程未通过官网判断）也允许 completed。

向用户汇报：

- `run_id`、R2 词数、社媒搜索次数、二次搜索次数、官网打开次数、写入线索数  
- 跳过原因分布（个人页 / 无公司名 / 解析失败 / 已存在域名 / 判断否）  
- 3～5 条写入样例（公司名 + 官网 + match_reason 一句）或明确「无新线索」  
- 下一步：`score-and-dedupe`（与 R1 相同，会合并 raw 各轮次）

---

## 6. 抽公司（E-03 细则）

智能体判断，硬约束如下。

| 来源 | 倾向保留 | 倾向丢弃 |
|------|----------|----------|
| LinkedIn | `/company/...` 且 title 像组织名 | `/in/`、`/pub/`（MCP 应已滤）；招聘帖；个人顾问页 |
| Facebook | 公共主页 / 品牌页 | `profile.php`、`/people/`、`/groups/` |
| Instagram / X / TikTok | 能读出**公司/品牌名**的公共账号摘要 | 纯个人网红、无法对应公司 |

看不清就不进入解析官网。不要用个人姓名去二次搜「某人公司」。

---

## 7. 解析官网（E-03 细则）

### 7.1 不得当作官网的域名

host 去掉 `www.` 后，等于或为下列后缀则否：

`linkedin.com`、`facebook.com`、`fb.com`、`instagram.com`、`x.com`、`twitter.com`、`tiktok.com`、`youtube.com`、`wikipedia.org`、`google.`、`reddit.com`、`quora.com`、`pinterest.com`、`amazon.`、`ebay.`

以及 E-02 黑名单同类聚合站。二次搜索结果若仍是社媒，MCP 无 include 时会滤掉 Facebook 等；LinkedIn 可能仍出现 → Skill 按上表再丢。

### 7.2 二次搜索 query 模板

优先短、可检索：

```text
{company_name} official website {country_or_region?} {product_or_category?}
```

- `company_name` 必有  
- 国家：来自画像 `target_markets.regions` 或社媒摘要里已出现的国家词，没有则省略  
- 品类：来自画像主产品短名，没有则省略  
- **禁止** `site:` / `intitle:` 等运算符  

### 7.3 消歧

二次结果从上到下找**第一条同时满足**的：

1. 标题或 snippet **包含公司名核心词**（允许法律后缀差异）  
2. URL 不是 [§7.1](#71-不得当作官网的域名)  
3. 不像目录 / 黄页 / 新闻（Kompass、Europages、Yellow Pages、Crunchbase 列表页、明显 `/news/` 文章）  
4. 像公司自己的站点（品牌域、首页或 about）

多条都像但指向**不同注册公司**（同名不同国家）→ 全部不用，跳过。  
一条明显更好（国家与画像一致 + 域名像品牌）→ 用那一条。

解析失败 = 本条社媒结果结束，不是整词结束；词上仍可处理下一条社媒命中，直到 §9 上限。

---

## 8. 写入与去重（E-04 细则）

### 8.1 字段

见 Step 4。编码时同步在 [03-数据模型.md](../03-数据模型.md) 原始线索节补一句：

> R2：`source.url` / `company.website` 为打开过的官网；社媒发现 URL 写在 `source.snippet` 的 `发现：` 前缀中。

**不要**改 02 的旧轮次策略表（仍等 E 批齐）。

### 8.2 评分

本 Skill 不调用 `leads_score_and_dedupe`。用户之后对产品跑现网评分即可。去重键仍是官网域名（`getDedupeKey` 用 `company.website`），因此只要 website 不是 facebook.com，就不会把社交平台当公司键。

### 8.3 `source.type`

继续 `tavily_search`。发现路径仍是 Tavily；不新增枚举，以免改 lead-store 版本只为标签。

---

## 9. 上限与配额

二次搜索每个「缺官网」候选最多 1 次，成本高。默认（可在 Skill 正文写死，E-05 不另做设置项除非以后要）：

| 上限 | 值 | 说明 |
|------|----|------|
| 每词社媒 `num_results` | 5 | 与 R1 一致 |
| 每词二次搜索 | **2** | 该词下最多 2 次无 include 的 `search_web` |
| 每轮二次搜索 | **20** | 达到后本轮不再二次搜，剩余候选若无官网则跳过 |
| 每词官网打开 | **2** | chrome 次数 |
| 每轮官网打开 | **15** | 达到后本轮不再打开，后续解析成功也不写（未判断就不写） |

日限额 / 余额用尽：立即停，与 R1 相同。

`max_queries` 与上表独立：先截词，再在词内套表。

---

## 10. 错误处理

| 情况 | 处理 |
|------|------|
| 无合格 R2 词 | 不 `exploration_start`（或 start 后立刻 finish）；提示扩展关键词并确认设置页站点 |
| yaml 读不到 | 用 Skill 内对照表；仍找不到 `site_id` 则跳过该词 |
| 社媒搜索失败 | 该词记 error，继续下一词；连续失败可 finish failed |
| chrome 不可用 | **E-04 无法点收**；完整运行应停止并提示启用 MCP。E-03 单独点收允许不跑 Step 3（见 §12） |
| 官网超时 | 跳过该候选，不写 Lead |

---

## 11. 界面与 E-05 边界

**本故事无 UI。** 不改 `ExploreView`、不改 `buildDiscoverLeadsPrompt`、不改预检。

E-05 将：

- 增加「开始 R2」  
- `agent-runner` 新 prompt：`请严格按 skill discover-leads-r2`  
- 建议注入 yaml 对照表与 `max_queries`  
- 任务 `skill` 字段标 `discover-leads-r2`

本详设不规定按钮文案。

---

## 12. 验收用例

开发期在 Cursor 直调 Skill；不必等 E-05。自定义通道优先（官方 include 仍可能被网关丢掉）。

### 12.1 US-E-03（Must）

编码可将 Step 3～4 暂时视为「本阶段不执行」做一次前半验收，或跑完整 Skill 但**只断言前半行为**（未解析成功则 raw 无新行）。

| # | Given | When | Then |
|---|--------|------|------|
| C1 | 有 `site_id=linkedin_company` 的 R2 词 | 该词 `search_web` | 参数含 `include_domains: ["linkedin.com/company"]`；未对领英 URL 调 chrome |
| C2 | 有 Facebook R2 词 | 同上 | `include_domains: ["facebook.com"]`；未打开 facebook.com |
| C3 | 摘要为个人主页或无公司名 | 抽公司 | 不二次搜、不写 Lead |
| C4 | 摘要含非社媒官网 | 解析 | 不二次搜；产出公司名 + 该官网（进入 E-04 或停在汇报） |
| C5 | 摘要无官网、公司名清楚 | 二次搜 | 无 `include_domains`；消歧失败则跳过且不写 Lead |
| C6 | 无 `site_id` 的旧 R2 | 筛选 | 跳过，不当样本 |
| C7 | 解析全部失败 | 结束 | `raw/R2.jsonl` 无新行（允许 run completed） |

### 12.2 US-E-04（Must）

| # | Given | When | Then |
|---|--------|------|------|
| D1 | E-03 已给出官网 | chrome 打开该官网 | 判断口径与 R1 相同；**未**打开社媒 |
| D2 | 判断通过 | `lead_append_raw` | `round=R2`；`company.website` 与 `source.url` 为官网；snippet 含 `发现：` + 社媒 URL；`run_id` 正确 |
| D3 | 官网打不开或判断否 | — | 不写 raw |
| D4 | 该官网域名已在 raw（R1 或 R2） | 打开前 | 跳过，不重复写 |
| D5 | 全程无「判断是」 | finish | 无新 Lead，任务可 completed |
| D6 | 写入的线索 | 看 website | 不是 facebook.com / linkedin.com |

### 12.3 回归

| # | Then |
|---|------|
| R1 | `discover-leads` 正文与「开始 R1」行为不变 |
| R2 | 不传 include 的 `search_web` 仍过滤 Facebook（E-02） |

---

## 13. 编码任务顺序

1. 新建 `workspace/skills/discover-leads-r2/SKILL.md`（全文含 Step 0～6）。  
2. 更新 [05-智能体技能规范.md](../05-智能体技能规范.md) 清单 + 增加 `discover-leads-r2` 小节（步骤用本文摘要，判断标准指向 R1 同款）。  
3. [03-数据模型.md](../03-数据模型.md) 补 R2 snippet 约定。  
4. 工作区模板同步：用户区 skills 靠现网 workspace-init（版本号若因新 Skill 目录需递增则一并加）。  
5. **不要**改探索页 / agent-runner（留给 E-05）。  
6. Cursor 手工走 C1–C7、D1–D6（自定义通道）。  
7. 17 号 E-03 / E-04 改为「编码已落地」；注明「探索页开始 R2 仍待 E-05」。

建议一次合入完整 Skill，验收分 C 组 / D 组，而不是维护两份 Skill 文件。

---

## 14. 已确认点汇总

| # | 议题 | 决定 |
|---|------|------|
| Q1 | Skill 名 | `discover-leads-r2` |
| Q2 | yaml | Skill 读文件 + 正文对照表；无新 MCP |
| Q3 | 中间文件 | 不落盘 |
| Q4 | 社媒 URL | `snippet` 前缀 `发现：` |
| Q5 | 词集合 | expansion 里合格 R2，不按 prefs 再滤 |
| Q6 | 二次搜 | 无 include；模板见 §7.2 |
| Q7 | 上限 | 每词二次 2 / 每轮 20；每词打开 2 / 每轮 15 |
| Q8 | 判断 | 复制 R1 Step 2b |
| Q9 | 去重 | 官网域名 |
| Q10 | 启动 | 本故事直调 Skill；按钮 E-05 |

若需改 Q4（加独立字段）或 Q7（数字），确认后再编码。
