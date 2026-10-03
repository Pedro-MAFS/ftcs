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
| 方案「执行」：选中后点击时才调 `assertStepReady`，失败 toast | **保持现网行为**；点击时才检查基本配置（无产品、已有任务进行中），失败 toast；**不**提前禁用，**不**写入业务数据门槛（无未评分线索、评分去重未就绪、起草未就绪、补全前置数据等）到按钮 |
| 补全按钮进行中禁用，title 可能不统一 | 顺手对齐「已有任务在运行」 |

**说明**：进行中互斥保持现网（BS3），只补文案；执行按钮的业务数据提前禁用方案已尝试并回滚（2026-10-03），仍保持点击时才判定失败。

---

## 1. 目标与非目标

### 1.1 目标

1. 线索页「评分去重」「批量起草」「行内写邮件 / 重写邮件」在因进行中 / 已有任务禁用时，`title` 为「已有任务在运行」，不再仅显示动作说明或为空。  
2. **方案「执行」按钮保持现网行为**：点击时才调用 `assertStepReady` 检查基本配置（无产品、已有任务进行中），失败时 toast 提示；**不**从业务数据（无未评分线索、评分去重未就绪、起草未就绪、补全前置数据）提前禁用按钮。  
3. 保持相关操作互斥（BS3）：`generating` / `scoring` / `drafting` / `enriching` / `isWorkflowRunning` 等状态锁相关按钮，不收窄为只锁同一按钮。  
4. 批量补全 / 行内补全按钮进行中 `title` 可顺手对齐，不算范围膨胀（BS 开放问题 O3）。

### 1.2 非目标

| 不做 | 说明 |
|------|------|
| 开发信审核页按钮 | BS 4.2 Out |
| 定时启用 / 新建按钮 | Out |
| 收窄进行中互斥为单按钮 | BS3 |
| 方案执行按钮提前禁用业务数据门槛 | 已尝试并回滚（2026-10-03）；仍保持点击时检查 |
| 全面重做视觉 | BS6 |

---

## 2. 已确认选型（Q 表）

| 项 | 决定 |
|----|------|
| **Q1 进行中统一文案** | 线索页评分去重、批量起草、写邮件、重写邮件、批量补全、行内补全：进行中 `title` 精确为「**已有任务在运行**」（BS 锁定点 #1）。不发明其他句子。 |
| **Q2 方案执行按钮行为** | **回滚到现网行为**（2026-10-03）：点击时才调用 `assertStepReady` 检查基本配置（无产品、已有任务进行中），失败时 toast；**不**从业务数据（无未评分线索、评分去重未就绪、起草未就绪、补全前置数据）提前禁用按钮。环境类 Preflight（OpenCode / 搜索 Key / Chrome）仍在点击时执行。 |
| **Q3 主改文件** | `desktop/src/views/LeadsView.vue`：评分/起草/写邮件/补全按钮绑 `:title` 进行中判定；`desktop/src/components/workflow/WorkflowPlanControl.vue` **不改**（保持现网）。 |
| **Q4 补全按钮** | 批量补全、行内补全顺手在本故事对齐进行中 `title`（BS O3 允许）。 |

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

### 3.2 方案「执行」按钮行为（回滚）

**2026-10-03 决定**：执行按钮**不**提前禁用业务数据门槛，回滚到现网行为。

#### 3.2.1 现网行为保持

`useWorkflowExecute.ts` 中 `executePlan` 在点击时调用：

1. **基本配置检查**（在 `assertStepReady` 中，已在现网）：
   - 无产品 → 「请先在侧栏选择产品」
   - `generating.value` → 「已有任务在运行」

2. **环境类 Preflight**（在 `runWorkflowPreflight` 中，已在现网）：
   - OpenCode / 搜索 Key / Chrome / Hunter Key 可达性等

3. **业务数据门槛**（在 `assertStepReady` 各 nodeId case 中，已在现网）：
   - 无未评分线索、评分去重未就绪、起草未就绪、补全前置数据等

**全部检查仍在点击时执行**，失败时 toast 提示。按钮**不**提前禁用，**不**写入 `disabled-reason`。

#### 3.2.2 WorkflowPlanControl.vue 不改

`desktop/src/components/workflow/WorkflowPlanControl.vue` **保持现网代码不变**；不新增 `assertStepReadyInline` / `preExecuteReason` / `finalDisabled` 等逻辑。

---

## 4. 改动文件

| 路径 | 改动 |
|------|------|
| `desktop/src/views/LeadsView.vue` | 评分去重、批量起草、写邮件/重写邮件、批量补全按钮新增 `:title` 进行中判定；`enrichTitle` 函数补进行中优先判定 |
| `desktop/src/components/workflow/WorkflowPlanControl.vue` | **不改**（保持现网点击时检查行为） |
| `docs/26-需求-业务按钮可用状态.md` | 进仓时 US-BS-02 → 详设已立 + 链接 |

---

## 5. 验收对照

| 验收要点 | 落点 |
|----------|------|
| 线索页评分去重 / 批量起草 / 行内写邮件：进行中 title「已有任务在运行」 | §3.1.1～§3.1.3 |
| 方案执行：**保持现网**，点击时才检查，失败 toast | §3.2 |
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
| T6 | 方案选中，无产品，点击执行 | toast「请先在侧栏选择产品」；按钮**可点击**（不提前禁用） |
| T7 | 方案选中，步骤含 discover-r1，但 `canStartR1 = false`，点击执行 | toast 为 `startR1DisabledReason`（如「请先完成关键词扩展」）；按钮**可点击** |
| T8 | 方案选中，步骤含 score-and-dedupe，但 `raw = 0`，点击执行 | toast「暂无未评分原始线索，请先完成探索」；按钮**可点击** |
| T9 | 方案选中，步骤含 draft-outreach-email，但 `pendingHighIds.length = 0`，点击执行 | toast「暂无待起草的已评分线索」；按钮**可点击** |
| T10 | 方案选中，步骤含 enrich-lead-contacts，但无待补全线索，点击执行 | toast「暂无待补全线索（需已评分、有官网域名、且尚未有关键联系人）」；按钮**可点击** |
| T11 | 方案选中，业务门槛全满足，点击执行 | 若环境类 Preflight 失败（OpenCode / 搜索 Key / Chrome），toast 对应错误；业务门槛已在现网点击时检查 |
| T12 | 开发信审核页「驳回」「通过」 | 行为与现网一致（本期不改） |

---

## 7. 风险

| 风险 | 缓解 |
|------|------|
| 执行按钮不提前禁用，用户需点击后才知失败 | **已决定回滚**（2026-10-03）；用户反馈点击后 toast 比预禁用体验更好 |
| `leadsSnapshot` / `emailDraftsSnapshot` 异步更新延迟 | 现网已依赖这些快照，方案执行前会刷新（`refreshPipelineArtifacts`） |

---

## 8. 修订记录

| 日期 | 说明 |
|------|------|
| 2026-10-03 | 初稿：线索页按钮进行中 title + 方案执行前置业务门槛；对齐 BS 锁定点 #1～#3；补全按钮顺手对齐 |
| 2026-10-03 | **回滚**：方案执行按钮不再提前禁用业务数据门槛，恢复现网点击时检查行为；手工测试后确认点击后 toast 比预禁用体验更好 |

---

## 9. 下一步

1. 确认补全按钮文案细节（本设计已包含）。  
2. 进入开发：仅改 `LeadsView.vue` 线索页按钮进行中 title；**不改** `WorkflowPlanControl.vue`（执行按钮保持现网）。  
3. 与 US-BS-01 可并行（独立文件）。
