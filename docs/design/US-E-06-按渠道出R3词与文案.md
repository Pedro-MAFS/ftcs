# US-E-06 按渠道出 R3 词与探索页地图发现文案

> **用户故事**：[../17-需求-业务效率工具.md](../17-需求-业务效率工具.md) · US-E-06  
> **状态**：编码已落地  
> **范围**：`expand-keywords` 生成 `round=R3` 地图发现词；探索页 / 关键词编辑器 R3 文案改为「地图发现」并可预览 R3 词；**仍不生成 R4**；**不**调用 Places、**不**配置 Key、**不**「开始 R3」  
> **依赖**：US-E-01 已落地（R1/R2 出词、`site_id`、R2 站点登记表）；[R3-Places-API-预研.md](R3-Places-API-预研.md)（query 形态与 Places `textQuery` 对齐）  
> **不做**：places-api MCP（E-07）；`discover-leads-r3`（E-08）；探索页「开始 R3」与 Preflight（E-09）；R4 出词；改评分 / 线索页  
> **文档位置**：`docs/design/`

---

## 0. 相对现网（US-E-01 之后）

| 现网 | **本期（E-06）** |
|------|------------------|
| 扩展时 **不生成** R3/R4 | **生成 R3**（6～12 条）；**仍不生成 R4** |
| 探索页 R3 筛选标签「R3 规划中」；空态提示「不再生成这类词」 | R3 改为 **「R3 地图发现」**；有词可预览；无词时提示重新扩展 |
| R3 词不存在 | R3 query = **城市/区域 + 品类/场景**，无 `site_id`，无 `site:` 等运算符 |
| 「开始 R1」「开始 R2」可点 | **不变**；**不出现**「开始 R3」（E-09） |
| `keywords_save` 仅校验 R2 的 `site_id` / 运算符 | **R3** 同步拒绝 `site_id` 与 Google 运算符 |

---

## 1. 已确认选型

| 项 | 决定 |
|----|------|
| **Q1 R3 词是什么** | **Google Places Text Search 的自然语言 `textQuery`**：一句里同时有 **明确地理**（城市 / 都会区 / 区域 + 国家语境）与 **本地商户/品类意图**（零售、经销、安装、批发等）。不是 R1 的广域买家句，也不是 R2 的「同句 + 社媒站点」 |
| **Q2 与 R1 地理词区别** | R1 可以是国家/区域级买家检索（如 `flooring importer Germany`）；R3 必须 **下沉到城市或明确都会区**（如 `Bodenbelag Fachhandel München`、`flooring store Dallas Texas`） |
| **Q3 site_id** | R3 **不得**带 `site_id`（单渠道 Google 地图，与 §5.7 一致） |
| **Q4 运算符** | R3 与 R2 相同禁则：query 不得含 `\b(site\|intitle\|inurl\|filetype)\s*:` |
| **Q5 数量与比例** | 总数仍 **30～50**。 **R1 ≥ 60%**（与 E-01 一致）。 **R3：6～12 条**（至少 6、至多 12）。 **R2：剩余全部**，按当前 **启用站点均分**，每站至少 2 条（仅 1 站则全给该站）。0 启用站 → 无 R2，在 R1 与 R3 间分配 |
| **Q6 R4** | 扩展 **仍不生成** `round=R4`；探索页 R4 仍「规划中 / 待评审」 |
| **Q7 dimension** | R3 优先 `geo` 或 `buyer`；允许 `scenario`（本地安装/零售场景）；**避免**纯 `product` 且无城市名 |
| **Q8 language** | 与 query 实际语言一致；目标市场德语区用 `de`，英语区用 `en` 等 |
| **Q9 结构化 Places 字段** | **本故事不入 expansion**（不写 `regionCode` / lat/lng 字段）。E-08 Skill 从 query 字符串映射 Places 参数；必要时 E-07 MCP 再 geocode |
| **Q10 旧 expansion** | 不自动迁移。重新扩展后才有 R3 词；旧文件无 R3 时预览空态走「请重新扩展」 |
| **Q11 执行入口** | 本故事 **不做**「开始 R3」；`exploreRunTitle` 等对 R3 仅改文案，不暗示可跑 |

---

## 2. 目标与非目标

### 2.1 目标

1. 重新扩展后，预览里能看到 **真正的 R3 地图发现词**（城市/区域 + 品类/场景）。  
2. R1、R2 行为与 US-E-01～05 **一致**（比例在 Q5 约束下 R2 可能略减）。  
3. 探索页 / 编辑器轮次文案：**R3 地图发现**；R4 仍规划中。  
4. 保存与 MCP 校验：R3 无 `site_id`、无 Google 运算符。

### 2.2 非目标

| 不做 | 归属 |
|------|------|
| Places API / MCP | US-E-07 |
| R3 探索执行、写 `raw/R3.jsonl` | US-E-08 |
| 「开始 R3」、Places Key、Preflight | US-E-09 / E-07 |
| R4 出词 | §5.9 评审后 |
| `max_details_per_keyword`、FieldMask | 预研 + [E-08](US-E-08-discover-leads-r3-Skill.md) |
| 探索页新增 R3 按钮占位 | E-09 再加 |

---

## 3. R3 出词规则（Skill 权威）

### 3.1 句法模板（自然语言，非代码模板）

每条 R3 query 应满足：

1. **地理锚点**：至少包含 **一个城市名、都会名或明确区域**（可与国家同句出现）。来自画像 `target_markets`（国家 → 典型城市/区域）；无城市时可选用该国的 **首府/经济中心/港口城市** 等合理默认，**禁止**仅写国家而无城市（除非国家极小且业界习惯以国代城——本阶段 **仍要求写城市**）。  
2. **商户/品类意图**：产品品类、买家类型或本地场景（如 Fachhandel、flooring store、distributor、installer、wholesaler）。来自 `products`、`buyer_personas`、`scenario` 维度。  
3. **可直送 Places**：整条字符串作为 Places API `textQuery` 时语义清晰（见预研 Postman 样例）。

**推荐结构（灵活顺序）：**

- `{city} {category/merchant type}`  
- `{category} {city} {country}`  
- `{city} {product category} {buyer role}`（当地语言）

### 3.2 样例（塑木 / 地板画像）

| query | language | dimension | 说明 |
|-------|----------|-----------|------|
| `Bodenbelag Fachhandel München` | de | geo | 德区 spike 样例 |
| `flooring store Dallas Texas` | en | geo | 英语区零售 |
| `Laminatboden Händler Hamburg` | de | buyer | 品类 + 城市 |
| `commercial flooring contractor Munich` | en | scenario | B2B 安装/工程向 |
| `hardwood flooring retailer Toronto` | en | geo | 加拿大城市 |

**反例（不要生成）：**

| query | 原因 |
|-------|------|
| `site:google.com/maps flooring Munich` | 含运算符 |
| `flooring importer Germany` | 仅国家级，无城市（属 R1） |
| `WPC decking distributor Europe` + `site_id` | R2 形态，非 R3 |
| `Google Maps flooring Munich` | 指渠道而非商户意图 |

### 3.3 与画像字段的映射

| 画像 | R3 出词用法 |
|------|-------------|
| `target_markets.countries` / `regions` | 决定 **语言** 与 **国家语境**；展开为 2～4 个代表城市出词 |
| `products[].name` / 材质 / 场景 | 品类与商户类型用语 |
| `buyer_personas` | 经销商 / 零售 / 安装商等本地角色 |
| `competitors` | **不**直接写竞品公司名进 R3（避免搜到单体 POI）；可用品类替代 |

### 3.4 去重

- 同一 **城市 + 相同品类意图** 不重复；相邻城市可各 1 条。  
- R3 句与 R1 句 **允许主题相近**，但 R3 必须 **更本地、更地图**（含城市名）。

---

## 4. 扩展数量算法（冻结）

设 `N` = `search_queries` 总数（30～50）。

```
R1_min = ceil(N * 0.6)
R3_target = clamp(8, 6, 12)   // 默认目标 8，边界 6～12；实现可用 6～12 由模型在范围内取
R3 = min(R3_target, N - R1_min - R2_min_reserve)

其中 R2_min_reserve = (启用站数 > 0) ? (启用站数 * 2) : 0

分配顺序：
1. 先保证 R1 >= R1_min
2. 再保证 R3 在 [6, 12] 且不超过 N - R1 - R2_min_reserve
3. 剩余全部给 R2，按启用站均分，每站至少 2 条
4. 若 N 太小导致 R3 无法达到 6：优先满足 R1_min，R3 取 max(0, N - R1_min - R2_min_reserve)，验收时 **N≥40 的样本须 R3≥6**
```

**自检（Skill Step 5）：**

- `stats.total_queries` ∈ [30, 50]  
- `by_round.R1 / total >= 0.6`  
- `by_round.R3` ∈ [6, 12]（当 total ≥ 40）  
- `by_round.R4` 为 0 或不存在  
- 所有 R2 有 `site_id`；R3/R1 无 `site_id`  
- 抽查 R3：含城市名；无运算符

---

## 5. 数据与校验

### 5.1 Schema

**不新增字段**；R3 仍用现有 `SearchQuery`（`round: "R3"`，无 `site_id`）。

[`keyword-types.ts`](../../workspace/mcp-servers/lead-store/src/keyword-types.ts) 与桌面 [`keyword-query-rules.ts`](../../desktop/electron/keywords/keyword-query-rules.ts) 对齐扩展：

| 条件 | 结果 |
|------|------|
| `round=R3` 且带 `site_id` | 拒绝 |
| `round=R3` 且 query 含运算符 | 拒绝（与 R2 同文案） |
| `round=R4` | 允许 **读**；编辑器可选手改；扩展仍不生成 |
| `round≠R2` 且带 `site_id` | 拒绝（已有） |

建议将 `FORBIDDEN_R2_QUERY_OPERATOR` 重命名为 **`FORBIDDEN_CHANNEL_QUERY_OPERATOR`**，R2/R3 共用；或 R3 分支复用同一正则。

### 5.2 示例 expansion 片段

```json
{
  "id": "q_041",
  "query": "Bodenbelag Fachhandel München",
  "dimension": "geo",
  "language": "de",
  "priority": "high",
  "round": "R3"
}
```

```json
"stats": {
  "total_queries": 42,
  "by_round": { "R1": 26, "R2": 8, "R3": 8 },
  "by_dimension": { "product": 8, "scenario": 6, "buyer": 10, "geo": 14, "competitor": 4 }
}
```

### 5.3 文档

编码时同步 [03-数据模型.md](../03-数据模型.md) 关键词一节：

- 扩展 **会生成 R3**，仍 **不生成 R4**  
- R3 query 形态与本文 §3 一致  
- R3 执行见 E-08/E-09

---

## 6. Skill 与桌面 Prompt

### 6.1 [`expand-keywords/SKILL.md`](../../workspace/skills/expand-keywords/SKILL.md)

**Step 2** 增补：

- 除 R1/R2 外，生成 **R3 地图发现词**（6～12 条）；仍 **不要 R4**  
- R3 规则见本文 §3

**Step 3 `search_queries` 小节** 修改要点：

- 比例按 §4  
- `round` 允许 `R1` \| `R2` \| `R3`（扩展不要 R4）  
- R3：**不要** `site_id`；禁止运算符；必须含城市/区域 + 本地商户意图  
- 自检增加：R3 条数、无 `site_id`、无运算符、无 R4

**Step 6 摘要** 修改：

- 样例须含 **1～2 条 R3**  
- 下一步：探索页预览 **R3 地图发现**；执行 R3 需 **E-09**（本阶段仅提示「R3 执行尚未开通」或等价一句）

### 6.2 [`agent-runner.ts`](../../desktop/electron/opencode/agent-runner.ts) `buildExpandKeywordsPrompt`

在现网要求上 **替换**「不要生成 R3 或 R4」为：

- **R3**：6～12 条，`round=R3`，城市/区域 + 品类/场景，**不要 site_id**，query 禁止 site:/intitle:/inurl:/filetype:  
- **不要 R4**  
- 自检：`by_round.R3` 在 6～12（total≥40 时），无 R4

R2 启用站点注入 **保持不变**。

---

## 7. 界面

### 7.1 轮次文案（单一来源）

[`desktop/src/explore/round-labels.ts`](../../desktop/src/explore/round-labels.ts)：

| value | label（新） |
|-------|-------------|
| `R3` | **R3 地图发现** |
| `R4` | R4 规划中（不变） |

导出：

- `PLANNED_ROUND_EMPTY` **仅用于 R4**，或拆成两个常量：  
  - `R3_EMPTY` = `暂无 R3 地图发现词，请在画像页重新「扩展关键词」。`  
  - `R4_PLANNED_EMPTY` = `R4 黄页名录仍待评审，扩展时不生成 R4 词。`

[`ExploreView.vue`](../../desktop/src/views/ExploreView.vue) `previewEmptyText`：

- `previewRound === 'R4'` → `R4_PLANNED_EMPTY`  
- `previewRound === 'R3'` → `R3_EMPTY`  
- 其他 → `当前筛选下无搜索词`

[`ExploreView.vue`](../../desktop/src/views/ExploreView.vue) `queryPreviewMeta`：

- `round === 'R3'` → `` `${dim} · R3 地图发现` ``

[`desktop/electron/exploration/r2-query.ts`](../../desktop/electron/exploration/r2-query.ts) `exploreRunTitle`：

- `R3` → `R3 地图发现`（任务列表将来 E-09 用；本故事仅改字符串）

### 7.2 关键词编辑器

[`KeywordEditorDialog.vue`](../../desktop/src/components/shared/KeywordEditorDialog.vue)：

- 轮次下拉沿用 `ROUND_FILTER_OPTIONS` / `ROUND_SELECT_OPTIONS`（随 round-labels 更新）  
- `onRoundChange`：非 R2 时清 `site_id`（已满足 R3）  
- 保存仍走 `saveKeywords` → `validateSearchQueryForSave`

### 7.3 探索页按钮

- **不**增加「开始 R3」  
- R1/R2 按钮与 E-05 行为不变  
- 可选：R3 筛选下空态旁 **不**展示任何开始按钮（与现网 R3 一致）

### 7.4 文案禁则

与 E-01 相同：不得把 R3 写成海关 / 竞品反查 / 贸易数据。R3 说明用 **「地图发现」「本地商户」「Google 地图 / Places」** 等现行 §5.7 用语。

---

## 8. 与后续故事衔接

| 故事 | 衔接 |
|------|------|
| **E-07** | 与出词无关；R3 预览不要求 Key |
| **E-08** | 只跑 `round=R3` 词；query 原样作 Places `textQuery`；`language` → `languageCode` 提示；城市/国家从句中解析或 geocode |
| **E-09** | 有 R3 词 + Places 就绪后可「开始 R3」；本故事仅保证 **有词可预览** |
| **E-01** | R2 站点开关、R2 比例逻辑不变，仅在总数中扣除 R3 份额 |

---

## 9. 验收用例

| # | Given | When | Then |
|---|--------|------|------|
| B1 | 默认 R2 两站启用、画像含 DE/US 市场 | 扩展关键词 | 30～50 条；R1≥60%；R3∈[6,12]；R2 有 site_id；**无 R4** |
| B2 | 扩展完成 | 预览选「R3 地图发现」 | 列出 R3 词；meta 为 `{维度} · R3 地图发现` |
| B3 | 扩展完成 | 抽查 5 条 R3 | 均含城市/区域名；无 `site:`；无 `site_id` |
| B4 | 旧 expansion（无 R3） | 预览 R3、不重新扩展 | 空态为「请重新扩展」类文案，**不是**「规划中不再生成」 |
| B5 | 编辑器新增 R3 行，query 写 `site:maps.google.com x` | 保存 | 失败并提示运算符 |
| B6 | 编辑器 R3 行误选 site_id（若 UI 无站点则 N/A） | 保存 | 失败（无 site_id） |
| B7 | 扩展完成 | R1/R2 筛选与开始 R1/R2 | 与 E-01/E-05 一致 |
| B8 | 预览 R4 | 空态 | 仍为「规划中 / 待评审」，无 R4 词 |
| B9 | 五站全关 R2 | 扩展 | 无 R2；R1+R3 仍满足比例；R3 仍≥6（total≥40） |
| B10 | 文案 | 轮次下拉与帮助 | 无海关/竞品反查旧含义；R3 为「地图发现」 |

---

## 10. 编码任务顺序

1. **校验层**：`keyword-types.ts` + `keyword-query-rules.ts`（R3 运算符 / site_id）；补 `keyword-types.test.ts`、`keyword-query-rules` 单测（若有）。  
2. **`round-labels.ts`**：R3 标签、R3/R4 空态常量；`r2-query.test.ts` 更新 R3 title。  
3. **`expand-keywords` Skill** + **`buildExpandKeywordsPrompt`**：R3 比例与规则。  
4. **ExploreView**：`previewEmptyText`、`queryPreviewMeta`。  
5. **KeywordEditorDialog**：随 round-labels 自动生效；确认 R3 保存路径。  
6. **03-数据模型.md** 关键词一节。  
7. 手工 B1–B10；将 17 号 §14 US-E-06 状态改为「编码已落地」。

---

## 11. 测试清单（自动化建议）

| 文件 | 用例 |
|------|------|
| `keyword-types.test.ts` | R3 无 site_id 通过；R3 含 site: 拒绝；R3 带 site_id 拒绝 |
| `keyword-query-rules.ts` | 同上（桌面 save 路径） |
| `r2-query.test.ts` | `exploreRunTitle(['R3']) === 'R3 地图发现'` |
| `round-labels` | 可选：快照 label 与空态文案 |

Skill 比例与句法 **不做** 单测；靠 B1/B3 手工或后续 golden 扩展 JSON（可选）。

---

## 12. 已确认点汇总

| # | 议题 | 决定 |
|---|------|------|
| Q1 | R3 词义 | Places `textQuery`；城市 + 品类/场景 |
| Q2 | 比例 | R1≥60%；R3 为 6～12；R2 吃剩余 |
| Q3 | R4 | 仍不生成 |
| Q4 | 新字段 | 无；仅自然语言 query |
| Q5 | 执行 | 本故事不跑 R3 |
| Q6 | 空态 | R3 与 R4 文案分离 |
| Q7 | 预研对齐 | 样例见 [R3-Places-API-预研.md](R3-Places-API-预研.md) §6 |
