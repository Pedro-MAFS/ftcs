# R3 Google Places API 预研

> **关联需求**：[../17-需求-业务效率工具.md](../17-需求-业务效率工具.md) §5.7 / §5.8 / §14  
> **状态**：预研与 Postman spike **已通过**（2026-09-01）；用户故事见 [../17-需求-业务效率工具.md](../17-需求-业务效率工具.md) §14（US-E-06～10）  
> **定价参考**：[../reference/google-maps-platform-pricing/](../reference/google-maps-platform-pricing/)（离线 HTML + [R3 SKU 摘录](../reference/google-maps-platform-pricing/places-api-pricing-r3-summary.md)）  
> **文档位置**：`docs/design/`

---

## 0. 结论摘要

| 项 | 结论 |
|----|------|
| R3 发现层 | **Google Places API（新）**，不用 Tavily 地图 `include_domains` |
| Tavily 角色 | R1/R2 不变；R3 **无官网时**仍用 Tavily 按公司名二次搜官网 |
| 调用策略 | **两阶段**：Text Search **Pro** → 按需 Place Details **Enterprise**（仅拉 `websiteUri`） |
| 每词 Text Search | `pageSize` 最多 **20**；首发 **不翻页**（第二页 = 又一次 Text Search 计费） |
| 每词 Details 上限 | 产品参数 **`max_details_per_keyword`**（详设前建议 spike 对比 10 / 15 / 20） |
| 落库 | 仅官网打开并 R1 判断通过后写 `raw/R3.jsonl`；Places 不能单独落线索 |
| 下一步 | US-E-06～10 按 §14 实施（**E-06 详设已冻结**；先 E-06 编码 → E-07 自定义 Key → …） |

**Go/No-Go**：Postman spike 已通过；R3 按 Places 方案推进。生产环境仍须关注德区窄品类召回与 website 覆盖率，必要时调整 `max_details_per_keyword` 与过滤规则。

---

## 1. 背景：为何从 Tavily 改为 Places

### 1.1 Tavily 地图域 spike（已证伪）

2026-08-30 Postman 多轮测试：`search_web` + `include_domains: google.com/maps` + 品类/地区/国家自然语言 query。

| 现象 | 含义 |
| --- | --- |
| `/maps/search/` 空壳（仅 *Find local businesses…*） | 无商户列表可解析 |
| 带 Munich / Deutschland 仍出美国、英国结果 | 地理约束不可靠 |
| 慕尼黑 query 出西门子、养老、BMW 等非目标类目 | 品类约束不可靠 |
| 德文窄词（如 `Fußbodenhandel`）零命中或仅帮助页 | 德区窄品类不可用 |

**结论**：Tavily **不能**作为 R3 主发现源。相对可用的 `/maps/place/` 长摘要多在英语区，与「目标市场精准获客」不对齐。

### 1.2 Places 要解决什么

「城市/区域 + 品类」的 **结构化本地商户发现**：商户名、地址、types、（可选）官网。后半段管道与 R2 同构：解析官网 → 打开官网 R1 判断 → 写 Lead。

---

## 2. GCP 接入（spike 前准备）

1. [Google Cloud Console](https://console.cloud.google.com) 新建项目（建议独立，如 `ftcs-places-spike`）。
2. 绑定结算账号；设置 **预算与告警**。
3. 启用 **Places API (New)**；可选 **Geocoding API**（城市 → `locationBias`）。
4. [凭据](https://console.cloud.google.com/apis/credentials) 创建 API Key，限制为 Places（+ Geocoding）；spike 阶段可用 IP 限制。
5. 验证：Text Search 必须带 `X-Goog-FieldMask`，否则 400。

官方文档：[Places API (New) 概览](https://developers.google.com/maps/documentation/places/web-service/overview)

---

## 3. 定价模型（易混点）

### 3.1 不是三个 API，是三档 SKU

**Essentials / Pro / Enterprise** 不是三个可选产品包，而是 **Places API（新）同一套接口下的计费档位**。  
每次请求的 **`X-Goog-FieldMask` 里要求的字段**，决定该次请求按哪一档 SKU 计费；**取最高档**。

- **可计费事件**：通常 **1 次 HTTP 请求 = 1 次事件**（不是按返回 20 条结果算 20 次）。
- **按月汇总**：同一结算账号下所有项目用量合并，再套批量阶梯价。
- **Free Usage Cap**：价目表第二列 = **该 SKU 每月免费次数**，各 SKU **独立**，不互相抵扣。

### 3.2 R3 相关 SKU（价目表 Cap–100,000 档，美元/千次）

| SKU | 档位 | 免费/月 | 超出后（/千次） |
|-----|------|---------|----------------|
| Text Search Essentials (IDs Only) | Essentials | Unlimited | 免费（仅 ID，R3 不够用） |
| **Text Search Pro** | Pro | 5,000 | **$32.00** |
| **Text Search Enterprise** | Enterprise | 1,000 | **$35.00** |
| Place Details Pro | Pro | 5,000 | $17.00 |
| **Place Details Enterprise** | Enterprise | 1,000 | **$20.00** |
| Geocoding | Essentials | 10,000 | $5.00 |

**关键**：在 Text Search 的 FieldMask 里带上 `websiteUri`，整单升为 **Text Search Enterprise**，且仍只有一页结果；**不推荐**。应 **Search Pro + 按需 Details Enterprise**。

### 3.3 计费示例（单 SKU 阶梯）

以 Autocomplete（Essentials，免费 10,000，超出 $2.83/千次）为例，月内 200,000 次：

- 前 10,000 → $0  
- 接下来 90,000 → $2.83 × 90 = $254.70  
- 再 100,000 → $2.27 × 100 = $227.00  
- **合计 ≈ $481.70**

Places 各 SKU 各自走免费额度与阶梯。

---

## 4. R3 字段评估（FieldMask 冻结草案）

### 4.1 按管道步骤

| 步骤 | 需要 | Places 字段 |
|------|------|-------------|
| 发现 | 公司名 | `displayName` |
| 地理过滤 | 城市/国家 | `formattedAddress` |
| 类目过滤 | 去掉无关 POI | `types` |
| 去重/合规 | 稳定 ID | `id`（place_id，**可持久化**） |
| 跳过倒闭 | 可选 | `businessStatus` |
| 官网 | 有则直用 | `websiteUri`（仅 Details；须校验域） |
| 无官网 | Tavily | 只需 `displayName`（+ 画像国家） |
| 写 Lead | 最终 URL | **打开后的官网**，非 Places 字段 |

**不要**（除非改产品）：`rating`、`reviews`、`photos`、电话、营业时间、atmosphere 类——进 Enterprise+，与 R3 无关且更贵。

### 4.2 阶段 1：Text Search — Pro 档

```
places.id,
places.displayName,
places.formattedAddress,
places.types,
places.businessStatus
```

- **计费**：Text Search Pro（5,000 免费/月）。  
- **不要**在本阶段要 `websiteUri`。

### 4.3 阶段 2：Place Details — Enterprise 档（按需）

对过滤后的候选，每条 1 次：

```
id,
displayName,
websiteUri,
formattedAddress,
types
```

- **计费**：Place Details Enterprise（**1,000 免费/月**，通常是成本瓶颈）。  
- 无 `websiteUri` 的商户 **不二次 Details**；走 Tavily 补官网（§5.7 已允许）。

### 4.4 可选：Geocoding（Essentials）

出词「慕尼黑 + 品类」时，同城 **geocode 一次** → `locationBias`；按城市缓存。10,000 免费/月。

### 4.5 写入 `raw/R3.jsonl` vs 仅运行时

| 数据 | 运行时 | 持久化 |
|------|--------|--------|
| `place_id` | ✓ | ✓ snippet，如 `发现：place_id=ChIJ...` |
| `formattedAddress` | ✓ | ✓ snippet 一行 |
| `displayName` | ✓ | 以官网页为准可校正；可进 `company.name` |
| `websiteUri` | ✓ | **不**作最终官网；`source.url` = 打开过的官网 |
| 整段 Places JSON | ✓ | **不要**长期缓存 |
| photo / rating / 电话 | ✗ | ✗ |

snippet 格式（与 R2「发现：{url}」对齐，详设可微调）：

```
发现：place_id=ChIJxxx；{displayName}, {formattedAddress}
```

须遵守 [Places API 政策](https://developers.google.com/maps/documentation/places/web-service/policies)。

---

## 5. 每词 Text Search 与 Details 条数

### 5.1 一次 R3「词」的 API 流

```
1 个 R3 关键词
  → 1× Text Search（Pro）          【1 次计费】
  → 返回 places[]，最多 pageSize 条（上限 20）
  → 本地过滤（types / 地址 / businessStatus）
  → 对候选最多 N 条 Place Details   【每条 1 次 Enterprise 计费】
  → website 校验 / Tavily 补官网
  → 打开官网 R1 判断
  → 通过才 lead_append_raw
```

### 5.2 Google 限制 vs 产品参数

| 概念 | 说明 |
|------|------|
| `pageSize` | Text Search 请求参数，**1～20**；一次 Search **最多返回 20 条** |
| `nextPageToken` | 有则还可翻页；**每翻一页 = 再 1 次 Text Search**；R3 首发建议 **不翻页** |
| **`max_details_per_keyword`（N）** | **产品自定**；每个关键词在过滤后 **最多** 调 N 次 Place Details；**不是 Google 参数** |

示例：Search 返回 20 条，过滤后 18 条，N=10 → **只 Details 前 10 条**，其余本词不再查 website。

### 5.3 数量逐级递减

```
Text Search 返回     ≤20
  → 过滤后候选       常见 8～15
  → Details（≤N）    min(候选, N)
  → 补官网 + R1 通过  常见 0～3 / 词
```

Details 条数 **≠** 最终 Lead 条数。

### 5.4 成本粗算（超出免费额度后）

设 N=20、过滤后常满 20 条 Details：

```
每词 ≈ $0.032（1× Text Search Pro）
     + 20 × $0.020（Details Enterprise）
     ≈ $0.43 / 词
```

10 词/轮 ≈ **$4.3**（不含 Tavily、Geocoding）。

**免费额度瓶颈**：Details Enterprise **1,000 次/月** → N=20 时约 **50 词/月**；Text Search Pro 5,000 次/月相对宽裕。

spike 建议对比 **N = 10 / 15 / 20** 的 website 覆盖率与误召。

---

## 6. Postman spike 计划（待执行）

### 6.1 样例 query

**A. 德区窄品类（必测）**

- `Bodenbelag Fachhandel München`
- `Fußbodenhandel Munich Germany`
- `flooring store Munich`
- `Laminatboden München`

**B. 英语区对照**

- `flooring distributor Dallas Texas`
- `hardwood flooring retailer Toronto`

**C. B2B 向**

- `commercial flooring contractor Munich`
- `B2B flooring wholesaler Germany`

### 6.2 每组记录

| 指标 | 说明 |
|------|------|
| 召回数 | Text Search 首屏条数 |
| 地理准确率 | 是否在目标城市/国家 |
| 类目相关率 | types + 店名 |
| website 覆盖率 | Details 后有 `websiteUri` 的比例 |
| 无效 website | Facebook / 黄页 / 地图域占比 |
| Tavily 补官网 | 无 website 样本的补全成功率（手工抽测） |

### 6.3 Go/No-Go 门槛（草案，spike 后可调）

| 指标 | 建议门槛 |
|------|----------|
| 地理准确率 | ≥90%（抽检 20 条/组） |
| 类目相关率 | ≥70% |
| website 覆盖率 | Details 后 ≥40%；+Tavily 后 ≥60% |
| 端到端可落线索 | 10 词×抽样，经 R1 口径 ≥15% 能过（手工） |

### 6.4 Text Search 请求模板

```http
POST https://places.googleapis.com/v1/places:searchText
X-Goog-Api-Key: YOUR_KEY
X-Goog-FieldMask: places.id,places.displayName,places.formattedAddress,places.types,places.businessStatus
Content-Type: application/json

{
  "textQuery": "Bodenbelag Fachhandel München",
  "languageCode": "de",
  "regionCode": "DE",
  "pageSize": 20
}
```

### 6.5 Place Details 请求模板

```http
GET https://places.googleapis.com/v1/places/PLACE_ID
X-Goog-Api-Key: YOUR_KEY
X-Goog-FieldMask: id,displayName,websiteUri,formattedAddress,types
```

注意：Text Search 用 `places.xxx` 前缀；Details 用 **无前缀** 字段名。

---

## 7. 工程落点（详设：对齐 US-E-07 / E-10）

| 项 | 方向 |
|----|------|
| MCP | **places-api**：`places_text_search` / `place_details` |
| Provider | **`custom`**（BYOK 直连，**Must 首发**）· **`gateway`**（token 网关，**Should，优先级低**） |
| Skill | `discover-leads-r3`（US-E-08） |
| Key | 设置页 **可选** Places Key；**仅 R3 Preflight 需要**（US-E-09） |
| 缓存 | place_id → details 短 TTL；不长期缓存整段响应 |
| 配额 | 与 R1 Tavily 分开；官方网关用量见 US-E-10 |

---

## 8. 待 spike 后冻结项

| 参数 | 候选 |
|------|------|
| `pageSize` | 20（首发） |
| `max_details_per_keyword` | 10 / 15 / 20（spike 对比） |
| 是否翻页 | 首发 **否** |
| `languageCode` / `regionCode` / `locationBias` | 以德区样本为准 |
| `types` 黑名单 | spike 后定（如 `gas_station`） |
| snippet 最终格式 | 见 §4.5 |
| Geocoding 是否必做 | 视 spike 地理准确率 |

---

## 9. 相关文档

- 需求与评审：[../17-需求-业务效率工具.md](../17-需求-业务效率工具.md) §5.7  
- R2 管道参考（抽公司 → 补官网 → 打开判断）：[US-E-03+04-R2-Skill抽公司与官网判断.md](US-E-03+04-R2-Skill抽公司与官网判断.md)  
- 线索 Schema：[../03-数据模型.md](../03-数据模型.md)  
- 参考文档索引：[../reference/README.md](../reference/README.md)  
- Google 价目表（离线）：[../reference/google-maps-platform-pricing/](../reference/google-maps-platform-pricing/) · [R3 SKU 摘录](../reference/google-maps-platform-pricing/places-api-pricing-r3-summary.md)  
