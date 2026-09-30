# US-EI-06 详细设计：R3 的 Places 条数与详情上限

> **用户故事**：作为外贸业务员，我想地图发现按当前强度多取或少取地点,并只给其中约四分之三查详情，以便高档能覆盖更多候选，又不把每一条都拿去查详情。  
> **范围**：启动 R3 时注入当前档的 `placesResultLimit`；改写 `discover-leads-r3` 中写死的 `pageSize=20` 与 `MAX_DETAILS_PER_KEYWORD=15`；详情上限改为 ⌊本次 Places 实际返回 × 3/4⌋。  
> **依赖**：[24-需求-探索强度.md](../24-需求-探索强度.md) §4.2、§4.3、I5、I8、I12；[US-EI-01](US-EI-01-探索强度设置.md) `placesResultLimit` / `floorThreeQuarters`；[US-EI-03](US-EI-03-Places超过20条自动翻页.md)（高档 40 由 MCP 翻页合并，技能不自己翻页）；US-EI-06 验收要点。  
> **不在本期**：扩展关键词（**US-EI-04**）；搜索 `num_results` 与补官网次数（**US-EI-05**）；官网 chrome 打开上限（每词 2 / 每轮 15）；改 places-api MCP 翻页逻辑（已由 EI-03 落地）。  
> **文档位置**：`docs/design/`  
> **状态**：详设已立（2026-09-29）

---

## 0. 相对现网

| 现网 | **本期（EI-06）** |
|------|-------------------|
| R3 技能 / prompt：`pageSize: 20` | 启动时注入 `places_result_limit = T_places`（低 10 / 中 20 / 高 40）；技能传该值给 `places_text_search` |
| `MAX_DETAILS_PER_KEYWORD = 15`；过滤后取前 15 调 Details | 上限 = ⌊本次 Places **实际返回** × 3/4⌋；先过滤，再按原顺序取到上限 |
| 高档要 40 时技能无法单次拿到 | **依赖 EI-03**：技能只传 40，MCP 翻两页合并；技能不翻页 |
| 官网 chrome：每词 2、每轮 15 | **不变** |
| Tavily 补官网 `num_results` / 次数 | **不变**（属 EI-05；若 EI-05 已合，分母自然吃到更大的 Places 实际返回） |

满页对照（文档用）：

| 档 | Places 请求 → 满页详情上限 |
|----|---------------------------|
| 低 | 10 → 7 |
| 中 | 20 → 15（与现网一致） |
| 高 | 40 → 30 |

实际返回不足请求时：分母用实际条数，不是 `T_places`（例如请求 40 只回 25 → 详情上限 ⌊25×0.75⌋=18）。

---

## 1. 目标与非目标

### 1.1 目标

1. 每个 R3 词向 places-api 要的条数：低 10、中 20、高 40。  
2. 高档由 **EI-03 已落地的 MCP** 翻页合并；技能与 prompt **禁止**自己处理 `nextPageToken`。  
3. 详情上限 = ⌊本次 Places 实际返回 × 3/4⌋；先按现有规则过滤，再按原顺序取到上限；不够就有多少查多少。  
4. 用任务**开始那一刻**的档。  
5. 数字只来自 EI-01 常量表，技能不读 prefs。  
6. 中档且满页时行为与现网一致（20 / 15）。

### 1.2 非目标

| 不做 | 归属 |
|------|------|
| MCP 翻页实现 | **US-EI-03**（已落地） |
| `search_num_results` / 补官网 3/4 | **US-EI-05** |
| 扩展关键词目标 | **US-EI-04** |
| 改官网 chrome 2/15 | docs/24 §6.2 |
| 技能自己读 prefs / 自己翻页 | 禁止 |

---

## 2. 已确认选型（Q 表）

| 项 | 决定 |
|----|------|
| **Q1 数字来源** | `getExploreIntensityLimits().placesResultLimit` → `T_places`；详情用既有 `floorThreeQuarters` |
| **Q2 注入点** | 主进程 `buildDiscoverLeadsR3Prompt` 内读 limits；渲染进程不传 intensity |
| **Q3 指令字段** | 写明：`探索强度`、`places_result_limit：{T_places}`、`places_text_search 的 pageSize（要多少条）必须用此值`、`详情上限：⌊本次 Places 实际返回×3/4⌋`、`先过滤再按原顺序取到上限`、`禁止技能自己翻页`、`官网打开仍每词2/每轮15` |
| **Q4 与 EI-03** | 本故事假设 MCP 已支持 1～60 并在 >20 时翻页；若运行环境未合入 EI-03，高档传 40 会失败——实现前确认 main 已含 EI-03 |
| **Q5 过滤顺序** | 保持现网：Places 结果 → 现有过滤规则 → 再截到详情上限 → 再调 `place_details` |
| **Q6 实际返回 < 请求** | 详情分母 = 实际返回；上游无下一页时 MCP 返回已合并条数，技能按实际算 3/4，不为凑满失败 |
| **Q7 编排/定时** | 同一 R3 runner → 自动吃到开始时档位 |
| **Q8 技能副本** | 改 `workspace/skills/discover-leads-r3/SKILL.md` 及现网同步副本 |
| **Q9 与 EI-05 顺序** | 可独立合入；建议 EI-05 先合，这样高档 Places 变大后补搜上限也跟着变。本故事**不**改 Tavily 段 |

---

## 3. 数据流

```text
开始 R3（含编排/定时）
  → AgentRunner.runDiscoverR3*
  → limits = getExploreIntensityLimits()
  → prompt 注入 places_result_limit + 详情 3/4 规则
  → 技能 places_text_search(pageSize=T_places)  // MCP 在 >20 时翻页
  → 过滤 → 取前 ⌊实际返回×3/4⌋ 条 Details
```

---

## 4. Prompt 增量（仅 R3）

在现有 max_queries / 轮次说明之后追加（或替换写死 20/15 的句子）：

```text
探索强度：{low|medium|high}
places_result_limit：{T_places}
- places_text_search 的 pageSize（「要多少条」）必须用此值；不要写死 20
- 不要自己翻页或使用 nextPageToken（MCP 已处理）
- Place Details 上限 = floor(本次 Places 实际返回条数 × 0.75)；先过滤，再按原顺序取到该上限；不要写死 15
- 官网 chrome 打开：仍每词最多 2、每轮最多 15（不变）
```

若 EI-05 已合入，保留其 `search_num_results` / 补官网规则段落，本故事只增改 Places/详情相关句，勿冲掉 EI-05 文案。

---

## 5. 技能正文改动要点（`discover-leads-r3`）

| 现网表述 | 改为 |
|----------|------|
| `PLACES_PAGE_SIZE = 20` / `pageSize: 20` | 使用任务指令中的 `places_result_limit` |
| `MAX_DETAILS_PER_KEYWORD = 15` / 「过滤后取前 15」 | ⌊实际返回 × 3/4⌋；说明满页对照 7/15/30 |
| 限制表「每词 Place Details \| 15」 | 同上动态上限 |
| 「不翻页」说明 | 调用方不翻页；条数 >20 由 MCP 合并（指向 EI-03） |

**不改**：Tavily 补官网段（除非 EI-05 尚未合且需临时兼容——默认假定按故事顺序，本 PR 只动 Places/详情）；chrome 2/15；写入 Lead 口径。

---

## 6. 改动文件

| 路径 | 改动 |
|------|------|
| `desktop/electron/opencode/agent-runner.ts` | `buildDiscoverLeadsR3Prompt` 注入 `T_places` 与详情 3/4 |
| `workspace/skills/discover-leads-r3/SKILL.md` | §5 |
| 技能同步副本 | 与上同文 |
| `docs/24` | 进仓时 US-EI-06 → 详设已立 |

**不改**：`explore-intensity-logic` 数字表、places-api MCP（EI-03）、R1/R2 技能、扩展关键词技能。

---

## 7. 验收对照

| 验收要点 | 落点 |
|----------|------|
| 低 10 / 中 20 / 高 40；高档 MCP 翻页，技能不翻页 | §1.1、§2 Q1–Q4、§5 |
| 详情 = 实际返回 ×3/4；满页 7/15/30；先过滤再取 | §0、§2 Q5–Q6、§5 |
| 用开始时档 | §1.1.4、§3 |
| 中档满页详情仍 15 | §0、§1.1.6 |

---

## 8. 测试计划

| # | 场景 | 期望 |
|---|------|------|
| T1 | 中档开始 R3 | 指令 `places_result_limit：20`；详情上限满页 15；与现网一致 |
| T2 | 低档开始 R3 | 指令 10；满页详情 ≤7 |
| T3 | 高档开始 R3（EI-03 已合） | 指令 40；技能单次调用；MCP 约 2 次 Text Search；满页详情 ≤30 |
| T4 | 高档但实际只回 22 | 详情上限 ⌊22×0.75⌋=16 |
| T5 | 只改档不重跑 | 进行中任务不受影响；下次开始才用新档 |
| T6 | 编排含 R3 | 与手动开始同一注入 |
| T7 | 回归：过滤后不足上限 | 有多少查多少，不报错凑数 |

---

## 9. 风险

| 风险 | 缓解 |
|------|------|
| EI-06 合入但 EI-03 未合 | 实现 checklist 首条：确认 places-api 已支持 >20；否则高档阻塞 |
| 模型仍写死 pageSize=20 | Skill + prompt 双改，去掉硬编码 20/15 |
| 高档费用约翻倍（每词约 2 次 Text Search + 更多 Details） | 设置页强度说明已有；不改费用逻辑 |
| 与未合入的 EI-05 叠 PR | 改同一 R3 skill/prompt 时注意合并冲突；本故事不碰 Tavily 段降低冲突面 |

---

## 10. 修订记录

| 日期 | 说明 |
|------|------|
| 2026-09-29 | 详设已立：注入 placesResultLimit；详情 ⌊实际×3/4⌋；依赖 EI-03；不改补官网与 chrome |
