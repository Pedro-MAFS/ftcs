# US-ST-01 详细设计：增量事件接入与时间线状态

> **用户故事**：作为使用右侧 Agent 的业务员，我想系统在模型输出过程中持续接收 think/正文增量，以便界面有内容可刷新、而不必等整段结束。  
> **范围**：在现有 Legacy SSE 事件桥上**接通** `message.part.delta`，与既有 `message.part.updated` 整段快照**整合**（ST6）；函数调用路径不变。  
> **依赖**：[25-需求-Agent流式输出.md](../25-需求-Agent流式输出.md) ST1～ST6、US-ST-01；基线设计 [Agent聊天框-Legacy-SSE时间线.md](Agent聊天框-Legacy-SSE时间线.md)（现网只信 Part 快照）；事件参考 [opencode-events/legacy.md](../reference/opencode-events/legacy.md)。  
> **不在本期**：右侧 UI 刷帧/折叠体验优化（**US-ST-02**）；函数调用增量；接入 `session.next.*`；改订阅端点/协议（ST4）；删掉 `message.part.updated` 路径（ST6）。  
> **文档位置**：`docs/design/`  
> **状态**：**已确认待开发**

---

## 0. 相对现网（O1 结论）

| 现网 | **本期（ST-01）** |
|------|-------------------|
| 事件桥**只处理** `message.part.updated`（整份 `part` 覆盖），**不接** `message.part.delta` / 全部 `session.next.*` | **新增**处理 Legacy `message.part.delta`；**保留** `updated` 整卡覆盖作终态对齐 |
| 设计文档写明「本期不加 delta」（打字机非目标） | 被 **docs/25 / #17** 产品决策覆盖：think/正文要增量感知；本故事在**同一 Legacy 信封**上接通 delta，不是恢复一条已删除的旧 poll 路径 |

**恢复还是新接通？** → **新接通**（现网刻意未接 delta，不是坏掉的旧流式）。

---

## 1. 目标与非目标

### 1.1 目标

1. think（`part.type === 'reasoning'`）与正文（`part.type === 'text'`）在输出过程中可通过增量更新时间线条目，不必等整段结束才首次出现。  
2. **ST6**：保留 `message.part.updated`；增量与整段合并到**同一卡片 id**；无双份。  
3. 仅有 `updated`、无 `delta` 时行为与现网完全一致。  
4. 工具 part 仍只走 `updated` 快照（ST3）。  
5. 仍只订 Legacy `GET /event`（ST4）；异常/中断仍可结束，不永久转圈。

### 1.2 非目标

| 不做 | 归属 |
|------|------|
| AgentPanel 节流、滚动、「进行中」样式 | **US-ST-02** |
| `session.next.text/reasoning.*` | 禁止（与现网基线一致，避免双套增量模型） |
| 改 OpenCode / 新协议 | ST4 |
| 删 `updated` 或回退 `session.messages` poll | ST6 / 基线 |

---

## 2. 已确认选型（Q 表）

| 项 | 决定 |
|----|------|
| **Q1 增量事件** | 只接 Legacy **`message.part.delta`**（`properties`: `sessionID`, `messageID`, `partID`, `field`, `delta`） |
| **Q2 整段事件** | 继续接 **`message.part.updated`**；text/reasoning **整份 `part.text` 覆盖**同 id 卡片（终态权威） |
| **Q3 卡片 id** | 不变：`assistant-${part.id\|partID}` / `reasoning-${part.id\|partID}` / `tool-${part.id}` |
| **Q4 合并规则** | 见 §3；`updated` 覆盖优先于缓冲 delta，避免重复拼接 |
| **Q5 不接** | 全部 `session.next.*`、V2/Global 信封、`message.part.delta` 以外的猜字段 |
| **Q6 工具** | 仅 `updated`；忽略针对 tool part 的 delta（若有） |
| **Q7 session 过滤** | `properties.sessionID !== 当前 session` 则丢弃（与现网一致） |
| **Q8 类型** | `@opencode-ai/sdk` 的 `Event` 精确 `case 'message.part.delta'`，禁止 `includes` |
| **Q9 主改文件** | `desktop/electron/opencode/agent-runner.ts` 的 `startEventBridge` |
| **Q10 基线文档** | 进仓后在 `Agent聊天框-Legacy-SSE时间线.md` 加修订注：think/正文增量改由 US-ST-01 接通 delta，其余约束仍有效 |

---

## 3. 合并规则（ST6 核心）

```text
message.part.delta
  → 过滤 session / user 角色
  → 若已有 assistant-|reasoning-{partID} 卡：body += delta；flush（或交 ST-02 节流）
  → 若尚无卡：pendingDeltas[partID].push(delta)，不建猜 kind 的假卡
  → 若能从 partID→kind 缓存（曾 updated）知是 text/reasoning：可直接建卡并追加

message.part.updated（text | reasoning）
  → 与现网相同 applySnapshot（整份 part.text）
  → 清除该 partID 的 pendingDeltas（覆盖已是权威全文，勿再 append 缓冲）
  → 写入 partID → kind 缓存

仅有 updated、无 delta → 与现网一致（整卡跳动刷新）
先 delta 后 updated → 先局部增长，再终态对齐
先 updated（短）后 delta → 允许在终态后继续 append；下一次 updated 再覆盖对齐
```

**禁止**：为同一 `partID` 同时维护「delta 卡」与「snapshot 卡」两套 id。

**`field`**：实现时对照 SDK；仅当 `field` 指向文本正文（现网 text/reasoning 的 `text`）时追加；未知 `field` 忽略并打 debug 日志，不猜。

---

## 4. 事件桥改动要点

在 `startEventBridge` 的 `switch (event.type)` 中：

1. **新增** `case 'message.part.delta':`（§3）。  
2. **保留** `message.part.updated` / `removed` / session.* / permission.* 逻辑。  
3. **不要**恢复 `handleLiveDelta` / `session.next` / messages poll。  
4. user 角色：与 updated 相同，忽略（靠 `messageRoles`）；delta 若 `messageID` 尚无角色缓存，可暂存或忽略——倾向：无角色则忽略，避免把用户回声当模型输出（首次 assistant updated 后角色已可知；若 delta 早于 `message.updated`，进 pending 并在角色确认为 assistant 后回放）。

伪代码：

```typescript
case 'message.part.delta': {
  if (event.properties.sessionID !== sessionId) return
  const { messageID, partID, field, delta } = event.properties
  if (!delta) return
  if (field 不是文本字段) return
  const role = messageRoles.get(messageID)
  if (role === 'user') return
  if (role == null) { bufferUntilRole(messageID, partID, delta); return }
  appendOrBuffer(partID, delta) // §3
  flush() // ST-02 可改为 scheduleFlush
  return
}
```

---

## 5. 改动文件

| 路径 | 改动 |
|------|------|
| `desktop/electron/opencode/agent-runner.ts` | `startEventBridge` 接通 delta + pending 缓冲 + partID→kind |
| `docs/design/Agent聊天框-Legacy-SSE时间线.md` | 修订记录：delta 例外见 US-ST-01 |
| `docs/25` | 进仓时 US-ST-01 → 详设已立 + 链接 |

单测：对事件桥抽纯函数（可选）测「delta 追加 / updated 覆盖清缓冲 / 无双卡」。

---

## 6. 验收对照

| 验收要点 | 落点 |
|----------|------|
| 增量路径覆盖 think 与正文 | §2 Q1、§4 |
| 保留 chunked；同条目合并；终态对齐 | §3 |
| 仅有整段 = 现网 | §1.1.3、§3 |
| 函数调用整段 | §2 Q6 |
| 不改协议 | §2 Q5 |
| 中断可结束 | 沿用现网 bridge / session.status |

---

## 7. 测试计划

| # | 场景 | 期望 |
|---|------|------|
| T1 | 仅 updated（无 delta） | 与现网一致 |
| T2 | text：delta* → updated | 卡片同 id 渐长，终态 = part.text |
| T3 | reasoning：同上 | `reasoning-*` 卡渐长 |
| T4 | tool 仅 updated | 无增量卡、行为不变 |
| T5 | 双份回归 | 同一 partID 只有一张卡 |
| T6 | 中断 / session.error | suffix 错误，不转圈 |
| T7 | 他 session 的 delta | 丢弃 |

---

## 8. 风险

| 风险 | 缓解 |
|------|------|
| delta 早于 part 类型可知 | pending 缓冲，禁止猜 kind 建卡 |
| 高频 flush 卡 UI | ST-02 节流；本故事可先直 flush，若手工不可用再提前节流 |
| 与旧设计文档冲突 | Q10 修订注，避免后来者按旧文删掉 delta |

---

## 9. 修订记录

| 日期 | 说明 |
|------|------|
| 2026-10-01 | 已确认待开发：接通 message.part.delta；ST6 与 updated 整合；O1=新接通 |
