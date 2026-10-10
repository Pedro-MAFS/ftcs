# US-PK-C-04 与 BYOK 并存及停用提示

> **用户故事**：[../30-需求-Places官方通道按用户下发APIKey.md](../30-需求-Places官方通道按用户下发APIKey.md) · US-PK-C-04 · Issue #21  
> **状态**：**待评审**（本文件只定设计；业务代码尚未按本文改动）  
> **范围**：官方 Key 与 US-E-07 自备 Key 同时存在时的选用；停用 / 吊销后的提示与改回 BYOK；Preflight 与「开始 R3」使用同一规则  
> **依赖**：[US-PK-C-02](US-PK-C-02-接收并安全保存官方Key.md) 的两套存储；现网 `resolvePlacesStart`；探索页 `useExploreStart`  
> **不做**：删除 BYOK；停用时静默改用另一把 Key；计费 BYOK；代调  
> **文档位置**：`docs/design/`

需求 O4（并存时的优先级）在本文定死，不进入待确认。

---

## 0. 相对现网

对照 `desktop/electron/preflight/places-start.ts` 与 `useExploreStart.ts`（2026-10-10）。

| 现网 | **本期（US-PK-C-04）** |
|------|------------------------|
| 只要 `placesApiKeySet`，就 `ok`，provider `custom`，文案「已配置（直连）」 | 先按 §3 算出**唯一**生效来源，再决定是否 `ok`。通过文案区分官方 / 自备（句子在 C-03） |
| 官方通道且没有自备 Key：失败，并说明官方不提供代调、请填 BYOK | 未申请或官方 Key 不可用、且没有 BYOK：仍然不能开始 R3。文案改为 C-01 的状态句，或「请申请官方 Places Key，或填写自备 Key」 |
| 官方通道**有**自备 Key：与自定义通道一样走 BYOK | **保持**，直到用户的官方 Key 变为已开通。开通后的默认见 §3，BYOK 值不被删 |
| `useExploreStart` 用 `placesApiKeySet` 决定 R3 按钮 | 改为「生效 Key 是否可用」。不要只看 BYOK，也不要只看官方状态 |
| 含 R3 的方案 Preflight 走 `resolvePlacesStart` | 继续走这一个函数。探索页按钮与 Preflight 不得各算各的 |

---

## 1. 与相邻故事的分工

| 模块 | 本期 |
|------|------|
| **US-PK-C-04** | 选用规则、切换 IPC、停用提示、`resolvePlacesStart` |
| **US-E-07** | 自备 Key 的输入、掩码、清除、直连。不改字段含义 |
| **US-PK-C-01** | 状态文案与申请按钮 |
| **US-PK-C-02** | 两把 Key 分键保存。切换来源时不删官方材料，除非状态已不是 `active` |
| **US-PK-C-03** | 把本节选出的那一把注入 MCP |

---

## 2. 已确认选型

| 项 | 决定 |
|----|------|
| **O4 默认** | 用户还没有 `FTCS_PLACES_KEY_SOURCE` 时：只有自备 Key → 用自备；只有可用官方 Key → 用官方；**两把同时可用 → 用官方**，并在设置里写明当前是官方、自备 Key 仍保留。这是确定规则，不是随机 |
| **何时把默认写进 `.env`** | 只在「刷新成功且官方 Key 变为可用、来源键仍为空」时写成 `official`。读设置、Preflight、渲染按钮都不写。在此之前，只有 BYOK 的用户与现网一致 |
| **用户切换** | 设置里两把都配置过时，显示二选一。点选立即写 `FTCS_PLACES_KEY_SOURCE` 并重启 OpenCode |
| **选中的那把不可用** | **不**自动改成另一把。Preflight 失败，并给出按钮或说明去设置切换 |
| **停用 / 吊销** | 状态是 `suspended` 时官方来源不可用。若 BYOK 仍在，设置状态区与 Preflight 都提示原因，并提供「改用自备 Key」。用户确认后把来源写成 `byok` |
| **未申请** | 不写 `official`。BYOK 行为与 US-E-07、现网 Preflight 一致 |
| **识别当前 Key** | 设置「当前 R3 使用」一行（C-03）+ Preflight `detail`。两处用同一 `source` |
| **gateway 标志** | `isPlacesGatewayReady` 继续恒为 `false`。选用官方 Key 时 `provider` 仍是 `custom` |

「官方可用」= `placesOfficialStatus === 'active'` 且 `placesOfficialKeySet`。`pending` / `failed` / `suspended` / `none` 都不是可用。刷新网络失败但本机仍留着上一把官方 Key、且缓存状态仍是 `active`：视为**暂时可用**，`detail` 必须带 C-01 的那句无法确认状态的说明。

---

## 3. 选用规则

```typescript
type PlacesKeySource = 'official' | 'byok'

interface PlacesEffectiveKey {
  ok: boolean
  source: PlacesKeySource | 'none'
  /** 仅主进程持有。Preflight 结果里不要带这个字段 */
  apiKey: string
  detail: string
  /** 失败时，设置里可以执行的下一步。没有则为 null */
  offer: 'switch-to-byok' | 'switch-to-official' | 'open-settings' | null
}
```

计算顺序：

1. `saved` = `FTCS_PLACES_KEY_SOURCE`，只接受 `official` 与 `byok`，其它字符当空。
2. `officialUsable`、`byokUsable` 按 §2。
3. 若 `saved` 为空：
   - 只有官方可用 → `official`
   - 只有 BYOK 可用 → `byok`
   - 两把都可用 → `official`
   - 都不可用 → 失败
4. 若 `saved === 'official'`：官方可用则用官方；否则失败，`offer` 在 BYOK 可用时为 `switch-to-byok`，否则 `open-settings`。
5. 若 `saved === 'byok'`：BYOK 可用则用 BYOK；否则失败，`offer` 在官方可用时为 `switch-to-official`，否则 `open-settings`。

纯函数**不写盘**。唯一一次自动写入：官方 Key 刷新成功且变为可用、`FTCS_PLACES_KEY_SOURCE` 仍为空时，由刷新处理函数写成 `official`（两把都在时也写 `official`，与上表一致）。Preflight、设置快照、探索页按钮只调用纯函数。失败分支不改来源。用户切换走 §4 的 IPC。

`resolvePlacesStart` 改为返回上述结果里的 `ok`、`detail`、`provider: 'custom'`（只要 `ok`）。现有调用方只看 `ok` 与 `detail` 的，保持能编译。`places-start.test.ts` 里「官方通道无 Key 则要求 BYOK」的用例改为：无官方申请、无 BYOK 时失败；有 BYOK 且来源为空时仍成功且 `detail` 含「自备」。

### 3.1 `detail` 与现网测试的衔接

| 结果 | `detail` |
|------|----------|
| 用官方，同步正常 | 官方下发 Key（本机直连 Google） |
| 用官方，上次同步失败 | 暂时无法确认官方 Key 状态，仍使用上次下发的 Key（本机直连 Google） |
| 用自备 | 自备 Google Places API Key（本机直连） |
| 来源是官方但申请中 / 失败 / 已停用 | C-01 §4.3 的三句之一。已停用时若 `offer === 'switch-to-byok'`，句末加上「自备 Key 仍可用，可在设置 → 探索改用自备 Key。」 |
| 两边都没有 | 请在设置 → 探索申请官方 Places Key，或填写自备 Key（仅 R3 需要）。 |
| 来源是自备但自备已被清空，官方仍可用 | 当前选择的是自备 Key，但尚未填写。可在设置 → 探索改用官方下发 Key，或重新填写自备 Key。 |

自定义模型通道（`channelMode === 'custom'`）同样适用本表。不因为模型走自定义就忽略已下发的官方 Places Key。

---

## 4. 界面与 IPC

设置 → 探索 → R3 区块，在官方状态与自备输入框之间：

| 条件 | 控件 |
|------|------|
| 只有 BYOK，官方未申请或不可用 | 不显示二选一。只显示「当前 R3 使用：自备 Places Key」 |
| 只有官方可用，用户没填过 BYOK | 不显示二选一。只显示「当前 R3 使用：官方下发 Key」 |
| 官方材料曾经或当前存在，且 BYOK 已设置 | 二选一：「官方下发 Key」「自备 Places Key」。当前项选中 |
| 来源是官方且状态为已停用，BYOK 已设置 | 状态区用 C-01 的停用文案，主按钮「改用自备 Key」 |
| 来源是自备，官方已开通 | 主按钮「改用官方下发 Key」 |

二选一的说明句：

> 两把 Key 都还在。R3 只会使用当前选中的这一把，本机直连 Google。

IPC：`places-official:set-source`，入参 `{ source: 'official' | 'byok' }`。

| 校验 | 结果 |
|------|------|
| `official` 但官方不可用 | `{ ok: false, message }`，不写 `.env` |
| `byok` 但 BYOK 为空 | `{ ok: false, message: '请先填写自备 Places Key' }` |
| 通过 | 写入 `FTCS_PLACES_KEY_SOURCE`，重启 OpenCode，返回新快照 |

「改用自备 Key」就是 `source: 'byok'`。不删除官方 Key 文件里的历史状态；若服务状态已是 `suspended`，C-02 已经删过官方 Key 材料，切换只改来源。

探索页 `startR3DisabledReason`：生效 Key 不可用时，用 §3.1 的失败 `detail`，不再固定「请先配置 Google Places API Key」。R1/R2 的禁用理由不变。

---

## 5. 流程

```mermaid
flowchart TD
  start[开始 R3 或打开设置]
  refresh[刷新官方状态]
  pick[按来源选出唯一一把]
  ok{可用?}
  run[Preflight 通过并注入该 Key]
  block[Preflight 失败并展示 detail]
  switch[用户在设置里改来源]

  start --> refresh
  refresh --> pick
  pick --> ok
  ok -->|是| run
  ok -->|否| block
  block --> switch
  switch --> pick
```

刷新失败时的「暂时可用」只发生在进入 `pick` 之前官方缓存仍是 `active` 且本机官方键还在。用户没有点切换时，不会从官方跳到自备。

---

## 6. 文件清单

**本详设不改这些文件。**

| 文件 | 预期动作 |
|------|----------|
| `desktop/electron/preflight/places-start.ts` | §3 纯函数；`isPlacesGatewayReady` 保持 `return false` |
| `desktop/electron/preflight/places-start.test.ts` | 改写「无 Key 必须 BYOK / gateway 恒 false」，补上两把都在、停用不自动改道 |
| `desktop/electron/preflight/agent-preflight.ts` | 继续调用 `resolvePlacesStart`，不另写一份判断 |
| `desktop/src/composables/useExploreStart.ts` | R3 是否可点改为生效 Key |
| `desktop/src/views/SettingsView.vue` | 二选一与「改用自备 Key」 |
| `desktop/electron/main.ts` | `places-official:set-source` |
| `desktop/electron/opencode/runtime.ts` | 注入时调用同一纯函数（与 C-03 同一处改动） |

建议单测（纯函数，不启 Electron）：

| # | 输入 | 期望 |
|---|------|------|
| T1 | 无官方、无 BYOK | `ok === false` |
| T2 | 无官方、有 BYOK、来源空 | `ok`，来源自备 |
| T3 | 官方可用、有 BYOK、来源空 | `ok`，来源官方 |
| T4 | 来源 `byok`，两把都可用 | `ok`，来源自备 |
| T5 | 来源 `official`，状态 `suspended`，BYOK 可用 | `ok === false`，`offer === 'switch-to-byok'` |
| T6 | 来源 `official`，状态 `pending`，无 BYOK | `ok === false`，不把状态改成自备 |
| T7 | `isPlacesGatewayReady` 在官方已开通时 | `false` |

---

## 7. 验收对照

对照 `docs/30` US-PK-C-04、PK6、PK7。

| # | 需求 | 步骤 | 期望 |
|---|------|------|------|
| M1 | 未申请时 BYOK 与现网一致 | 不申请官方，只填自备 Key，开始 R3 | 通过。`detail` 含自备、本机直连。自备 Key 的保存 / 清除与现网一致 |
| M2 | 开通后 BYOK 还在 | 先填 BYOK，再把 mock 推到已开通 | `.env` 里自备 Key 原文还在。设置同时看得到两段标题 |
| M3 | 默认不随机 | M2 之后不点切换，看「当前 R3 使用」并开始 R3 | 显示官方下发 Key。再跑一次仍是官方 |
| M4 | 可以改回 | 点「自备 Places Key」后再开始 R3 | `detail` 改为自备。官方 Key 材料还在（若状态仍是已开通） |
| M5 | 停用可感知 | mock 改为 `suspended` + `overdue`，来源仍是官方 | 开始 R3 失败。能看到停用原因。有 BYOK 时出现「改用自备 Key」 |
| M6 | 不静默改道 | M5 时不点按钮，直接再读来源 | 仍是 `official`，不会变成 `byok` |
| M7 | 点了才改回 | 在 M5 点「改用自备 Key」 | 来源变为 `byok`，R3 可以开始，走自备 Key |
| M8 | 方案里的 R3 | 高级获客或含 R3 的方案在 M5 的状态下执行 | Preflight 同样失败，文案与探索页一致 |
| M9 | 自定义模型通道 | `channelMode=custom` 且只有 BYOK | 与 M1 相同，不要求登录才能用自备 Key |

---

## 8. 不做什么

| 项 | 说明 |
|----|------|
| 停用后自动改用 BYOK | 必须用户点「改用自备 Key」 |
| 两把都注入 MCP，让工具自己挑 | C-03 只注入一把 |
| 删掉设置里的自备 Key 输入框 | PK7 |
| 给 BYOK 扣官方余额 | 需求明确不做 |
| 用 `placesProvider=gateway` 表示选中官方 | 旧代调标志，保持不启用 |
| 探索页上再做一套切换 | 切换只在设置 |

---

## 9. 风险

| 风险 | 缓解 |
|------|------|
| 官方刚开通就把长期使用 BYOK 的用户改到官方 | 这是「申请并开通」后的默认，设置里同时写明，且一步可以改回。未申请的用户不写来源键（T2） |
| 探索页按钮看 `placesApiKeySet`、Preflight 看官方，两处不一致 | 都改为 `resolvePlacesStart`；M8 |
| 停用后旧测试仍期望「请填 BYOK」整句 | 更新 `places-start.test.ts`，避免文案又写回代调 |
| 切换来源忘记重启 OpenCode | `set-source` 成功路径与设置保存一样 `runtime.restart()` |

---

## 10. 待确认

O4 已在 §2、§3 决定。其它未决项见[网关详设「待确认」](US-PK-token-gateway-接口与管理端.md)。其中「欠费后是否立刻删 Google Key」不影响本节：无论 Google 侧删或不删，客户端都只认服务返回的 `suspended`，并按 §3 停止官方来源。

---

## 11. 修订记录

| 日期 | 说明 |
|------|------|
| 2026-10-10 | 初稿：并存时的默认来源、显式切换、停用后不静默改道 |
