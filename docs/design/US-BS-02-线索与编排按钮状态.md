# US-BS-02 详细设计：线索与编排按钮状态

> **用户故事**：作为外贸业务员，我想在线索页与任务方案「执行」上提前看到业务门槛与进行中原因，以便不必点下去才发现失败。  
> **范围**：线索页「评分去重」「批量起草」「行内写邮件/重写邮件」进行中 `title`；方案「执行」提前禁用（`assertStepReady` 业务门槛）；补全按钮进行中 `title` 顺手对齐。  
> **依赖**：[26-需求-业务按钮可用状态.md](../26-需求-业务按钮可用状态.md) BS1～BS6、US-BS-02；现网 `LeadsView.vue` / `useWorkflowExecute.ts` / `WorkflowPlanControl.vue`。  
> **不在本期**：开发信审核页按钮（BS 4.2 Out）；定时按钮（Out）；OpenCode / 搜索 Key / Chrome 环境类点后 Preflight（BS4）；视觉重做（BS6）。  
> **文档位置**：`docs/design/`  
> **状态**：**已确认待开发**

---

## 0. 相对现网

| 现网 | **本期（BS-02）** |
|------|-------------------|
| 线索页「评分去重」「批量起草」「写邮件/重写邮件」：进行中禁用，但 `title` 仍为动作说明或空 | 进行中时 `title` 精确为「已有任务在运行」（BS 锁定点 #1） |
| 方案「执行」：选中后点击时才调 `assertStepReady`，失败 toast | **选中即提前禁用**；能同步判定的业务门槛（无产品、已有任务、探索/评分/起草前置数据）写入按钮 `disabled-reason` `title`；环境类（OpenCode/搜索 Key/Chrome）仍点后 Preflight |
| 补全按钮进行中禁用，title 可能不统一 | 顺手对齐「已有任务在运行」 |

**说明**：进行中互斥保持现网（BS3），只补文案；执行按钮从「仅点后感知失败」变为「选中方案即前置禁用+原因」。

---

## 1. 目标与非目标

### 1.1 目标

1. 线索页「评分去重」「批量起草」「行内写邮件 / 重写邮件」在因进行中 / 已有任务禁用时，`title` 为「已有任务在运行」，不再仅显示动作说明或为空。  
2. 方案「执行」按钮在选中方案后，对 `assertStepReady` 能同步判定的业务门槛提前禁用并给出短原因；点击后不再是唯一获知这些门槛的方式。  
3. 保持相关操作互斥（BS3）：`generating` / `scoring` / `drafting` / `enriching` / `isWorkflowRunning` 等状态锁相关按钮，不收窄为只锁同一按钮。  
4. 环境类 Preflight（OpenCode / 搜索 Key / Chrome / Hunter Key 可达等）仍在点击时执行（BS4），不强制全部前置。  
5. 批量补全 / 行内补全按钮进行中 `title` 可顺手对齐，不算范围膨胀（BS 开放问题 O3）。

### 1.2 非目标

| 不做 | 说明 |
|------|------|
| 开发信审核页按钮 | BS 4.2 Out |
| 定时启用 / 新建按钮 | Out |
| 收窄进行中互斥为单按钮 | BS3 |
| OpenCode / 搜索 Key / Chrome 点后改前置 | BS4 |
| 全面重做视觉 | BS6 |

---

## 2. 已确认选型（Q 表）

| 项 | 决定 |
|----|------|
| **Q1 进行中统一文案** | 线索页评分去重、批量起草、写邮件、重写邮件、批量补全、行内补全：进行中 `title` 精确为「**已有任务在运行**」（BS 锁定点 #1）。不发明其他句子。 |
| **Q2 方案执行前置判定** | 在 `WorkflowPlanControl` 选中方案后，立即调用 `assertStepReady` **同步可判定的业务门槛**（无产品、已有任务、R1/R2/R3 条件、评分/起草/补全前置数据），写入 `disabled-reason`；环境类（OpenCode/搜索 Key/Chrome）仍留在 `runWorkflowPreflight` 点击时执行（BS4）。 |
| **Q3 assertStepReady 同步门槛清单** | 见 §3.2；逐项对照现网实现，**不添加代码中不存在的检查**（BS 锁定点 #2）。 |
| **Q4 环境类 Preflight 不前移** | `runWorkflowPreflight` → `ensureAgentReady` → OpenCode / 搜索 Key / Chrome / Hunter Key 网络可达等全路径检查**仍在点击时**（BS4）。本期只把**业务门槛**前置到按钮。 |
| **Q5 主改文件** | `desktop/src/views/LeadsView.vue`：评分/起草/写邮件/补全按钮绑 `:title`；`desktop/src/components/workflow/WorkflowPlanControl.vue`：选中方案后调 `assertStepReady` 同步门槛，更新 `disabledReason`。 |
| **Q6 补全按钮** | 批量补全、行内补全顺手在本故事对齐进行中 `title`（BS O3 允许）。 |

---

## 3. 实现要点

### 3.1 线索页按钮进行中 title

#### 3.1.1 评分去重

现网 `LeadsView.vue` L888～L900：

```vue
<button
  type="button"
  class="btn-primary"
  :disabled="!canScore"
  :title="
    stats.raw > 0
      ? '对原始线索执行 score-and-dedupe'
      : '需要先有未评分的原始线索'
  "
  @click="onScoreClick"
>
  {{ isScoring ? '评分中…' : '评分去重' }}
</button>
```

**改为**：

```vue
<button
  type="button"
  class="btn-primary"
  :disabled="!canScore"
  :title="
    (generating || isScoring || isDrafting || isEnriching || isWorkflowRunning)
      ? '已有任务在运行'
      : stats.raw > 0
        ? '对原始线索执行 score-and-dedupe'
        : '需要先有未评分的原始线索'
  "
  @click="onScoreClick"
>
  {{ isScoring ? '评分中…' : '评分去重' }}
</button>
```

**规则**：`canScore` 已包含 `!generating && !isScoring && !isDrafting && !isEnriching && !isWorkflowRunning`（现网 L384～L394），因此禁用时必然符合「进行中」条件，优先返回「已有任务在运行」；否则才显示动作说明或前置数据缺失原因。

#### 3.1.2 批量起草

现网 L874～L887：

```vue
<button
  type="button"
  class="btn-secondary"
  :disabled="!canBatchDraft"
  :title="
    pendingHighIds.length > 0
      ? `为 ${pendingHighIds.length} 条线索批量起草（每条 1+N 封，Agent 撰写）`
      : '暂无待起草的已评分线索'
  "
  @click="onBatchDraftClick"
>
  {{ isDrafting ? '起草中…' : `批量起草${pendingHighIds.length ? ` ${pendingHighIds.length} 条` : ''}` }}
</button>
```

**改为**：

```vue
<button
  type="button"
  class="btn-secondary"
  :disabled="!canBatchDraft"
  :title="
    (generating || isDrafting || isScoring || isEnriching || isWorkflowRunning)
      ? '已有任务在运行'
      : pendingHighIds.length > 0
        ? `为 ${pendingHighIds.length} 条线索批量起草（每条 1+N 封，Agent 撰写）`
        : '暂无待起草的已评分线索'
  "
  @click="onBatchDraftClick"
>
  {{ isDrafting ? '起草中…' : `批量起草${pendingHighIds.length ? ` ${pendingHighIds.length} 条` : ''}` }}
</button>
```

#### 3.1.3 行内写邮件 / 重写邮件

现网 L1140～L1150：

```vue
<button
  v-if="row.phase === 'scored'"
  type="button"
  class="leads-table__action"
  :disabled="isDrafting || generating || isEnriching"
  :title="hasDrafted(row) ? '重新生成开发信草稿' : '生成开发信草稿'"
  @click.stop="onDraftLead(row)"
>
  {{ hasDrafted(row) ? '重写邮件' : '写邮件' }}
</button>
```

**改为**：

```vue
<button
  v-if="row.phase === 'scored'"
  type="button"
  class="leads-table__action"
  :disabled="isDrafting || generating || isEnriching"
  :title="
    (isDrafting || generating || isEnriching)
      ? '已有任务在运行'
      : hasDrafted(row)
        ? '重新生成开发信草稿'
        : '生成开发信草稿'
  "
  @click.stop="onDraftLead(row)"
>
  {{ hasDrafted(row) ? '重写邮件' : '写邮件' }}
</button>
```

#### 3.1.4 批量补全 / 行内补全（顺手对齐）

批量补全 L856～L873：

```vue
<button
  type="button"
  class="btn-secondary"
  :disabled="!canBatchEnrich"
  :title="
    !hunterKeySet
      ? '请先在设置 → 集成配置 Hunter API Key'
      : pendingEnrichIds.length > 0
        ? `为 ${pendingEnrichIds.length} 条尚无 people 的已评分线索批量补全`
        : '暂无待补全线索（需已评分、有官网域名、且尚未有关键联系人）'
  "
  @click="onBatchEnrichClick"
>
  {{
    isEnriching
      ? '补全中…'
      : `批量补全${pendingEnrichIds.length ? ` ${pendingEnrichIds.length}` : ''}`
  }}
</button>
```

**改为**（新增进行中判定）：

```vue
<button
  type="button"
  class="btn-secondary"
  :disabled="!canBatchEnrich"
  :title="
    (generating || isScoring || isDrafting || isEnriching || isWorkflowRunning)
      ? '已有任务在运行'
      : !hunterKeySet
        ? '请先在设置 → 集成配置 Hunter API Key'
        : pendingEnrichIds.length > 0
          ? `为 ${pendingEnrichIds.length} 条尚无 people 的已评分线索批量补全`
          : '暂无待补全线索（需已评分、有官网域名、且尚未有关键联系人）'
  "
  @click="onBatchEnrichClick"
>
  {{
    isEnriching
      ? '补全中…'
      : `批量补全${pendingEnrichIds.length ? ` ${pendingEnrichIds.length}` : ''}`
  }}
</button>
```

行内补全 L1130～L1139：

```vue
<button
  v-if="row.phase === 'scored'"
  type="button"
  class="leads-table__action"
  :disabled="isDrafting || isEnriching || generating || !canEnrichLead(row)"
  :title="enrichTitle(row)"
  @click.stop="onEnrichLead(row)"
>
  {{ isEnriching ? '补全中…' : '补全联系人' }}
</button>
```

**改为**（`enrichTitle` 函数内已处理大部分，补充进行中判定）：

```typescript
// LeadsView.vue script
function enrichTitle(lead: LeadRowDto): string {
  // 新增：进行中优先
  if (isDrafting.value || isEnriching.value || generating.value) {
    return '已有任务在运行'
  }
  if (lead.phase !== 'scored') return '仅已评分线索可补全联系人'
  if (!parseCompanyDomain(lead.company.website || lead.domain)) {
    return '请先填写有效官网域名'
  }
  if (!hunterKeySet.value) {
    return '请先在设置 → 集成中配置 Hunter API Key'
  }
  return hunterVerifyEmails.value
    ? '补全联系人并验证邮箱（约 0.5 credit/封）'
    : '补全联系人（Domain Search，约 1 credit）'
}
```

### 3.2 方案「执行」按钮前置业务门槛

#### 3.2.1 现网 `assertStepReady` 逻辑梳理

`useWorkflowExecute.ts` L145～L183 `assertStepReady(nodeId)`：

| nodeId | 检查 | 类型 |
|--------|------|------|
| `expand-keywords` | 无产品 → 「请先在侧栏选择产品」<br>`currentProfile.value?.status !== 'ready'` → 「画像未就绪，请补全必填字段后再执行」 | **同步业务门槛** |
| `discover-r1` | `!explore.canStartR1.value` → `explore.startR1DisabledReason.value \|\| '无法开始 R1 探索'` | **同步业务门槛**（含已有任务、无关键词等） |
| `discover-r2` | 同上 R2 | **同步业务门槛** |
| `discover-r3` | 同上 R3 | **同步业务门槛**（US-BS-01 后包含 Places Key） |
| `score-and-dedupe` | `leadsSnapshot.value?.stats.raw ?? 0 <= 0` → 「暂无未评分原始线索，请先完成探索」 | **同步业务门槛** |
| `draft-outreach-email` | `emailDraftsSnapshot.value?.pendingHighLeadIds.length ?? 0 <= 0` → 「暂无待起草的已评分线索」 | **同步业务门槛** |
| `enrich-lead-contacts` | `countPendingEnrich(leadsSnapshot.value?.rows) <= 0` → 「暂无待补全线索（需已评分、有官网域名、且尚未有关键联系人）」 | **同步业务门槛** |

**共同前置**（L146～L147）：

```typescript
if (!activeProductId.value) return '请先在侧栏选择产品'
if (generating.value) return '已有任务在运行'
```

**环境类 Preflight**（点击时，不前移）：

- `runWorkflowPreflight` → `ensureAgentReady` → OpenCode / 搜索 Key / Chrome / Hunter Key 网络可达等（BS4）

**结论**：`assertStepReady` **全部逻辑**均为同步可判定的业务门槛，可前置到按钮；点击时 `runWorkflowPreflight` 仍执行环境类检查。

#### 3.2.2 方案选中后提前禁用

`WorkflowPlanControl.vue` 需在选中方案（`selectedPlanId` 更新）后：

1. 对该方案的 `steps` 逐个调 `assertStepReady(step.nodeId)`  
2. 若任一步返回非空原因，按钮禁用，`disabledReason` 取首个失败步骤的原因  
3. 全部通过则按钮可用

**现网 `WorkflowPlanControl.vue` 已有**：

- `disabled` / `disabledReason` props  
- `executing` 进行中状态  
- `@execute` 事件

**新增 computed**（伪代码）：

```typescript
import { useWorkspace } from '@/composables/useWorkspace'
import { useExploreStart } from '@/composables/useExploreStart'
import { parseCompanyDomain } from '@/utils/parse-company-domain'

const {
  activeProductId,
  currentProfile,
  leadsSnapshot,
  emailDraftsSnapshot,
  generating,
} = useWorkspace()

const explore = useExploreStart()

function assertStepReadyInline(nodeId: WorkflowNodeId): string | null {
  if (!activeProductId.value) return '请先在侧栏选择产品'
  if (generating.value) return '已有任务在运行'

  switch (nodeId) {
    case 'expand-keywords':
      if (currentProfile.value?.status !== 'ready') {
        return '画像未就绪，请补全必填字段后再执行'
      }
      return null
    case 'discover-r1':
      if (!explore.canStartR1.value) return explore.startR1DisabledReason.value || '无法开始 R1 探索'
      return null
    case 'discover-r2':
      if (!explore.canStartR2.value) return explore.startR2DisabledReason.value || '无法开始 R2 探索'
      return null
    case 'discover-r3':
      if (!explore.canStartR3.value) return explore.startR3DisabledReason.value || '无法开始 R3 探索'
      return null
    case 'score-and-dedupe': {
      const raw = leadsSnapshot.value?.stats.raw ?? 0
      if (raw <= 0) return '暂无未评分原始线索，请先完成探索'
      return null
    }
    case 'draft-outreach-email': {
      const pending = emailDraftsSnapshot.value?.pendingHighLeadIds.length ?? 0
      if (pending <= 0) return '暂无待起草的已评分线索'
      return null
    }
    case 'enrich-lead-contacts': {
      const pending = (leadsSnapshot.value?.rows ?? []).filter(
        (row) =>
          row.phase === 'scored' &&
          Boolean(parseCompanyDomain(row.company?.website || row.domain)) &&
          (!row.people || row.people.length === 0),
      ).length
      if (pending <= 0) {
        return '暂无待补全线索（需已评分、有官网域名、且尚未有关键联系人）'
      }
      return null
    }
    default:
      return null  // 未知步骤不提前拦截，留给点击时处理
  }
}

const preExecuteReason = computed(() => {
  const plan = selectedPlan.value
  if (!plan) return ''
  for (const step of plan.steps) {
    const reason = assertStepReadyInline(step.nodeId)
    if (reason) return reason
  }
  return ''
})

const finalDisabled = computed(() => {
  return props.disabled || !!preExecuteReason.value || props.executing
})

const finalDisabledReason = computed(() => {
  if (props.executing) return '方案执行中'
  if (preExecuteReason.value) return preExecuteReason.value
  return props.disabledReason
})
```

按钮绑：

```vue
<button
  type="button"
  :disabled="finalDisabled"
  :title="finalDisabledReason"
  @click="onExecute"
>
  {{ executing ? '执行中…' : '执行' }}
</button>
```

**注意**：`assertStepReadyInline` 与 `useWorkflowExecute.ts` 的 `assertStepReady` **逻辑完全一致**（BS 锁定点 #2），可考虑抽为共享函数；但因 composable 依赖链（`useExploreStart` / `useWorkspace`），直接复制逻辑更简单。

#### 3.2.3 点击时仍执行环境 Preflight

现网 `executePlan` L336～L339：

```typescript
const preflightErr = await runWorkflowPreflight(plan)
if (preflightErr) {
  return { ok: false, message: preflightErr, completedSteps: 0 }
}
```

**保持不变**（BS4）。按钮层已拦业务门槛，点击时 `runWorkflowPreflight` 仍检查 OpenCode / 搜索 Key / Chrome / Hunter Key 等环境，确保全路径可用。

---

## 4. 改动文件

| 路径 | 改动 |
|------|------|
| `desktop/src/views/LeadsView.vue` | 评分去重、批量起草、写邮件/重写邮件、批量补全按钮新增 `:title` 进行中判定；`enrichTitle` 函数补进行中优先判定 |
| `desktop/src/components/workflow/WorkflowPlanControl.vue` | 新增 `assertStepReadyInline` 函数；`preExecuteReason` computed；`finalDisabled` / `finalDisabledReason` 合并 props 与业务门槛 |
| `docs/26-需求-业务按钮可用状态.md` | 进仓时 US-BS-02 → 详设已立 + 链接 |

可选：抽 `assertStepReadyInline` 为 `composables/useWorkflowStepGate.ts` 共享函数（需处理 composable 依赖）。

---

## 5. 验收对照

| 验收要点 | 落点 |
|----------|------|
| 线索页评分去重 / 批量起草 / 行内写邮件：进行中 title「已有任务在运行」 | §3.1.1～§3.1.3 |
| 方案执行：业务门槛提前禁用+原因（复用 assertStepReady 类逻辑） | §3.2.1～§3.2.2 |
| 环境类 Preflight 仍点击后 | §3.2.3 |
| 保持相关操作互斥（generating / drafting / scoring / enriching / isWorkflowRunning） | §3.1 各按钮 `disabled` 条件不变 |
| 补全按钮顺手对齐 | §3.1.4 |
| 未扩大到 Out 清单（开发信审核页、定时） | §1.2 |

---

## 6. 测试计划

| # | 场景 | 期望 |
|---|------|------|
| T1 | 线索页，generating = true，悬停「评分去重」 | 按钮禁用，title「已有任务在运行」 |
| T2 | 线索页，isDrafting = true，悬停「批量起草」 | 同上 |
| T3 | 线索页，generating = true，悬停行内「写邮件」 | 同上 |
| T4 | 线索页，isEnriching = true，悬停「批量补全」 | 同上 |
| T5 | 线索页，已评分线索，行内「补全联系人」，generating = true | title「已有任务在运行」 |
| T6 | 方案选中，无产品 | 执行按钮禁用，title「请先在侧栏选择产品」 |
| T7 | 方案选中，步骤含 discover-r1，但 `canStartR1 = false` | 执行按钮禁用，title 为 `startR1DisabledReason`（如「请先完成关键词扩展」） |
| T8 | 方案选中，步骤含 score-and-dedupe，但 `raw = 0` | 执行按钮禁用，title「暂无未评分原始线索，请先完成探索」 |
| T9 | 方案选中，步骤含 draft-outreach-email，但 `pendingHighIds.length = 0` | 执行按钮禁用，title「暂无待起草的已评分线索」 |
| T10 | 方案选中，步骤含 enrich-lead-contacts，但无待补全线索 | 执行按钮禁用，title「暂无待补全线索（需已评分、有官网域名、且尚未有关键联系人）」 |
| T11 | 方案选中，业务门槛全满足，点击 | 弹 OpenCode / 搜索 Key / Chrome 等环境 Preflight，失败 toast；业务门槛已前置，不重复 |
| T12 | 开发信审核页「驳回」「通过」 | 行为与现网一致（本期不改） |

---

## 7. 风险

| 风险 | 缓解 |
|------|------|
| `assertStepReadyInline` 与 `assertStepReady` 逻辑重复，易不同步 | 单测验证二者结果一致；或抽共享函数（需处理 composable 依赖） |
| `leadsSnapshot` / `emailDraftsSnapshot` 异步更新延迟 | 现网已依赖这些快照，方案执行前会刷新（`refreshPipelineArtifacts`） |
| 环境 Preflight 点击时失败，用户误以为业务门槛有遗漏 | 文案区分：业务门槛为「暂无…」「请先…」；环境 Preflight 为「OpenCode 未启动」等 |

---

## 8. 修订记录

| 日期 | 说明 |
|------|------|
| 2026-10-03 | 初稿：线索页按钮进行中 title + 方案执行前置业务门槛；对齐 BS 锁定点 #1～#3；补全按钮顺手对齐 |

---

## 9. 下一步

1. 确认 `assertStepReadyInline` 实现位置（复制逻辑 vs 抽共享函数）。  
2. 确认补全按钮文案细节（本设计已包含）。  
3. 进入开发：与 US-BS-01 可并行（独立文件）。
