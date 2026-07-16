---
name: expand-keywords
description: 基于已就绪的产品画像生成五维关键词与搜索查询，并保存至 expansion.json。用户说扩展关键词、生成搜索词、开始获客准备时使用。
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

基于**已就绪**的产品画像，生成五维关键词与可执行的搜索查询（`search_queries`），保存至 `data/keywords/{product_id}/expansion.json`。

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

### Step 2：生成关键词扩展

1. 调用 `lead-store.keywords_expand`，传入 `product_id`
   - 该工具会基于画像自动生成五维关键词与 `search_queries`
   - 自动分配轮次 R1–R4（约 60% / 20% / 15% / 5%）
   - 自动保存至 `data/keywords/{product_id}/expansion.json`
2. 检查返回的 `stats`：
   - `total_queries >= 30`
   - `dimensions_covered` 覆盖 ≥ 4 个维度

### Step 3：智能体审阅与补充（可选）

`keywords_expand` 提供规则化基础结果。智能体应审阅并在必要时补充：

- 行业特有术语或缩写（如 WPC、HS 编码相关词）
- 目标市场本地化表达（德语/西语等，参考 `target_markets.languages`）
- 更精准的买家场景词

若需补充或修改：

1. 调用 `lead-store.keywords_get` 读取完整 `expansion.json`
2. 在 `dimensions` 和 `search_queries` 中追加/调整（保持 `id` 唯一）
3. 调用 `lead-store.keywords_save` 保存更新后的结果

**约束**：
- Phase 1 总查询数建议 ≤ 50
- 每条 `search_query` 必须包含：`id`、`query`、`dimension`、`language`、`priority`、`round`
- `dimension` 取值：`product` | `scenario` | `buyer` | `geo` | `competitor`

### Step 4：五维关键词说明

| 维度 | 生成逻辑 | 示例 |
|------|---------|------|
| product | 中英文品名、材质、品类、供应商词 | `WPC Decking supplier` |
| scenario | 应用场景 × 产品 | `landscape WPC Decking distributor` |
| buyer | 买家类型、角色、进口商 | `building materials supplier WPC Decking` |
| geo | 目标国家/地区 × 产品 × 买家意图 | `WPC Decking importer Germany` |
| competitor | 竞品替代、竞品客户（无竞品时用品类竞品词） | `top WPC Decking competitors` |

### Step 5：轮次分配

| 轮次 | 占比 | 用途 |
|------|------|------|
| R1 | ~60% | 广撒网：产品词、场景词、买家词、地理词 |
| R2 | ~20% | 深挖掘：进口商、海关/HS 编码相关 |
| R3 | ~15% | 精匹配：竞品、采购角色 |
| R4 | ~5% | 持续监控：新分销商、采购公告 |

### Step 6：输出摘要

向用户展示：

- 产品 ID 与保存路径
- 总查询数与各轮次/维度分布（`stats`）
- 每个维度 2–3 条代表性 `search_queries`
- 下一步建议：执行 `discover-leads`（默认 R1 轮次）

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
| `keywords_expand` 失败 | 展示错误信息，不写入空文件 |
| 查询数 < 30 | 智能体补充行业词后 `keywords_save` |

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
      "round": "R1"
    }
  ],
  "stats": {
    "total_queries": 45,
    "by_round": { "R1": 27, "R2": 9, "R3": 7, "R4": 2 },
    "dimensions_covered": 5
  }
}
```

`priority` 取值：`high` | `medium` | `low`。

## 示例对话

> 产品画像 prod_20260712_001 已就绪，请扩展关键词。

> 基于当前塑木产品画像，生成获客搜索词。

## 流水线

- 上一步：`extract-product-profile`
- 下一步：`discover-leads`（默认 R1）
