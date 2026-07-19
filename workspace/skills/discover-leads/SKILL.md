---
name: discover-leads
description: 执行 R1 获客探索：Tavily 搜索候选 URL，chrome-devtools 验证页面，判断目标客户并写入原始线索。用户说开始探索、发现线索、R1 广撒网时使用。
phase: 1
inputs:
  - name: product_id
    type: string
    required: true
  - name: rounds
    type: array
    required: false
  - name: max_queries
    type: number
    required: false
outputs:
  - path: data/leads/{product_id}/raw/{round}.jsonl
    schema: RawLead
  - path: data/exploration/{product_id}/runs/{run_id}.json
    schema: ExplorationRun
---

# discover-leads

基于关键词扩展结果执行**获客探索**：Tavily 搜索 → 打开候选页面 → 判断是否目标客户 → 写入原始线索。

Phase 1 默认执行 **R1 广撒网**。

## 何时使用

- 产品画像与关键词扩展已完成
- 用户说「开始探索」「执行 R1」「发现潜在客户」
- `expand-keywords` 完成后的下一步

## 前置条件

- MCP `lead-store`、`search-api`（Tavily）已配置
- MCP `chrome-devtools`（user-chrome-devtools）可用
- `data/products/{product_id}/profile.json` 存在且 `status == "ready"`
- `data/keywords/{product_id}/expansion.json` 已生成

## 输入参数

| 参数 | 默认 | 说明 |
|------|------|------|
| `product_id` | 必填 | 产品 ID |
| `rounds` | `["R1"]` | 探索轮次 |
| `max_queries` | 全部可用词 | 最多执行的搜索词数；桌面端默认传当前 R1 全量，可在探索页限制 |

## 执行步骤

### Step 0：准备

1. `lead-store.product_get` — 确认画像 ready
2. `lead-store.keywords_get` — 读取 `search_queries`
3. `search-api.search_usage` — 确认当日配额未用尽
4. `lead-store.exploration_start` — 创建探索运行记录
   - 记录返回的 `run_id`

### Step 1：筛选搜索词

从 `search_queries` 中筛选：

- `round` 属于本次 `rounds`（默认 R1）
- 按 `priority` 排序：`high` → `medium` → `low`
- 取前 `max_queries` 条

向用户简要说明：本次将执行 N 个搜索词。

### Step 2：逐词探索（核心循环）

对每个 `search_query` 执行：

#### 2a. 搜索

```
search-api.search_web({
  query: search_query.query,
  language: search_query.language,
  num_results: 5
})
```

- 若返回 `DAILY_LIMIT_EXCEEDED` → 停止探索，保存进度，告知用户
- 记录 `search_calls` +1

#### 2b. 打开并分析候选 URL

对每条搜索结果（最多 5 个）：

1. **跳过**以下站点（非目标客户来源）：
   - 新闻/博客/论坛/百科/社交媒体/纯聚合搜索页
   - 与产品无关的 B2B 平台 listing 页（无具体公司信息）
   - 已在本次/历史探索中出现过的同域名站点（调用 `lead_list_raw` 去重）

2. 使用 **chrome-devtools-mcp**：
   ```
   new_page(url) 或 navigate_page
   → take_snapshot（必要时 evaluate_script 提取公司名、业务、国家）
   ```

3. **智能体判断**是否目标客户：

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

4. **若为目标客户** → 写入线索：

```
lead-store.lead_append_raw({
  product_id,
  round: search_query.round,
  lead: {
    query_id: search_query.id,
    company: {
      name: "...",
      website: "https://...",
      country: "DE",
      description: "..."
    },
    source: {
      url: "https://...",
      type: "tavily_search",
      snippet: "来自搜索结果的摘要"
    },
    match_reason: "德国 WPC 地板经销商，网站展示 outdoor decking 产品线，与目标市场匹配",
    contacts: [{ type: "email", value: "sales@...", confidence: "medium" }],
    raw_score: 70
  }
})
```

`match_reason` **必须具体**，说明为何判断为目标客户（引用网站上的产品/业务证据）。

5. 记录 `crawl_pages` +1

#### 2c. 更新进度

每完成一个 search_query：

```
lead-store.exploration_update({
  product_id,
  run_id,
  queries_executed: <累计>,
  leads_found: <累计>,
  search_calls: <累计>,
  crawl_pages: <累计>
})
```

### Step 3：完成探索

```
lead-store.exploration_finish({
  product_id,
  run_id,
  status: "completed"
})
```

### Step 4：输出摘要

向用户展示：

- 探索 run_id 与保存路径
- 执行搜索词数 / 找到线索数 / 唯一域名数
- API 用量（search_calls / crawl_pages）
- 3–5 条代表性线索（公司名 + match_reason）
- 下一步建议：`score-and-dedupe`

## 验收标准（Phase 1.3）

- 一轮 R1 探索 ≥ 10 个搜索词
- 产出 ≥ 20 条原始线索
- 每条线索均有 `source.url` 和 `match_reason`

## 错误处理

| 情况 | 处理 |
|------|------|
| 无 expansion.json | 提示先运行 `expand-keywords` |
| TAVILY_API_KEY 未配置 | 提示配置 `.env` 并重启 MCP |
| 搜索配额用尽 | 停止探索，保存进度，建议次日继续 |
| 网站无法打开 | 记录到 `exploration_update.error`，跳过 |
| chrome-devtools 不可用 | 停止，提示启用 MCP |

## 数据约定（本 Skill 自洽）

### 原始线索 RawLead

写入路径：`data/leads/{product_id}/raw/{round}.jsonl`（每行一条 JSON）

必填字段：

| 字段 | 说明 |
|------|------|
| `company.name` / `company.website` | 公司名与官网 |
| `source.url` | 发现来源页 |
| `source.type` | 如 `tavily_search` |
| `match_reason` | 具体判断依据（禁止空泛） |
| `query_id` / `round` | 来自搜索词 |

可选：`company.country`、`company.description`、`contacts[]`、`raw_score`（0–100 初判）。

### 探索运行 ExplorationRun

由 `exploration_start` / `update` / `finish` 维护，路径：

`data/exploration/{product_id}/runs/{run_id}.json`

关注字段：`status`、`queries_executed`、`leads_found`、`api_usage.search_calls`、`api_usage.crawl_pages`、`errors`。

### search-api 要点

- 工具：`search_web`、`search_usage`
- `search_web` 常用参数：`query`、`language`、`num_results`（建议 5）
- 日配额耗尽时返回 `DAILY_LIMIT_EXCEEDED` → 停止并保存进度
- Key 来自工作区 `.env` 的 `TAVILY_API_KEY`（由 MCP 环境注入）

## 示例对话

> 请对 prod_20260712_001 执行 R1 探索，最多 10 个搜索词。

> 基于已有关键词，开始发现 WPC 塑木产品的潜在客户。

## 流水线

- 上一步：`expand-keywords`
- 下一步：`score-and-dedupe`
