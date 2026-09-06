# US-W-02 方案下拉与「执行」控件

> **用户故事**：[../18-需求-任务编排一键跑通.md](../18-需求-任务编排一键跑通.md) · US-W-02  
> **状态**：待详设  
> **依赖**：US-W-01  
> **不做**：多步顺序执行（W-03）；弹框 CRUD（W-04）

---

## 1. 待详设要点

### 1.1 组件

- 升级或替换 `ExploreStartControl.vue` → **`WorkflowPlanControl.vue`**。  
- Props：`compact?: boolean`、`maxQueriesLimit?`（探索页传入，与现网一致）。  
- Emits：`execute(planId)`、`update:selectedPlanId`。

### 1.2 交互

```
[ 标准获客（R1→R2→评分→邮件） ▼ ]  [ ▶ 执行 ]
```

- 默认选中：读取 **§5.1 执行记忆**；无有效记忆 → `builtin-standard`。  
- 忙碌时按钮 **执行中…**；禁用时 `title` 给出原因。

### 1.3 执行记忆（§5.1）

```typescript
const STORAGE_KEY = 'ftcs.workflow.lastSelectedPlanId'

function readLastSelectedPlanId(availableIds: string[]): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && availableIds.includes(saved)) return saved
  } catch { /* ignore */ }
  return 'builtin-standard'
}

function writeLastSelectedPlanId(planId: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, planId)
  } catch { /* ignore */ }
}
```

| 时机 | 行为 |
|------|------|
| 控件 `onMounted` + 方案列表就绪 | `selectedPlanId = readLastSelectedPlanId(...)` |
| 用户更改下拉 | `writeLastSelectedPlanId(planId)` |
| 用户删除当前方案 | 回退 `builtin-standard` 并写入 storage |
| 探索页 ↔ 线索页 | US-W-07 后 **同一** `STORAGE_KEY`；v1 仅线索页写入 |

**不**在「执行成功」时才记忆——用户只切换下拉也应保留选择。

### 1.4 迁移

- W-02 单独交付时：「执行」跑当前选中方案（单步用户方案或四步标准预置）；多步串跑由 W-03 完成。  
- 移除 R1/R2/R3 硬编码 `<option>`；不再提供对应 **内置** 预置。  
- 废弃 `ftcs.explore.startRound`：**推迟到 US-W-07**（v1 探索页仍用该键记 R1/R2/R3）。

---

## 2. 验收清单

- [ ] 下拉仅显示方案名称  
- [ ] 按钮文案「执行 / 执行中…」  
- [ ] 首次进入默认「标准获客」  
- [ ] 选中「标准获客」后重启应用，探索页 / 线索页仍选中「标准获客」  
- [ ] 选中自定义方案后切换页面，选中不变  
- [ ] 删除已记忆方案后自动回退「标准获客」  
