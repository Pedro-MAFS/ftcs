# US-BS-01 详细设计：探索路径按钮状态（R3 与评分去重）

> **用户故事**：作为外贸业务员，我想在探索页一眼看出「开始 R3」和「评分去重」为何不能点，以便少误点、少试错。  
> **范围**：开始 R3 添加 Places Key 未配置时提前禁用；探索页「评分去重」补充进行中禁用原因 `title`。  
> **依赖**：[26-需求-业务按钮可用状态.md](../26-需求-业务按钮可用状态.md) BS1～BS6、US-BS-01；现网 `useExploreStart.ts` / `ExploreView.vue`；Places Preflight `desktop/electron/preflight/places-start.ts`。  
> **不在本期**：R1/R2 规则变更；OpenCode/搜索 Key/Chrome 等环境类点后 Preflight（BS4）；探索页外的评分去重（见 US-BS-02）；视觉重做（BS6）。  
> **文档位置**：`docs/design/`  
> **状态**：**已确认待开发**

---

## 0. 相对现网

| 现网 | **本期（BS-01）** |
|------|-------------------|
| 开始 R3：Places Key 未配时点击后 `ensureAgentReady('discover-leads-r3')` toast | **提前禁用**按钮；将 Places 可用状态写入 `startR3DisabledReason`；title 与页内 `explore-action-msg` 同源 |
| 探索页「评分去重」：进行中/已有任务时禁用，但 `title` 仍为「对原始线索执行 score-and-dedupe」 | 禁用时 `title` 应为短原因（如「已有任务在运行」），不再只是动作说明 |
| R1 / R2 门槛已正常 | 保持不变（BS 锁定点 #3） |

**说明**：R3 Places 门槛从点击时 Preflight 前移到按钮可用判定，缩短试错路径；评分去重补文案对齐。

---

## 1. 目标与非目标

### 1.1 目标

1. 未配置 Places Key 时，「开始 R3」禁用且用户悬停可见原因（`title`）或在页内 `explore-action-msg` 中看到原因。  
2. 已配置 Places Key 且其他门槛满足时，「开始 R3」可点（不收窄 R1/R2 既有规则）。  
3. 探索页「评分去重」在因进行中/已有任务等原因禁用时，有非空 `title` 说明原因，不再仅显示「对原始线索执行 score-and-dedupe」。  
4. 不改变 OpenCode / 搜索 Key / Chrome 等环境类点后 Preflight 策略（BS4）。  
5. Places 原因文案与现有 `desktop/electron/preflight/places-start.ts` 的 `resolvePlacesStart` 逻辑保持一致。

### 1.2 非目标

| 不做 | 说明 |
|------|------|
| 改 R1 / R2 门槛或文案 | BS 锁定点 #3：R1/R2 已正常，不在范围 |
| 线索页评分去重 | 归 US-BS-02 |
| 收窄进行中互斥 | BS3：保持现网相关操作互斥，只补文案 |
| OpenCode / 搜索 Key / Chrome 点后改前置 | BS4 |

---

## 2. 已确认选型（Q 表）

| 项 | 决定 |
|----|------|
| **Q1 R3 Places 检查** | 在 `useExploreStart` 的 `canStartR3` / `startR3DisabledReason` 中**前置**调用 Places 可用判定；复用主进程已有 `checkAgentPreflight('discover-leads-r3')` 或仿其逻辑同步取 Places Key 状态。马丰顺 2026-10-03 确认：**新增检查 Places Key 未配置时提前禁用；原因字符串写入 `startR3DisabledReason`，与 title / `explore-action-msg` 同源**。 |
| **Q2 原因文案** | Places 未配：「请先在设置 → 探索中配置 Google Places API Key（仅 R3 需要）」（与 `resolvePlacesStart` 对齐）；官方通道拒绝：「R3 需自备 Google Places API Key（设置 → 探索）。官方通道不提供 Places 代调，Places 请用 BYOK 直连 Google」。**不发明新句**，沿用现网 Preflight 文案。 |
| **Q3 评分去重 title** | 探索页 `startScoreAndDedupe` 按钮的 `:title`：`generating.value || isScoring` 时为「已有任务在运行」，否则为动作说明「对原始线索执行 score-and-dedupe」或空（若无合格线索）。与线索页对齐句式（US-BS-02）。 |
| **Q4 不前移其他环境检查** | OpenCode / 搜索 Key / Chrome 等全路径环境检查仍在 `ensureAgentReady` 点击时执行（BS4）；本期只把 **Places 业务门槛**前置到按钮可用判定。 |
| **Q5 R1/R2 不变** | `canStartR1` / `startR1DisabledReason` / `canStartR2` / `startR2DisabledReason` 保持现网逻辑（BS 锁定点 #3）。 |
| **Q6 主改文件** | `desktop/src/composables/useExploreStart.ts`：同步调 Places Key 状态，写入 `startR3DisabledReason`；`desktop/src/views/ExploreView.vue`：评分去重按钮绑 `:title` 动态文案。 |
| **Q7 页内文案展示** | `explore-action-msg` 已绑 `startDisabledReason`（现网），`startR3DisabledReason` 更新后自动显示；无需额外改动。 |

---

## 3. 实现要点

### 3.1 开始 R3 提前禁用逻辑

#### 3.1.1 同步获取 Places Key 状态

在 `useExploreStart.ts` 中，`canStartR3` / `startR3DisabledReason` 需同步判定 Places Key 是否已配置。

**现网链路**：

1. 点击「开始 R3」→ `startR3()` → `ensureAgentReady('discover-leads-r3')` → IPC `checkAgentPreflight` → 主进程 `resolvePlacesStart(settings)` → 返回 `{ ok: boolean, detail: string }`  
2. `ok === false` 时 toast `detail`，中断启动

**本期改为**：

1. 按钮绑定 `canStartR3`，后者在计算时**同步**获取 Places Key 状态（需主进程提供同步调用或渲染进程缓存）  
2. `startR3DisabledReason` 根据 Places 状态返回原因文案  
3. 点击时 `ensureAgentReady` 仍执行（兜底其他环境检查），但 Places 门槛已在按钮层拦截

**可选实现**：

- **方案 A**：在 `useExploreStart` 初始化时从主进程取一次 Places Key 状态（如 `window.ftcs.getSettings()`），存为 `ref`；watch `activeProductId` 时刷新。  
- **方案 B**：在 `startR3DisabledReason` computed 内同步调已缓存的设置快照（需主进程 IPC 改为同步或渲染进程持 Settings 快照）。

建议方案 A（轻量）：

```typescript
const placesKeySet = ref(false)

async function checkPlacesKey(): Promise<void> {
  const settings = await window.ftcs?.getSettings?.()
  placesKeySet.value = settings?.placesApiKeySet ?? false
}

onMounted(() => { void checkPlacesKey() })
watch(activeProductId, () => { void checkPlacesKey() })

const canStartR3 = computed(() => {
  return (
    !!activeProductId.value &&
    hasKeywordsReady.value &&
    r3QueryCount.value > 0 &&
    !generating.value &&
    !isLaunching.value &&
    placesKeySet.value  // 新增
  )
})

const startR3DisabledReason = computed(() => {
  if (generating.value || isLaunching.value) return '已有任务在运行'
  if (!hasKeywordsReady.value) return '请先完成关键词扩展'
  if (!placesKeySet.value) {
    return '请先在设置 → 探索中配置 Google Places API Key（仅 R3 需要）'
  }
  if (r3QueryCount.value > 0) return ''
  return '当前没有 R3 地图发现词，请重新扩展关键词'
})
```

**Q2 官方通道文案**：若未来支持官方通道，`checkPlacesKey` 应调 `resolvePlacesStart` 完整逻辑（含 `channelMode` / `placesProvider`），原因文案直接取 `detail`。本期仅自备 Key 场景，可简化为只判 `placesApiKeySet`。

#### 3.1.2 页内 `explore-action-msg` 展示

现网 `ExploreView.vue` 已有：

```vue
<p
  v-if="hasKeywordsReady && !canStartSelected && !generating && startDisabledReason"
  class="explore-action-msg"
>
  {{ startDisabledReason }}
</p>
```

`startDisabledReason` 根据 `exploreRound` 值指向 `startR1DisabledReason` / `startR2DisabledReason` / `startR3DisabledReason`，因此 `startR3DisabledReason` 更新后此处自动显示，无需额外改动。

#### 3.1.3 按钮 `title`

现网 `ExploreStartControl.vue` 已绑 `:disabled-reason`，传给按钮 `title`。`startDisabledReason` 更新后按钮 `title` 自动生效。

### 3.2 探索页「评分去重」补 title

现网 `ExploreView.vue` L608～L613：

```vue
<button
  v-if="task.status === 'completed' && task.leadsFound > 0"
  type="button"
  class="btn-primary btn-secondary--sm"
  :disabled="generating || isScoring"
  @click="startScoreAndDedupe(task)"
>
  <Icon name="sparkles" :size="11" />
  {{ isScoring ? '评分中…' : '评分去重' }}
</button>
```

**改为**（新增 `:title`）：

```vue
<button
  v-if="task.status === 'completed' && task.leadsFound > 0"
  type="button"
  class="btn-primary btn-secondary--sm"
  :disabled="generating || isScoring"
  :title="
    generating || isScoring
      ? '已有任务在运行'
      : `对 ${task.leadsFound} 条原始线索执行 score-and-dedupe`
  "
  @click="startScoreAndDedupe(task)"
>
  <Icon name="sparkles" :size="11" />
  {{ isScoring ? '评分中…' : '评分去重' }}
</button>
```

**规则**：进行中/已有任务时禁用，`title` 为「已有任务在运行」（BS 锁定点 #1）；可用时可写动作说明或简化为空（与线索页对齐）。

---

## 4. 改动文件

| 路径 | 改动 |
|------|------|
| `desktop/src/composables/useExploreStart.ts` | 新增 `placesKeySet` ref；`checkPlacesKey` 函数；`canStartR3` 新增 Places Key 判定；`startR3DisabledReason` 新增未配原因文案 |
| `desktop/src/views/ExploreView.vue` | 评分去重按钮新增 `:title` 动态文案 |
| `docs/26-需求-业务按钮可用状态.md` | 进仓时 US-BS-01 → 详设已立 + 链接 |

可选：若主进程提供同步 Places Key 状态 IPC，改 `desktop/electron/ipc/types.ts` 与实现。

---

## 5. 验收对照

| 验收要点 | 落点 |
|----------|------|
| 未配置 Places Key 时，「开始 R3」禁用；`title` 与页内 `explore-action-msg` 给出简短原因 | §3.1.1～§3.1.3 |
| 已配置且其他现网条件满足时，「开始 R3」可点 | §3.1.1 `canStartR3` |
| 不收窄 R1/R2 既有规则 | §2 Q5 |
| 探索页「评分去重」禁用时有 `title` | §3.2 |
| 不改环境类点后 Preflight（OpenCode/搜索 Key/Chrome） | §2 Q4；`ensureAgentReady` 仍执行兜底 |

---

## 6. 测试计划

| # | 场景 | 期望 |
|---|------|------|
| T1 | 未配 Places Key，选 R3，关键词就绪 | 「开始 R3」禁用；悬停 title 或页内 `explore-action-msg` 显示「请先在设置 → 探索中配置 Google Places API Key（仅 R3 需要）」 |
| T2 | 配置 Places Key 后刷新 | 「开始 R3」可点（若其他门槛满足） |
| T3 | 官方通道但无 Places 网关（Q10 无限期延后） | title「R3 需自备 Google Places API Key…」 |
| T4 | 探索任务 completed，generating = true | 评分去重按钮禁用，title「已有任务在运行」 |
| T5 | 探索任务 completed，generating = false | 评分去重按钮可点，title 为动作说明 |
| T6 | R1 / R2 场景 | 行为与现网完全一致 |

---

## 7. 风险

| 风险 | 缓解 |
|------|------|
| Settings 异步拉取延迟，按钮状态闪烁 | `checkPlacesKey` 在 mount 时立即调；初始假定未配（保守） |
| 官方通道 Places 逻辑未来变化 | Q2：原因文案直接取 `resolvePlacesStart().detail`，主进程改后自动同步 |
| Places Key 配错但通过前置检查 | `ensureAgentReady` 仍在点击时执行兜底（网络可达、Key 有效等） |

---

## 8. 修订记录

| 日期 | 说明 |
|------|------|
| 2026-10-03 | 初稿：R3 Places Key 前置禁用 + 探索页评分去重 title；对齐 BS 锁定点 #1～#3 |

---

## 9. 下一步

1. 确认 `useExploreStart` Places Key 获取方案（A：异步 ref；B：同步 IPC）。  
2. 确认探索页评分去重 title 详细文案（本设计为「已有任务在运行」+ 动作说明）。  
3. 进入开发：与 US-BS-02 可并行（独立文件）。
