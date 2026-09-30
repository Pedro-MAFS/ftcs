# US-EI-05 详细设计：搜索返回条数按档

> **用户故事**：作为外贸业务员，我想探索时每次搜索返回的条数跟当前强度一致，以便高档能多看结果、低档少看结果。  
> **范围**：启动 R1 / R2 / R3 探索时，把当前档的 `searchNumResults` 与补官网次数规则写入 Agent 指令；改写三个 discover 技能中写死的 `num_results=5`、每词补搜 2、每轮补搜 20。  
> **依赖**：[24-需求-探索强度.md](../24-需求-探索强度.md) I5、I7、I13；[US-EI-01](US-EI-01-探索强度设置.md) `getExploreIntensityLimits().searchNumResults` 与 `floorThreeQuarters`；US-EI-05 验收要点。  
> **不在本期**：扩展关键词目标（**US-EI-04**）；Places 返回条数与详情上限（**US-EI-06**）；官网 chrome 打开上限（每词 2 / 每轮 15，保持现网）。  
> **文档位置**：`docs/design/`  
> **状态**：编码已落地（2026-09-30）

---

## 0. 相对现网

| 现网 | **本期（EI-05）** |
|------|-------------------|
| R1/R2/R3 技能与部分 prompt：`num_results: 5` | 启动时注入 `search_num_results = T_search`（低 3 / 中 5 / 高 10） |
| R2：每词二次搜 ≤2、每轮 ≤20；补搜也 `num_results: 5` | 每词补搜上限 = ⌊本次**主结果实际返回条数** × 3/4⌋；取消每轮 20；四处搜索同一 `T_search` |
| R3：每词 Tavily 补官网 ≤2、每轮 ≤20；`num_results: 5` | 同上：按主结果（Places 实际返回）×3/4；取消每轮 20；`num_results` 用 `T_search` |
| 官网 chrome：每词 2、每轮 15 | **不变** |
| Places `pageSize=20`、详情 ≤15 | **不变**（留给 EI-06） |

「主结果」定义（I13）：

| 场景 | 主结果 | 补搜分母 |
|------|--------|----------|
| R2 社媒词 | 该词社媒 `search_web` 实际返回条数 | ⌊实际返回 × 3/4⌋ |
| R3 缺官网 | 该词 Places 合并后实际返回条数 | ⌊实际返回 × 3/4⌋ |
| R1 | 无「补官网」二次搜；仅主搜 `num_results=T_search` | — |

满页对照（文档用）：

| 档 | 搜索返回 → 社媒补搜上限 | Places 满页无官网 → 补搜上限 |
|----|-------------------------|------------------------------|
| 低 | 3 → 2 | 10 → 7 |
| 中 | 5 → 3 | 20 → 15 |
| 高 | 10 → 7 | 40 → 30 |

中档社媒因此从现网每词 2 次变为最多 3 次。

---

## 1. 目标与非目标

### 1.1 目标

1. R1、R2 社媒、R2 补官网、R3 缺官网 Tavily **四处** 的 `num_results` 均为当前档的 3 / 5 / 10。  
2. 补官网上限按 I13：⌊主结果实际返回 × 3/4⌋；已有官网的条目不占次数；取消固定每词 2 与每轮 20。  
3. 用任务**开始那一刻**的档（与关键词哪一档生成无关）。  
4. 数字只来自 EI-01 常量表，技能不读 prefs。  
5. 官网打开不设每词、每轮次数上限（2026-09-30 起；原先「保持每词 2 / 每轮 15」已取消）。

### 1.2 非目标

| 不做 | 归属 |
|------|------|
| Places 要多少条 / 详情 3/4 | **US-EI-06** |
| 扩展关键词条数 | **US-EI-04** |
| 改搜索接口硬顶（仍 ≤10） | 现网约束 |
| 技能自己读 prefs | 禁止 |

---

## 2. 已确认选型（Q 表）

| 项 | 决定 |
|----|------|
| **Q1 数字来源** | `getExploreIntensityLimits().searchNumResults` → `T_search` |
| **Q2 注入点** | 主进程三个 prompt 构建函数：`buildDiscoverLeadsPrompt`、`buildDiscoverLeadsR2Prompt`、`buildDiscoverLeadsR3Prompt` 内读 limits；渲染进程不传 intensity |
| **Q3 指令字段** | 写明：`探索强度`、`search_num_results：{T_search}`、`补官网次数上限：⌊主结果实际返回×3/4⌋（已有官网不占）`、`取消每词固定2与每轮20`、`官网打开不设每词、每轮次数上限` |
| **Q4 R1** | 仅改 `num_results`；R1 无二次补官网循环，技能里「对每条搜索结果」循环上界改为指令中的 `search_num_results`（不再写死 5） |
| **Q5 R2** | 社媒搜与二次搜均用 `T_search`；本词二次搜上限 = ⌊本词社媒实际返回 × 3/4⌋；删除「本轮二次搜 < 20」闸门 |
| **Q6 R3（本故事）** | 仅改 Tavily 补官网的 `num_results` 与次数上限（分母 = 该词 Places **实际返回**）；**不**改 `pageSize=20` / Details≤15（EI-06） |
| **Q7 实际返回 < 请求** | 分母用实际条数，不是 `T_search`；例如请求 10 只回 4 → 补搜上限 ⌊4×0.75⌋=3 |
| **Q8 编排/定时** | 走同一 runner → 自动吃到开始时档位 |
| **Q9 技能副本** | 改 `workspace/skills/discover-leads{,-r2,-r3}/SKILL.md` 及现网同步副本 |

---

## 3. 数据流

```text
开始 R1/R2/R3（含编排/定时）
  → AgentRunner 对应 runDiscover*
  → limits = getExploreIntensityLimits()
  → prompt 注入 search_num_results + 补官网 3/4 规则
  → 技能按指令执行（不读 prefs）
```

---

## 4. Prompt 增量（三路共用口径）

在现有 max_queries / 轮次说明之后追加：

```text
探索强度：{low|medium|high}
search_num_results：{T_search}
- 所有 search_web（含 R2 社媒、R2/R3 补官网）的 num_results 必须用此值（上限 10，已是档位硬顶）
- 补官网：每词次数上限 = floor(本次主结果实际返回条数 × 0.75)；已有官网的条目不消耗次数；不要再用「每词 2 / 每轮 20」
- 官网 chrome 打开：已解析出的公司官网都打开并判断。不设每词、每轮打开次数上限
```

R3 prompt **本故事不改** `pageSize=20` / `place_details(≤15)` 字样（留给 EI-06 整段替换）。

---

## 5. 技能正文改动要点

### 5.1 `discover-leads`

- `num_results: 5` → 使用任务指令中的 `search_num_results`
- 「对每条搜索结果（最多 5 个）」→ 最多 `search_num_results` 个
- search-api 要点表同步

### 5.2 `discover-leads-r2`

- 限制表：删除每词二次 2、每轮二次 20；改为 3/4 规则；`num_results` 两处改为指令值
- Step 2c 闸门改为本词补搜次数 < ⌊社媒实际返回×3/4⌋

### 5.3 `discover-leads-r3`

- 仅改 Tavily 补官网段：`num_results` 与每词/每轮补搜上限 → 3/4 + 取消每轮 20
- **保留** Places pageSize 20、Details 15 至 EI-06

---

## 6. 改动文件

| 路径 | 改动 |
|------|------|
| `desktop/electron/opencode/agent-runner.ts` | 三个 discover prompt 注入 `T_search` 与补官网规则 |
| `workspace/skills/discover-leads/SKILL.md` | §5.1 |
| `workspace/skills/discover-leads-r2/SKILL.md` | §5.2 |
| `workspace/skills/discover-leads-r3/SKILL.md` | §5.3（仅 Tavily 段） |
| 技能同步副本 | 与上同文 |
| `docs/24` | 进仓时 US-EI-05 → 详设已立 |

**不改**：`explore-intensity-logic` 数字表、Places MCP、扩展关键词技能。

---

## 7. 验收对照

| 验收要点 | 落点 |
|----------|------|
| 低 3 / 中 5 / 高 10；四处一起变 | §2 Q1–Q6、§4 |
| 补官网 = 实际返回 ×3/4；取消每词 2 / 每轮 20 | §0、§5.2/5.3 |
| 用开始时档 | §1.1.3、§3 |
| 官网打开不设每词、每轮次数上限 | §1.1.5、§4 |
| 不改 Places 条数与详情 | §1.2、§2 Q6 |

---

## 8. 测试计划

| # | 场景 | 期望 |
|---|------|------|
| T1 | 中档开始 R1 | 指令 `search_num_results：5`；技能行为与现网主搜一致 |
| T2 | 高档开始 R1 | 指令为 10；打开候选循环上界按返回条数 ≤10 |
| T3 | 中档 R2，社媒满页 5 | 本词补搜最多 3；无「每轮 20」截断（除非 chrome 15 先到） |
| T4 | 低档 R2，只回 2 条 | 补搜上限 ⌊2×0.75⌋=1 |
| T5 | 高档 R3（Places 仍现网 20） | Tavily 补搜 `num_results=10`；补搜上限按 Places 实际返回×3/4；Details 仍 ≤15 |
| T6 | 只改档不重跑 | 进行中任务不受影响；下次开始才用新档 |
| T7 | 编排含探索步 | 与手动开始同一注入 |

---

## 9. 风险

| 风险 | 缓解 |
|------|------|
| EI-05 先合、EI-06 未合时高档 Places 仍 20 | 需求允许；补搜上限按实际返回算，高档 Places 变 40 后自然升到 30 |
| 模型忽略指令仍用 5 | Skill 与 prompt 双改，去掉硬编码 5 |
| 取消每轮 20 后补搜变多 | 仍受 chrome 每轮 15 与费用约束；设置页已有强度费用说明 |

---

## 10. 修订记录

| 日期 | 说明 |
|------|------|
| 2026-09-29 | 草案：四处 search_num_results；补官网 3/4；取消每词 2/每轮 20；Places/详情留给 EI-06 |
| 2026-09-29 | 详设已立（进仓 Pedro-MAFS/ftcs） |
| 2026-09-30 | 编码落地：三路探索指令注入 search_num_results；补官网改为实际返回的 3/4；Places 条数与详情仍留给 EI-06 |
| 2026-09-30 | 取消官网打开的每词 2、每轮 15。已解析出的公司官网都打开并判断 |
