# Places API（新）定价摘录 — R3 相关

> 摘自 [Google Maps Platform 核心服务定价列表](index.html)（离线保存，2026-09-01）。**完整价目与阶梯以在线文档为准。**  
> 解读见 [R3-Places-API-预研.md](../../design/R3-Places-API-预研.md)。

## 计费要点

1. **Essentials / Pro / Enterprise** 不是三个 API，而是同一 Places API（新）请求的 **SKU 档位**；`X-Goog-FieldMask` 要求的字段取 **最高档** 计费。
2. **1 次 HTTP 请求 = 1 次可计费事件**（Text Search 一页最多 20 条结果仍算 1 次）。
3. **Free Usage Cap** 为 **每个 SKU 每月独立** 的免费次数。
4. 超出免费额度后，价格按 **美元 / 每 1,000 次** 计，用量越大单价越低（见完整 HTML 表各列）。

## R3 采用的 SKU（Cap–100,000 档单价）

| SKU | 档位 | 免费/月 | 超出后（USD/千次） | R3 用途 |
| --- | --- | --- | --- | --- |
| Text Search Pro | Pro | 5,000 | $32.00 | 阶段 1：Search（name/address/types） |
| Place Details Enterprise | Enterprise | 1,000 | $20.00 | 阶段 2：Details（`websiteUri`） |
| Geocoding | Essentials | 10,000 | $5.00 | 可选：城市 → locationBias |

**勿在 Text Search 中请求 `websiteUri`**，否则整单升为 Text Search Enterprise（$35/千次，免费 1,000/月），通常不如「Search Pro + 按需 Details Enterprise」。

## 其它 Places SKU（R3 首发不用）

| SKU | 档位 | 免费/月 | 超出后（USD/千次） | 说明 |
| --- | --- | --- | --- | --- |
| Text Search Essentials (IDs Only) | Essentials | Unlimited | — | 仅 place_id，不够 R3 |
| Text Search Enterprise | Enterprise | 1,000 | $35.00 | 含 website 等 Enterprise 字段时用 |
| Place Details Pro | Pro | 5,000 | $17.00 | 无 website 时 |
| Place Details Enterprise + Atmosphere | Enterprise | 1,000 | $25.00 | 含评分/氛围等，R3 不需要 |

## R3 成本粗算（超出免费额度后）

设 `pageSize=20`，`max_details_per_keyword=20`，且过滤后满 20 条进 Details：

```
每 R3 词 ≈ 1 × Text Search Pro ($0.032)
         + 20 × Place Details Enterprise ($0.40)
         ≈ $0.43 / 词
```

**瓶颈**：Place Details Enterprise 免费 **1,000 次/月** → 约 **50 词/月**（每词 20 次 Details）。

## FieldMask（与预研文档一致）

**Text Search Pro：**

```
places.id,places.displayName,places.formattedAddress,places.types,places.businessStatus
```

**Place Details Enterprise：**

```
id,displayName,websiteUri,formattedAddress,types
```
