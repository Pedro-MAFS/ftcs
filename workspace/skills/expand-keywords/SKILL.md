---
name: expand-keywords
description: 基于已就绪的产品画像，由大模型生成五维关键词与搜索查询，并经 lead-store.keywords_save 落盘。用户说扩展关键词、生成搜索词、开始获客准备时使用。
phase: 1
inputs:
  - name: product_id
    type: string
    required: true
outputs:
  - path: data/keywords/{product_id}/expansion.json
    schema: KeywordExpansion
---

# expand-keywords

基于**已就绪**的产品画像，**由你（大模型）直接生成**丰富、可靠、可执行的获客搜索词，再调用 `lead-store.keywords_save` 写入 `data/keywords/{product_id}/expansion.json`。

**禁止**使用已移除的规则工具 `keywords_expand`。不要用固定模板机械拼接（如一律 `{name} supplier`）；必须结合画像内容与获客目标做推理。

## 何时使用

- 产品画像 `status == "ready"`，需要生成探索关键词
- 用户说「扩展关键词」「生成搜索词」「为这个产品准备获客搜索」
- `extract-product-profile` 完成后，作为流水线下一步

## 前置条件

- `lead-store` MCP 已配置
- 目标 `product_id` 的画像存在且 `status == "ready"`
- 画像至少包含 1 个产品（`products.length >= 1`）

## 执行步骤

### Step 1：加载画像

1. 调用 `lead-store.product_get`，传入 `product_id`
2. 若画像不存在 → 停止，提示先运行 `extract-product-profile`
3. 若 `status != "ready"` → 停止，根据 `readiness.missing_fields` 提示用户补全画像
4. 仔细阅读：`company`、`products`（品名中英文、材质、规格、场景、HS）、`buyer_personas`、`target_markets`（地区与语言）、`competitors`

### Step 2：明确获客目标（内化，不必单独提问除非画像严重缺失）

围绕以下目标生成搜索词：

- 找到可能采购/经销/进口该产品的海外买家或渠道商
- 覆盖用户目标市场与买家类型
- **R1 广撒网**（普通检索句）占多数；**R2 社媒发现**只给当前启用的站点出词（见 `config/explore-r2-sites.yaml` + `data/prefs/explore-r2.json`）
- **不要**生成 R3 / R4
- 用语贴近真实搜索习惯，可含合理行业黑话、缩写、本地语

读取启用站点：先读工作区 `config/explore-r2-sites.yaml`，再用 `data/prefs/explore-r2.json` 的 `enabled` 覆盖 `default_enabled`。yaml 不存在则默认启用 `linkedin_company` 与 `facebook_page`。

### Step 3：由你生成完整 KeywordExpansion

自己产出完整结构（见下方 Schema），要求：

#### 五维 `dimensions`（每维若干短语，供展示与复用）

| 维度 | 生成要求 |
|------|----------|
| product | 品名、材质、品类、供应/出口侧表达；中英文按市场需要 |
| scenario | 应用场景 × 产品，贴近真实采购语境 |
| buyer | 买家类型、角色、进口商/分销商等 |
| geo | 目标国家/地区 × 产品 × 采购意图；可用 `target_markets.languages` 做本地化 |
| competitor | 竞品替代、竞品客户；无竞品时用品类头部品牌/替代方案词，勿编造不存在的具体公司名 |

#### `search_queries`（可执行搜索句）

- 总数 **30～50**（Phase 1 上限 50）
- 至少覆盖 **4** 个维度（争取 5 个）
- **R1 ≥ 60%**：普通产品 / 场景 / 买家 / 地理 / 竞品替代检索句；**不要** `site_id`；**不要**写 `site:` 等运算符
- **R2**：只给**当前启用**站点出词；每条必须有 `site_id`（登记表中的 id，如 `linkedin_company`）；query 仍是自然语言，**禁止** `site:` / `intitle:` / `inurl:` / `filetype:`。站点限定由后续搜索层的 `include_domains` 处理。可对同一句话按不同 `site_id` 各出一条
- **不要**生成 `round=R3` 或 `R4`
- 0 个启用站点 → 不要 R2 词，全部 R1
- 每条必须含：`id`、`query`、`dimension`、`language`、`priority`、`round`；R2 另含 `site_id`
- `dimension`：`product` \| `scenario` \| `buyer` \| `geo` \| `competitor`
- `priority`：`high` \| `medium` \| `low`
- `round`：`R1` \| `R2`（本阶段扩展不要写 R3/R4）
- `language`：如 `en` / `zh` / `de` 等，与 query 实际语言一致
- `id` 唯一，建议 `q_001` 起连续编号
- **去重**：语义高度重复的合并；避免空泛无产品信息的词
- **可靠**：不要捏造画像中不存在的认证、规格或竞品专名；不确定时用品类级表述

#### `stats`

可省略，`keywords_save` 会按 `search_queries` 自动汇总；若自行填写须与列表一致。

### Step 4：保存

调用 `lead-store.keywords_save`：

- `product_id`
- `expansion`：含 `dimensions`、`search_queries`（可含 `generated_at`；**不要**在 expansion 里再传冲突的 `product_id` 字段——工具侧会写入）

若保存失败（校验错误），根据报错修正后重试，**禁止**写入残缺文件后假装成功。

### Step 5：自检

保存后可 `keywords_get` 核对：

- `stats.total_queries >= 30`
- `by_dimension` 中至少 4 个维度 count > 0
- 抽查 3～5 条是否像真人会搜的词
- 所有 `round=R2` 均有 `site_id`，query 不含 `site:`
- `by_round` 中 R3 / R4 为 0 或不出现

不足则继续推理补充并再次 `keywords_save`。

### Step 6：输出摘要

向用户展示：

- 产品 ID 与保存路径
- 总查询数与各轮次/维度分布
- 每个维度 2～3 条代表性 `search_queries`
- 下一步建议：探索页「开始 R1」（`discover-leads`）或「开始 R2」（`discover-leads-r2`）。

## 输出要求

- 必须写入 `data/keywords/{product_id}/expansion.json`
- `product_id` 与画像 ID 一致
- `stats.total_queries >= 30`
- 至少覆盖 4 个维度

## 错误处理

| 情况 | 处理 |
|------|------|
| 画像不存在 | 提示先运行 `extract-product-profile` |
| 画像为 `draft` | 列出 `missing_fields`，引导补全 |
| `keywords_save` 校验失败 | 展示错误并修正后重试，不宣称已完成 |
| 查询数 < 30 或维度不足 | 继续生成并再次保存 |

## 输出 Schema（KeywordExpansion）

路径：`data/keywords/{product_id}/expansion.json`

```json
{
  "product_id": "prod_...",
  "generated_at": "ISO8601",
  "dimensions": {
    "product": ["..."],
    "scenario": ["..."],
    "buyer": ["..."],
    "geo": ["..."],
    "competitor": ["..."]
  },
  "search_queries": [
    {
      "id": "q_001",
      "query": "industrial ball valve distributor Europe",
      "dimension": "buyer",
      "language": "en",
      "priority": "high",
      "round": "R2",
      "site_id": "linkedin_company"
    }
  ],
  "stats": {
    "total_queries": 40,
    "by_round": { "R1": 28, "R2": 12 },
    "by_dimension": { "product": 10, "scenario": 8, "buyer": 12, "geo": 10, "competitor": 5 }
  }
}
```

## 示例对话

> 产品画像 prod_20260712_001 已就绪，请扩展关键词。

> 基于当前塑木产品画像，生成获客搜索词。

## 流水线

- 上一步：`extract-product-profile`
- 下一步：`discover-leads`（默认 R1）；R2 用 `discover-leads-r2`
