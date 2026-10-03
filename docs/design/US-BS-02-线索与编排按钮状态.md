# US-BS-02 详细设计：线索与编排按钮状态

> **用户故事**：作为外贸业务员，我想在线索页进行中时看到「已有任务在运行」，并且方案「执行」不要因为还没产出的业务数据被提前禁用或在点击时被拦住。  
> **范围**：线索页「评分去重」「批量起草」「行内写邮件/重写邮件」进行中 `title`；方案「执行」不提前禁用；点击只拦未选产品和已有任务；环境类仍点后；补全按钮进行中 `title` 顺手对齐。  
> **依赖**：[26-需求-业务按钮可用状态.md](../26-需求-业务按钮可用状态.md) BS1～BS7、US-BS-02；现网 `LeadsView.vue` / `useWorkflowExecute.ts` / `WorkflowPlanControl.vue`。  
> **不在本期**：开发信审核页按钮（BS 4.2 Out）；定时按钮（Out）；OpenCode / 搜索 Key / Chrome 环境类点后 Preflight（BS4）；视觉重做（BS6）。  
> **文档位置**：`docs/design/`  
> **状态**：**待合 dev-0.5.7**

---

## 0. 相对现网

| 现网 | **本期（BS-02）** |
|------|-------------------|
| 线索页「评分去重」「批量起草」「写邮件/重写邮件」：进行中禁用，但 `title` 仍为动作说明或空 | 进行中时 `title` 精确为「已有任务在运行」（BS 锁定点 #1） |
| 方案「执行」：选中后点击时才调 `assertStepReady`，失败 toast | **不提前禁用**。点击只拦未选产品（「请先在侧栏选择产品」）和已有任务（「已有任务在运行」）。画像未就绪、R1/R2/R3 前置、无未评分线索、无待起草、无待补全，既不提前禁用，也不在点击时 toast 拦下 |
| 补全按钮进行中禁用，title 可能不统一 | 顺手对齐「已有任务在运行」 |

**说明**：进行中互斥按 BS3 不变，只补文案。执行按钮的业务数据提前禁用已回滚（2026-10-03）；点击判断进一步收窄为仅基础配置（未选产品 / 已有任务），业务数据不进点击判断；环境类仍点后 Preflight。

---

## 1. 目标与非目标

### 1.1 目标

1. 线索页「评分去重」「批量起草」「行内写邮件 / 重写邮件」在因进行中 / 已有任务禁用时，`title` 为「已有任务在运行」，不再仅显示动作说明或为空。  
2. **方案「执行」**：不提前禁用；点击只拦未选产品（「请先在侧栏选择产品」）和已有任务（「已有任务在运行」）；画像未就绪、R1/R2/R3 前置、无未评分线索、无待起草、无待补全既不提前禁用，也不在点击时 toast 拦下；环境类仍点后 Preflight。  
3. 保持相关操作互斥（BS3）：`generating` / `scoring` / `drafting` / `enriching` / `isWorkflowRunning` 等状态锁相关按钮，不收窄为只锁同一按钮。  
4. 批量补全 / 行内补全按钮进行中 `title` 可顺手对齐，不算范围膨胀（BS 开放问题 O3）。

### 1.2 非目标

| 不做 | 说明 |
|------|------|
| 开发信审核页按钮 | BS 4.2 Out |
| 定时启用 / 新建按钮 | Out |
| 收窄进行中互斥为单按钮 | BS3 |
| 方案执行按钮提前禁用 / 点击时业务数据 toast | 已回滚提前禁用（2026-10-03）；点击只拦未选产品与已有任务；业务数据不进点击判断 |
| 全面重做视觉 | BS6 |

---

## 2. 已确认选型（Q 表）

| 项 | 决定 |
|----|------|
| **Q1 进行中统一文案** | 线索页评分去重、批量起草、写邮件、重写邮件、批量补全、行内补全：进行中 `title` 精确为「**已有任务在运行**」（BS 锁定点 #1）。不发明其他句子。 |
| **Q2 方案执行按钮行为** | **不提前禁用**；点击只拦未选产品（「请先在侧栏选择产品」）和已有任务（「已有任务在运行」）。画像未就绪、R1/R2/R3 前置、无未评分线索、无待起草、无待补全既不提前禁用，也不在点击时 toast 拦下。环境类 Preflight（OpenCode / 搜索 Key / Chrome）仍点后执行。 |
| **Q3 主改文件** | `desktop/src/views/LeadsView.vue`：评分/起草/写邮件/补全按钮绑 `:title` 进行中判定；`desktop/src/components/workflow/WorkflowPlanControl.vue` 删掉提前禁用；`desktop/src/composables/useWorkflowExecute.ts` 的 `assertStepReady` 在未选产品 / 已有任务两条基础配置之后直接 `return null`，不再按步骤拦截业务数据。`runWorkflowPreflight` 不改。 |
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

### 3.2 方案「执行」按钮行为（BS7）

对齐已合进 `dev-0.5.7` 的 [#33](https://github.com/Pedro-MAFS/ftcs/pull/33)（`186a52d`）。

`WorkflowPlanControl.vue` 去掉 `assertStepReadyInline` 和 `preExecuteReason`，执行按钮不因业务数据 `disabled`。

`assertStepReady` 只保留未选产品、已有任务两句，然后 `return null`（未知步骤也不再拦）。环境类仍走点击后的 `runWorkflowPreflight`。业务数据不足交给步骤自身失败，不在按钮层拦截。US-BS-01「开始 R3」的 Places Key 不在本回退里。

---

## 4. 改动文件

| 路径 | 改动 |
|------|------|
| `desktop/src/views/LeadsView.vue` | 评分去重、批量起草、写邮件/重写邮件、批量补全按钮新增 `:title` 进行中判定；`enrichTitle` 函数补进行中优先判定 |
| `desktop/src/components/workflow/WorkflowPlanControl.vue` | **删除提前禁用**（去掉 `assertStepReadyInline` / `preExecuteReason` 等） |
| `desktop/src/composables/useWorkflowExecute.ts` | `assertStepReady` 只保留未选产品 / 已有任务，之后 `return null`；`runWorkflowPreflight` 不改 |
| `docs/26-需求-业务按钮可用状态.md` | 进仓时 US-BS-02 → 详设已立 + 链接 |

---

## 5. 验收对照

| 验收要点 | 落点 |
|----------|------|
| 线索页评分去重 / 批量起草 / 行内写邮件：进行中 title「已有任务在运行」 | §3.1.1～§3.1.3 |
| 方案执行：不提前禁用；点击只拦基础配置；业务数据不 toast 拦下；环境类仍点后 | §3.2 |
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
| T6 | 方案选中，无产品，点击执行 | 按钮**可点**；toast「请先在侧栏选择产品」 |
| T6b | 方案选中，已有任务在跑，若按钮仍可点，点击执行 | toast「已有任务在运行」；**不要**为了本条把 BS3 进行中互斥放开 |
| T7 | 方案选中，只缺画像未就绪，点击执行 | 按钮**可点**；**不**因画像 toast 拦下 |
| T8 | 方案选中，只缺 R1/R2/R3 轮次前置，点击执行 | 按钮**可点**；**不**因轮次前置 toast 拦下 |
| T9 | 方案选中，只缺未评分线索，点击执行 | 按钮**可点**；**不**因未评分 toast 拦下 |
| T10 | 方案选中，只缺待起草或待补全，点击执行 | 按钮**可点**；**不**因待起草 / 待补全 toast 拦下 |
| T11 | 方案选中，基础配置满足，点击执行，环境类 Preflight 失败 | toast 对应环境类错误（OpenCode / 搜索 Key / Chrome 等） |
| T12 | 开发信审核页「驳回」「通过」 | 行为与现网一致（本期不改） |

---

## 7. 风险

| 风险 | 缓解 |
|------|------|
| 业务数据不再在按钮层提示，失败要到步骤里才看见 | **手测定的**（2026-10-03 BS7）；点击只拦基础配置 |
| `leadsSnapshot` / `emailDraftsSnapshot` 异步更新延迟 | 现网已依赖这些快照，方案执行前会刷新（`refreshPipelineArtifacts`） |

---

## 8. 修订记录

| 日期 | 说明 |
|------|------|
| 2026-10-03 | 初稿：线索页按钮进行中 title + 方案执行前置业务门槛；对齐 BS 锁定点 #1～#3；补全按钮顺手对齐 |
| 2026-10-03 | **回滚**：方案执行按钮不再提前禁用业务数据门槛 |
| 2026-10-03 | 点击判断收窄到未选产品和已有任务；业务数据不进点击；环境类仍点后；对齐 #33 |

---

## 9. 下一步

1. 先合进 `dev-0.5.7`。  
2. 再按文件同步 `main`。  
