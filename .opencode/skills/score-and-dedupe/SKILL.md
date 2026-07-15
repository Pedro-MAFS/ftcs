---
name: score-and-dedupe
description: 对原始线索进行域名去重、六维加权评分与分级，输出 scored.json。用户说线索评分、去重、整理线索时使用。
phase: 1
inputs:
  - name: product_id
    type: string
    required: true
outputs:
  - path: data/leads/{product_id}/scored.json
    schema: ScoredLeadsFile
---

# score-and-dedupe

将 `raw/*.jsonl` 中的原始线索**去重、评分、分级**，输出至 `data/leads/{product_id}/scored.json`。

## 何时使用

- `discover-leads` 完成后，需要整理线索优先级
- 用户说「线索评分」「去重」「整理线索」「哪些客户更值得跟进」
- 进入 `draft-outreach-email` 之前

## 前置条件

- MCP `lead-store` 已配置
- 存在 `data/leads/{product_id}/raw/*.jsonl`（至少 1 条原始线索）
- 存在对应产品画像 `profile.json`

## 执行步骤

### Step 1：确认原始线索

1. 调用 `lead-store.lead_list_raw`，传入 `product_id`
2. 若 `total == 0` → 停止，提示先运行 `discover-leads`

### Step 2：评分与去重

调用：

```
lead-store.leads_score_and_dedupe({ product_id })
```

该工具会：

1. 读取所有 `raw/R1.jsonl` ~ `raw/R4.jsonl`
2. 按域名去重（`dedupe_key` = 规范化域名），保留信息更完整的一条
3. 读取 `config/scoring-rules.yaml` 权重
4. 计算六维 `score_breakdown` 与加权 `score`
5. 分配 `tier`：`high` / `medium` / `low`
6. 若已有 `scored.json`，保留已有线索的 `status` 不被覆盖
7. 写入 `data/leads/{product_id}/scored.json`

### Step 3：检查结果

调用 `lead-store.leads_get_scored` 或在 Step 2 返回中查看：

- `deduped_total` ≤ `raw_total`（去重生效）
- 每条线索含 `score_breakdown` 与 `tier`
- `stats.by_tier` 分布合理

### Step 4：输出摘要

向用户展示：

- 原始线索数 → 去重后数量
- 高/中/低意向分布（`stats.by_tier`）
- Top 5 线索：公司名、分数、tier、match_reason
- 下一步建议：为 high tier 线索运行 `draft-outreach-email`

## 评分维度说明

| 维度 | 权重 | 主要信号 |
|------|------|---------|
| product_match | 30% | 产品名/应用场景是否出现在 match_reason、snippet |
| purchase_intent | 25% | importer/distributor/wholesaler 等采购意图词 |
| size_fit | 15% | 公司类型是否符合 buyer_personas |
| geo_match | 15% | 国家是否属于 target_markets |
| reachability | 10% | 是否有邮箱等联系方式 |
| competition | 5% | 是否为同类出口商/竞品（降分） |

Tier 阈值（默认）：

- **high** ≥ 80
- **medium** ≥ 60
- **low** < 60

## 输出要求

- 必须写入 `scored.json`
- 同域名仅保留 1 条线索
- 每条线索必须有 `score_breakdown` 和 `tier`
- 默认 `status` 为 `new`（已有记录保留原 status）

## 错误处理

| 情况 | 处理 |
|------|------|
| 无原始线索 | 提示先运行 `discover-leads` |
| 产品不存在 | 提示检查 product_id |
| 评分失败 | 展示错误，不写入空文件 |

## 示例对话

> 请对 prod_20260712_001 的线索进行评分和去重。

> 帮我整理一下刚探索到的客户，按优先级排序。

## 相关文档

- 数据模型：`docs/03-数据模型.md` 第 3.2 节
- 评分配置：`config/scoring-rules.yaml`
- 下一步：`draft-outreach-email`（1.5）
