# US-EI-02 详细设计：去掉探索页「最多词数」

> **用户故事**：作为外贸业务员，我希望开始某一轮探索时跑完该轮已有的词，以便不用再填一个和强度无关的词数上限。  
> **范围**：探索页去掉「最多词数」输入；清除本机旧记忆；开始 R1 / R2 / R3、编排、定时都按该轮合格词全量执行。  
> **依赖**：[24-需求-探索强度.md](../24-需求-探索强度.md) I6；US-EI-02 验收要点。与 US-EI-01 **无编码依赖**（不读 `exploreIntensity`）。  
> **不在本期**：探索强度档位（**US-EI-01**，已落地）；Places 翻页（**US-EI-03**）；扩展关键词目标条数（**US-EI-04**）；每次搜索返回条数与补官网次数（**US-EI-05**）；R3 Places 条数与详情上限（**US-EI-06**）。  
> **文档位置**：`docs/design/`

---

## 0. 相对现网

| 现网 | **本期（EI-02）** |
|------|-------------------|
| 探索页顶栏有「最多词数」数字框 | **删除**该输入 |
| `localStorage` 键 `ftcs.explore.maxQueriesLimit` 记住上次填写的上限 | 进入探索页时 **删除该键**，之后不再读写 |
| `useExploreStart({ maxQueriesLimit })`：正数则 `min(上限, 该轮可用词数)` | **不再接受上限**。开始时 `maxQueries` = 该轮合格词数 |
| 编排 `useExploreStart()` 不传上限，已是全量 | **保持全量**；控件上预留但未使用的 `maxQueriesLimit` prop 删掉，避免以后再接回去 |
| 主进程未传 `maxQueries` 时已按可用词数全量（`agent-runner`） | **不改**这条回退。产品路径改为始终传入该轮合格词数，或省略（二者等价于全量） |
| 技能按指令里的 `max_queries` 截词 | **不改技能正文**。注入的数字等于该轮合格词数，截断后仍是全部 |

「合格词」与现网计数一致，本故事不改筛选规则：

| 轮次 | 计入本次的词 |
|------|----------------|
| R1 | `round=R1` |
| R2 | `round=R2` 且带可解析 `site_id` |
| R3 | `round=R3` 且无 `site_id` |

---

## 1. 目标与非目标

### 1.1 目标

1. 探索页看不到「最多词数」，也不能再填一个比已有词更小的上限。  
2. 以前存在本机的那个数字不再影响开始探索。  
3. 点开始 R1 / R2 / R3、跑编排、定时触发，都执行该轮全部合格词。  
4. 可用词为 0 时仍不能开始（现网 `canStart*` / 主进程报错保持不变）。

### 1.2 非目标

| 不做 | 归属 |
|------|------|
| 读或展示探索强度 | US-EI-01 已有设置；本故事不调用 |
| 改 `num_results`、补官网次数、Places `pageSize`、详情上限 | US-EI-05 / US-EI-06 |
| 改扩展关键词生成多少条 | US-EI-04 |
| 改 R1/R2/R3 合格词判定 | 现网规则保持 |
| 从 IPC 类型里删掉 `maxQueries?` | 保留可选字段，避免无关调用方编译失败；产品路径不再用它做截断 |

---

## 2. 已确认选型（Q 表）

| 项 | 决定 |
|----|------|
| **Q1 全量定义** | `maxQueries` = 该轮 **当前合格词数**（上表）。不是「历史曾经生成过的词」，也不是强度档的目标条数 |
| **Q2 旧记忆** | 键名固定 `ftcs.explore.maxQueriesLimit`。`ExploreView` `onMounted` 时 `localStorage.removeItem`。删除读写函数 `persistMaxQueriesLimit` / `onMaxQueriesInput` 及 ref |
| **Q3 调用链** | `useExploreStart` 去掉 `maxQueriesLimit` 选项。`resolveMaxQueries(available)` 只返回 `Math.max(1, available)`（开始前可用数已 > 0；与现网「未填上限」分支相同） |
| **Q4 编排 / 定时** | `useWorkflowExecute` 已 `useExploreStart()` 且不传上限，定时走 `executePlan` → 同一函数。本故事只删掉 `WorkflowPlanControl` 上未使用的 `maxQueriesLimit` prop，**不**另写调度分支 |
| **Q5 主进程** | `runDiscoverLeads` 在省略 `maxQueries` 时继续 `availableCount`。渲染进程改为传入该轮合格词数（与省略等价，时间线「最多 N 词」与可用数相同）。若传入值大于可用数，现有 `Math.min(maxQueries, availableCount)` 仍兜底 |
| **Q6 技能** | 不改 `discover-leads` / `discover-leads-r2` / `discover-leads-r3` 的截词说明。指令里的数字改为全量后，技能「取前 max_queries 条」即全部合格词 |
| **Q7 样式** | 删除仅服务该输入框的 `.explore-max-queries`、`.explore-max-queries__input`（`desktop/src/styles/main.css`） |
| **Q8 强度** | 本故事 **不** `import` `explore-intensity`。词多词少只看已经生成的 `expansion.json` |

---

## 3. 数据与调用

无新 prefs、无新 IPC。

```text
开始 R1/R2/R3 或编排中的探索步
  → 统计该轮合格词数 available
  → available === 0：沿用现网，按钮不可用 / 主进程报「没有…词」
  → 否则 maxQueries = available
  → startExploreR1/R2/R3({ productId, maxQueries })
  → agent-runner 写入「最多搜索词 max_queries：{available}」
```

定时任务不经探索页，但经 `useWorkflowExecute.executePlan` → `startR1/R2/R3`，因此同一条全量规则生效。

---

## 4. 改动文件

| 路径 | 改动 |
|------|------|
| `desktop/src/views/ExploreView.vue` | 删除顶栏输入、ref、localStorage 读写；`onMounted` 删除旧键；`useExploreStart` 不再传入 `maxQueriesLimit` |
| `desktop/src/composables/useExploreStart.ts` | 删除 `maxQueriesLimit` 选项；`resolveMaxQueries` 只按可用数 |
| `desktop/src/components/workflow/WorkflowPlanControl.vue` | 删除未使用的 `maxQueriesLimit` prop 及默认值 |
| `desktop/src/styles/main.css` | 删除 `.explore-max-queries` 两条规则 |
| `docs/24-需求-探索强度.md` | US-EI-02 状态改为详设已立 |

**不改**：`agent-runner.ts` 的截断兜底、三个发现技能、`explore-intensity*.ts`、设置页。

---

## 5. 验收对照

| 验收要点 | 详设落点 |
|----------|----------|
| 探索页不再显示「最多词数」 | §4 ExploreView 模板 |
| 本机旧记忆不再生效 | §2 Q2：挂载时删键且不再读取 |
| 开始 R1/R2/R3 跑完全部合格词 | §2 Q1、Q3、Q5 |
| 编排和定时不另传词数上限 | §2 Q4 |
| 不读探索强度，不改搜索条数 / Places | §1.2、§2 Q6、Q8 |

---

## 6. 测试计划

| # | 场景 | 期望 |
|---|------|------|
| T1 | 打开探索页 | 顶栏无「最多词数」输入 |
| T2 | 事先写入 `localStorage['ftcs.explore.maxQueriesLimit']='2'`，再打开探索页并开始 R1（该产品 R1 词 > 2） | 键被删除；本次指令中的 `max_queries` 等于 R1 合格词数，不是 2 |
| T3 | R2 只统计带 `site_id` 的词；R3 只统计无 `site_id` 的词 | 与现网计数一致，且不再被输入框缩小 |
| T4 | 该轮合格词为 0 | 仍不能开始，提示与现网相同 |
| T5 | 线索页一键编排含探索步、以及定时触发同一方案 | 不出现词数输入；探索步的 `max_queries` 等于该步轮次的合格词数 |
| T6 | 设置里的探索强度 | 本故事改动后行为不变（仍只存档位，不参与截词） |

手工即可。`resolveMaxQueries` 若仍是 composable 内部函数，不强制单测；若抽成纯函数再补一条「忽略任何外部上限」。

---

## 7. 修订记录

| 日期 | 说明 |
|------|------|
| 2026-09-29 | 初稿：删探索页词数输入与 localStorage；开始/编排/定时按该轮合格词全量 |
| 2026-09-29 | 编码落地 |
