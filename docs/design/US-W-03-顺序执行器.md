# US-W-03 顺序执行器（等价自动连点）

> **用户故事**：[../18-需求-任务编排一键跑通.md](../18-需求-任务编排一键跑通.md) · US-W-03  
> **状态**：待详设  
> **依赖**：US-W-01、US-W-02；现网 `useExploreStart` / `LeadsView` score·draft IPC  
> **不做**：后台静默；完成通知

---

## 1. 设计原则

**执行器 = 按方案顺序调用现网「主按钮」同一套 IPC，逐步 await `agent` `done`。**

不新增编排专用 Agent Skill；不新增独立进度 UI。

---

## 2. 待详设要点

### 2.1 模块位置

- 渲染进程：`useWorkflowExecute.ts`（或 `desktop/src/composables/`）。  
- 可选主进程协调：`workflow-runner.ts`（若需统一 abort）；详设二选一，优先 **渲染进程串 IPC** 以对齐「帮用户点击」。

### 2.2 步骤 → IPC 映射

| nodeId | 调用 |
|--------|------|
| `expand-keywords` | 同 `ProfileView.createExploreTask` → `expandKeywords(productId)` |
| `discover-r1` | 同 `useExploreStart.startR1()` |
| `discover-r2` | 同 `startR2()` |
| `discover-r3` | 同 `startR3()` |
| `score-and-dedupe` | 同 `LeadsView.onScoreClick` → `scoreAndDedupe` |
| `draft-outreach-email` | 同 `LeadsView.onBatchDraftClick` → `draftEmails`（high 批量） |

每步前调用对应 `resetAgentFor*`；每步后 `await agentDone(ok)` + `refreshPipelineArtifacts()`。

**扩展关键词**：与画像页相同，执行前须 **画像 `ready` 且无未保存修改**；不满足时 Preflight / 启动 IPC 失败则停在该步（W-05 线索页执行时亦同）。

### 2.3 Preflight

- 新函数 `runWorkflowPreflight(plan)`：对 `plan.steps` 去重合并各步 `ensureAgentReady` / 主进程 `gateAgentStart` 要求。  
- 任一项失败 → 不启动执行器，按钮保持可点。

### 2.4 失败与中止

- 某步 `done.ok === false` → 停止，写入 `actionMessage` / 时间线 error。  
- 用户点中止 → `abortProfile`，执行器清 `running` 状态。

### 2.5 与 AgentPanel

- 每步产生的时间线条目 **追加**，与手动连点四次的视觉效果一致。

---

## 3. 验收清单

- [ ] `builtin-standard` 四步串跑 E2E（手工）  
- [ ] R2 Preflight 失败时不启动 R1  
- [ ] 第二步失败时不跑评分  
- [ ] 中止后不再自动下一步  
