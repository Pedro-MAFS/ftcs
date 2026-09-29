# US-EI-04 详细设计：扩展关键词按档给目标

> **用户故事**：作为外贸业务员，我想扩展关键词时按当前强度生成 R1、每个社媒和 R3 的目标条数，以便词的数量跟我选的档一致，又不会为了凑数写出垃圾词。  
> **范围**：启动 `expand-keywords` 时把当前档的目标写入 Agent 指令；改写技能正文与自检口径；摘要说明实际条数（可低于目标）。  
> **依赖**：[24-需求-探索强度.md](../24-需求-探索强度.md) I2、I4、I9～I11；[US-EI-01](US-EI-01-探索强度设置.md) 已落地的 `getExploreIntensity` / `getExploreIntensityLimits().keywordTargetPerRound`；US-EI-04 验收要点。  
> **不在本期**：去掉「最多词数」（**US-EI-02**，已落地）；Places 翻页（**US-EI-03**，已落地）；搜索返回条数 / 补官网次数（**US-EI-05**）；R3 Places 条数与详情上限（**US-EI-06**）。  
> **文档位置**：`docs/design/`  
> **状态**：详设已立（2026-09-29）

---

## 0. 相对现网

| 现网 | **本期（EI-04）** |
|------|-------------------|
| `buildExpandKeywordsPrompt` 写死「30～50 条；R1≥60%；R3 6～12；R2 吃剩余、每站≥2」 | 启动时读 `keywordTargetPerRound`（低 10 / 中 20 / 高 40），写入指令；R1、**每个启用社媒**、R3 各用同一目标；不设总数上限 |
| `workspace/skills/expand-keywords/SKILL.md` 同上旧口径 | 与指令对齐：按档目标、允许少写、R3 用更多城市/搜法凑目标；删除 30～50 / 60% / 6～12 / 每站至少 2 |
| 自检要求 `stats.total_queries >= 30`、`by_round.R3 ∈ [6,12]` | 改为：对照指令中的目标检查各轮；允许低于目标但须在摘要说明原因 |
| 设置里已有档位（EI-01）但扩展不读 | **本故事接上**：扩展路径读档；改档 alone 仍不改写已有 `expansion.json`（I4） |

---

## 1. 目标与非目标

### 1.1 目标

1. 用户点「扩展关键词」（含编排中的扩展步）时，按**开始那一刻**的探索强度生成词。  
2. 目标数字只来自 EI-01 常量表 `keywordTargetPerRound`，禁止在 Skill 或 prompt 里另写一套。  
3. R1 目标 = T；每个**当前启用**社媒的 R2 目标 = T；R3 目标 = T；不设总数上限；不生成 R4。  
4. 尽可能达到目标；产品简单、再写会重复/空泛时可少写，摘要写明实际条数与原因。  
5. R3 用更多城市/区域与不同搜法接近目标，不靠同义反复。  
6. 只改档、不点扩展 → 已有 `expansion.json` 不变。

### 1.2 非目标

| 不做 | 归属 |
|------|------|
| 改探索时的 `num_results` / 补官网次数 | **US-EI-05** |
| 改 Places `pageSize` / 详情上限 | **US-EI-06** |
| 技能自己读 prefs / 设置文件 | 禁止；只信指令注入的数字（与现网 `max_queries` 模式一致） |
| 改档后自动重跑扩展 | 需求非范围（I4） |
| 自定义每一项数字、按产品存档 | 需求非范围 |
| 改 R2 启用站点读写逻辑 | 现网 `explore-r2` 保持 |

---

## 2. 已确认选型（Q 表）

| 项 | 决定 |
|----|------|
| **Q1 目标来源** | `const T = getExploreIntensityLimits().keywordTargetPerRound`（内部已 `getExploreIntensity()`）。低 10 / 中 20 / 高 40 |
| **Q2 注入位置** | 仅主进程 `buildExpandKeywordsPrompt(productId, limits)`（或等价：先算 T 再拼 prompt）。渲染进程**不必**传 intensity；避免双源 |
| **Q3 指令写法** | 用明确字段，便于技能与抽检对齐，例如：`探索强度：medium`；`关键词目标 keyword_target_per_round：20`；`R1 目标：20`；`R2 目标（每个当前启用社媒）：20`；`R3 目标：20`；并写一句「尽可能达到；允许少于目标，摘要说明原因；不设总数上限；不要 R4」 |
| **Q4 启用社媒** | 仍由技能按现网读 yaml + prefs；桌面**不**在本故事把站点列表再注入一遍。R2 总条数预期 ≈ T × 启用站点数 |
| **Q5 0 个启用站** | 与现网一致：不出 R2；R1、R3 仍各以 T 为目标 |
| **Q6 技能落盘** | 改 `workspace/skills/expand-keywords/SKILL.md`（及 desktop 同步技能副本若有；以仓库实际同步路径为准，编码时对照 `AGENTS.md` / 现有技能同步机制）。正文删除旧 Phase1 30～50 / R1≥60% / R3 6～12 / 每站至少 2；改为「读任务指令中的目标」 |
| **Q7 自检** | 技能 Step 5：检查 R1 / 各启用站 R2 / R3 是否接近指令目标；**不再**强制 `total >= 30`；少写不算失败，但摘要必须说明 |
| **Q8 编排 / 定时** | `executePlan` 的扩展步走同一 `runExpandKeywords` → 自动吃到当前档。无需单独传参 |
| **Q9 探索页 UI** | 本故事**不**在探索页展示档位或目标数字（设置里已有）；可选：扩展完成摘要里带「按中档目标 20」一行，推荐做（便于验收） |
| **Q10 旧 expansion** | 不迁移、不重算。用户改档后须再次扩展才看到新词量 |

---

## 3. 数据流

```text
用户点扩展关键词 / 编排扩展步
  → AgentRunner.runExpandKeywords(productId)
  → T = getExploreIntensityLimits().keywordTargetPerRound
  → prompt = buildExpandKeywordsPrompt(productId, T, intensityLabel)
  → OpenCode 跑 expand-keywords
  → keywords_save → expansion.json（整文件覆盖，与现网一致）
  → 摘要：各轮实际条数 vs 目标；若低于目标写原因
```

改档（EI-01）**不**进入本路径，故不触碰 `expansion.json`。

---

## 4. Prompt 草案（替换现网 `buildExpandKeywordsPrompt` 核心条）

保留：product_id、读画像、五维、keywords_save、禁止 `keywords_expand`、禁止运算符、R2 须 `site_id`、不要 R4。

**删除/替换**原「30～50 / R1≥60% / R3 6～12 / R2 剩余每站≥2」为：

```text
探索强度：{low|medium|high}
关键词目标 keyword_target_per_round：{T}
- R1 目标：{T} 条（尽可能达到；无 site_id）
- R2 目标：每个当前启用社媒各 {T} 条（每条必须带 site_id；未启用站不出词；0 个启用站则不要 R2）
- R3 目标：{T} 条（城市/区域 + 品类/场景；无 site_id；用更多地理位置与不同搜法接近目标，禁止同义反复凑数）
- 不设 search_queries 总数上限；不要 round=R4
- 产品简单、再写会重复或空泛时允许少于目标；保存后摘要须写明各轮实际条数与目标，低于目标时用一句话说明原因
- 质量：像真人会搜的词；不捏造画像没有的认证、规格或竞品专名
```

自检句改为对照上述目标，去掉 `total_queries >= 30` 与 `R3 ∈ [6,12]` 硬门槛。

---

## 5. 技能正文改动要点（`expand-keywords/SKILL.md`）

| 段落 | 改动 |
|------|------|
| Step 2 获客目标 | 删除「R1 占多数」「R3 6～12」；改为「按任务指令中的 R1 / 每启用社媒 R2 / R3 目标」 |
| Step 3 `search_queries` | 删除总数 30～50、R1≥60%、R3 6～12、每站至少 2、剩余给 R2；写入与 §4 一致的目标规则 |
| Step 5 自检 | 按指令目标核对；允许低于目标；摘要必含目标与实际 |
| 输出要求 | 删除 `stats.total_queries >= 30`；改为「各轮尽量接近指令目标」 |
| 错误处理 | 「查询数 < 30」改为「远低于目标且无摘要说明时继续补全；有合理少写说明则可结束」 |

**不改**：Schema 字段形状、`keywords_save` 调用方式、五维 `dimensions` 要求。

---

## 6. 改动文件

| 路径 | 改动 |
|------|------|
| `desktop/electron/opencode/agent-runner.ts` | `buildExpandKeywordsPrompt` 接收/内读 T；替换数量规则段落 |
| `desktop/electron/explore/explore-intensity.ts`（或 logic） | **只读**已有 API；本故事不改常量表数字 |
| `workspace/skills/expand-keywords/SKILL.md` | §5 |
| 技能同步副本（若 desktop/resources 或 workspace-template 有副本） | 与上同文；编码时按现网同步方式一并改 |
| `docs/24-需求-探索强度.md` | US-EI-04 状态 → 详设已立（进仓时） |
| 可选单测 | 抽纯函数 `formatExpandKeywordsTargets(T, intensity)` 测文案含正确数字；不强制跑真实 Agent |

**不改**：`useExploreStart`、三个 discover 技能、places-api、设置页 UI（除非做摘要展示所需的时间线文案，属 agent done message）。

---

## 7. 验收对照

| 验收要点（docs/24） | 详设落点 |
|--------------------|----------|
| 目标低 10 / 中 20 / 高 40；R1、每启用社媒、R3 同一数 | §2 Q1、§4 |
| 未启用社媒不出词；不设总数上限；不要 R4 | §2 Q4/Q5、§4 |
| 尽可能达到；可少写并摘要说明 | §4、§5 Step 5 |
| R3 用更多城市/搜法，不靠同义反复 | §4、技能 Step 3 |
| 改档不自动重跑扩展 | §1.1.6、§3 |
| 不改探索搜索条数 / Places | §1.2 |

---

## 8. 测试计划

| # | 场景 | 期望 |
|---|------|------|
| T1 | prefs 中档（或默认）扩展 | 指令含 `keyword_target_per_round：20`；生成后 R1≈20、每启用站 R2≈20、R3≈20（允许略少） |
| T2 | 切到高档后**不**扩展 | 已有 expansion.json 内容不变 |
| T3 | 高档后再扩展 | 指令目标 40；词量明显高于中档（同画像） |
| T4 | 低档 + 2 个启用站 | R1 目标 10；两站 R2 各约 10；R3 约 10 |
| T5 | 关闭全部 R2 站 | 无 R2 词；R1/R3 仍按 T |
| T6 | 极简画像故意难凑满 | 允许 total < 3T；摘要有原因；任务仍 ok |
| T7 | 编排方案含「扩展关键词」 | 与手动扩展同一 prompt 规则 |
| T8 | `getExploreIntensityLimits` 三档 | 仍为 10/20/40（回归 EI-01 表） |

---

## 9. 风险与缓解

| 风险 | 缓解 |
|------|------|
| 高档 + 多社媒 → 一次扩展近百词，贵且慢 | 需求已接受；设置页 EI-01 已有费用提示 |
| 模型仍按旧 Skill 记忆凑 30～50 | 同步改 Skill + prompt，自检去掉旧硬门槛 |
| 桌面与 workspace 技能副本不一致 | 编码清单列齐所有副本路径 |
| 少写被用户当成 bug | 摘要强制「目标 vs 实际 + 原因」 |

---

## 10. 修订记录

| 日期 | 说明 |
|------|------|
| 2026-09-29 | 草案：接 EI-01 常量表；改 prompt + expand-keywords 技能；允许低于目标；明确非目标留给 EI-05/06 |
| 2026-09-29 | 正式写入 docs/design；状态改为详设已立 |
