# US-W-07 探索页接入任务执行（延后）

> **用户故事**：[../18-需求-任务编排一键跑通.md](../18-需求-任务编排一键跑通.md) · US-W-07  
> **状态**：延后（v1 不做）  
> **依赖**：US-W-05 落地  
> **不做**：改变线索页 v1 行为

---

## 1. 目标

探索页与线索页统一为 **方案下拉 + 执行**；移除独立 R1/R2/R3 轮次下拉。

## 2. 待详设要点（概要）

- `ExploreView.vue`：`ExploreStartControl` → `WorkflowPlanControl`（非 compact）。  
- 保留「最多执行词数」等参数。  
- 与线索页共用 §5.1 `ftcs.workflow.lastSelectedPlanId`。  
- 废弃 `ftcs.explore.startRound`。

## 3. 验收清单（概要）

- [ ] 探索页与线索页控件行为一致  
- [ ] 执行记忆跨两页共用  
