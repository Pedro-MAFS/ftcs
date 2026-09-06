# US-W-05 线索页接入任务执行

> **用户故事**：[../18-需求-任务编排一键跑通.md](../18-需求-任务编排一键跑通.md) · US-W-05  
> **状态**：待详设  
> **依赖**：US-W-02、US-W-03  
> **不做**：探索页（→ US-W-07）；录入页 / 邮件页 / 顶栏流水线

---

## 1. v1 范围

| 页面 | v1 |
|------|-----|
| **线索页** | ✅ 接入 `WorkflowPlanControl` |
| **探索页** | ❌ **保持现网** `ExploreStartControl`（R1/R2/R3） |

理由：循环获客主场景是「看线索 → 再跑一轮」；探索页仍负责看词表、任务列表与 **单次** R1/R2/R3 调试。

---

## 1.1 线索页 `LeadsView.vue`

- compact 版 `WorkflowPlanControl`，**替换**现网 `ExploreStartControl`。  
- 副标题 / 空态：「暂无线索 · 选择方案并执行」。  
- **保留**「评分去重」「批量起草」单步按钮；与「执行中」互斥 disabled。  
- 需要看探索任务列表时，用户仍通过顶栏 / 流水线进入 **探索页**（现网入口不变）。

### 1.2 探索页 `ExploreView.vue`（本故事不改）

- 继续 `ExploreStartControl` + `useExploreStart`。  
- US-W-07 再替换为 `WorkflowPlanControl`。

### 1.3 执行器与 `useExploreStart`

- W-03 执行器内部 **复用** `useExploreStart` 的 R1/R2/R3 启动逻辑（从线索页触发），避免双份 Preflight。  
- `ftcs.explore.startRound`：探索页 **继续沿用** 直至 US-W-07；线索页改用 `ftcs.workflow.lastSelectedPlanId`（§5.1）。

### 1.4 流水线

- 不修改 `derivePipelineSteps`；执行器每步结束后 `refreshPipelineArtifacts`。

---

## 2. 验收清单

- [ ] 线索页选「标准获客」执行四步  
- [ ] 探索页仍为 R1/R2/R3，无方案下拉  
- [ ] 执行中评分 / 起草 / 第二套执行均 disabled  
- [ ] 执行记忆仅在线索页操作时写入，再进线索页可恢复  
