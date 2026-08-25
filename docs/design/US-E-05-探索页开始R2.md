# US-E-05 探索页开始 R2 设计

> **用户故事**：[../17-需求-业务效率工具.md](../17-需求-业务效率工具.md) · US-E-05  
> **状态**：编码已落地  
> **范围**：探索页增加「开始 R2」；启动独立 Skill `discover-leads-r2`（不是给 `discover-leads` 传 `rounds: ["R2"]`）；任务列表能看出是 R2；完成后可从该任务进线索库  
> **依赖**：US-E-01（合格 R2 词）；US-E-03+04（`discover-leads-r2` 正文）  
> **不做**：R3/R4 执行；改评分页；R1 结束后自动连跑 R2；改 `discover-leads` Skill  
> **文档位置**：`docs/design/`

---

## 0. 相对现网

| 现网 | **本期** |
|------|----------|
| 探索页只有「开始 R1」→ IPC `exploration:start-r1` → `runDiscoverLeads` → skill `discover-leads` | 并列「开始 R2」→ 新 IPC `exploration:start-r2` → 同一套会话编排，prompt 改为 `discover-leads-r2` |
| 任务标题为 `rounds.join('+')`（R1 显示 `R1`） | `R2` 显示 **R2 社媒发现**；`R1` 显示 **R1 广撒网**，便于区分 |
| Agent `skill` 只有 `discover-leads` | R2 运行时 `skill: discover-leads-r2` |
| 最多词数只按 R1 计数 | 同一输入框：开始 R1 截 R1 词，开始 R2 截合格 R2 词 |
| expand-keywords prompt 写「R2 尚未开通」 | 改为可建议 `discover-leads-r2` / 探索页开始 R2 |

---

## 1. 已确认选型

| 项 | 决定 |
|----|------|
| **Q1 文案** | 按钮 **「开始 R2」**。无词时 disabled，`title` 说明原因；关键词就绪但无合格 R2 时页头另有一句提示 |
| **Q2 词数上限** | **共用**现网「最多词数」输入。留空 = 该次要跑的轮次全部可用词。R1 / R2 分别按各自可用数 `min(上限, 可用)` |
| **Q3 合格 R2 词** | `round=R2` 且 `site_id` 非空。旧格式（无 `site_id`）不计入、不能点开始。不按设置页 prefs 再滤（与 E-03 Q5 一致） |
| **Q4 IPC** | 新增 `startExploreR2` / `exploration:start-r2`。`startExploreR1` **强制只跑 R1**，即使有人传入 `rounds: ["R2"]` 也不走 R2 Skill |
| **Q5 预检** | 新 kind `discover-leads-r2`：与 R1 相同（搜索 + chrome + lead-store）。不要省掉 chrome |
| **Q6 Prompt** | `请严格按 skill discover-leads-r2`；注入登记表 `site_id → include_domains`（全表，不只启用项）；`max_queries`；禁止调用 `discover-leads` |
| **Q7 任务区分** | `exploration_start({ rounds: ["R2"] })` 已由 Skill 保证。列表标题用轮次中文名；进度分母用该轮词数而非 expansion 总数 |
| **Q8 查看线索** | 沿用现网 `goLeads(task)` → `leads?runId=`。不改评分页。0 条 Lead 的 completed 任务仍可点「查看线索」（空列表） |
| **Q9 R3/R4** | 不加「开始」按钮 |

---

## 2. 界面

[`ExploreView.vue`](../../desktop/src/views/ExploreView.vue)

页头与关键词就绪卡片均增加「开始 R2」，与「开始 R1」并列。

**可点「开始 R2」当且仅当：** 已选产品、关键词就绪、合格 R2 词数 > 0、当前没有 Agent 在跑。

不可点时的原因（`title` / 提示）：

| 条件 | 说明 |
|------|------|
| 未扩展关键词 | 请先完成关键词扩展 |
| 有 R2 但全是旧格式 | 当前 R2 词没有站点，请重新扩展关键词 |
| 没有任何 R2 | 没有可用的 R2 词。请在设置页启用社媒站点后重新扩展 |
| 正在跑任务 | （按钮 disabled，与 R1 相同） |

最多词数：placeholder 同时标出 `R1 n · R2 m`；title「留空表示执行该次开始的轮次全部词」。

启动中占位卡片：R2 显示标题「R2 社媒发现」、正文「正在调用 discover-leads-r2…」。

R3 / R4 筛选仍只有「规划中」空态，无开始按钮。

---

## 3. 桌面接线

### 3.1 IPC

`exploration:start-r2`，入参 `{ productId, maxQueries? }`，返回形态与 R1 相同。

主进程：`gateAgentStart('discover-leads-r2')` → `runDiscoverLeads(productId, emit, { channel: 'r2', maxQueries })`。

### 3.2 `runDiscoverLeads`

在现网会话编排上增加 `channel: 'r1' | 'r2'`（默认 `r1`），**不要**复制一整份函数：

- `r1`：现网 prompt / `skill: discover-leads` / 文案「R1 探索」
- `r2`：新 prompt / `skill: discover-leads-r2` / 文案「R2 社媒发现」；词数按合格 R2 统计；无合格词则启动失败

### 3.3 R2 Prompt 要点

- 严格按 `discover-leads-r2`
- 对照表：yaml 全量 `id` + `include_domains`（`formatR2IncludeDomainsForPrompt`）
- `max_queries`
- 不要调用 `discover-leads`，不要打开社媒 URL
- `exploration_start` 的 `rounds` 必须是 `["R2"]`

### 3.4 预检 / 类型

`AgentPreflightKind` 增加 `discover-leads-r2`；`needsSearch` / `needsChrome` 与 `discover-leads` 相同。

Renderer `electron.d.ts` 与 preload 同步 `startExploreR2`。

### 3.5 任务列表

合格 R2 判定与任务标题抽到 [`r2-query.ts`](../../desktop/electron/exploration/r2-query.ts)（不依赖 Electron `app`，便于单测）。

[`explore-tasks.ts`](../../desktop/electron/exploration/explore-tasks.ts) `runToTask`：

- 标题：单轮次用「R1 广撒网 / R2 社媒发现」
- `totalQueries`：expansion 中该 `rounds` 的词数；R2 只计带 `site_id` 的合格词（不要用 30～50 总数当进度分母）

### 3.6 Agent 面板

`resetAgentForDiscoverLeads` 可带 skill 名；或新增 R2 重置。`useWorkspace` 里「探索中」把 `discover-leads-r2` 算进去。侧栏步骤文案改为 **「3 获客探索」**（R1 或 R2 完成都算）。

### 3.7 expand-keywords 桌面 prompt

删掉「R2 渠道执行尚未开通」；下一步可写探索页「开始 R1」或「开始 R2」。

---

## 4. 验收用例

| # | Given | When | Then |
|---|--------|------|------|
| E1 | 有合格 R2 词、无任务在跑 | 点「开始 R2」 | 预检同 R1；OpenCode 按 `discover-leads-r2`；Agent skill 为该名 |
| E2 | 无 R2 或仅旧格式 | — | 按钮不可用，能看到原因 |
| E3 | 填写最多词数 = 2，R2 有 8 条 | 开始 R2 | prompt 里 max_queries=2 |
| E4 | R2 跑起来 | 看任务列表 | 标题为 R2 社媒发现；进度不是整份 expansion 总数 |
| E5 | R2 完成且有 Lead | 查看线索 | 带 `runId` 进线索库，能看到该 run 的 R2 行 |
| E6 | R2 完成但 0 条 Lead | 任务 | 可为 completed；raw 无新行 |
| E7 | 点「开始 R1」 | — | 仍只跑 `discover-leads`，行为与现网一致 |
| E8 | R3/R4 | — | 无开始按钮，不会执行 |

---

## 5. 编码任务顺序

1. 预检 kind、IPC、preload、类型。  
2. `buildDiscoverLeadsR2Prompt` + `runDiscoverLeads` 的 `channel`。  
3. 探索页按钮、词数、占位、提示。  
4. 任务标题 / 进度分母；expand-keywords prompt。  
5. 单测：include 对照表格式化、任务标题、合格 R2 计数。  
6. 17 号本条改为编码已落地。
