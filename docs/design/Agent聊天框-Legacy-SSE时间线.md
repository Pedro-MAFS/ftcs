# 右侧 Agent 聊天框：仅用 Legacy SSE 驱动时间线

> **状态**：编码已落地（待手工跑流水线验收）  
> **范围**：桌面端右侧 Agent 时间线的数据来源；**消除对 `session.messages` 的依赖**  
> **订阅**：`GET /event` · `client.event.subscribe()` · **只消费 Legacy 信封**  
> **事件参考**：[../reference/opencode-events/README.md](../reference/opencode-events/README.md)（信封）· [triggers.md](../reference/opencode-events/triggers.md)（何时触发）· [legacy.md](../reference/opencode-events/legacy.md)（字段）· [nested-types.md](../reference/opencode-events/nested-types.md)（Part / ToolState）  
> **主代码**：`desktop/electron/opencode/agent-runner.ts` · UI：`desktop/src/components/layout/AgentPanel.vue`  
> **不做**：改用 V2/Global/Sync 订阅；开放自由对话发送；实现 question 问答 UI；改任务结束读产物的业务判定；**猜字段 / 为旧逻辑写兼容分支**  
> **修订注**（2026-10-01）：think/正文增量流式现由 [US-ST-01](US-ST-01-增量事件接入与时间线状态.md) 接通 `message.part.delta`；本文档其余约束仍然有效；工具仍整段。

---

## 0. 目标与边界

| 项 | 决定 |
|----|------|
| **目标** | 右侧聊天框的展示与更新 **全部由 Legacy SSE 完成**，运行中与任务结束都 **不再调用** `client.session.messages` |
| **信封** | 只认根上有 `type` + `properties` 的 Legacy 事件（见参考总览） |
| **会话生命周期** | 每次流水线任务 **新建 session**，在 `promptAsync` **之前** 订阅 SSE，本轮事件从零收齐 |
| **仍保留的 OpenCode 调用** | `session.create`、`promptAsync`、`session.abort`、`permission.reply`。结束判定现用的 `v2.session.wait` / `session.status` 轮询 **不是时间线**，可另故事迁到听 `session.status` |
| **时间线内容模型** | **只信 Part 快照**（`message.part.updated`）。不接任何 `session.next.*`，也不接 `message.part.delta` |
| **类型** | 只用 `@opencode-ai/sdk` 生成的 `Event` / `Event*` 与 `Part` 等，**按 `event.type` 精确分支**，禁止猜字段 |
| **写法** | **重构**：按本文重写事件桥，不在现网 `handleLiveDelta` / poll 上叠兼容 |
| **明确不做** | 订阅 `/api/event` 或 `/global/event`；用 Sync 回放补历史；右侧自由发送指令；处理流式增量；保留「以防万一」的 messages / Next / 猜键名 |

---

## 1. 相对现网

| 现网 | 本期 |
|------|------|
| 每秒 `session.messages`（`ingestMessages`，limit=80）合并 text/reasoning | **删除**。text/reasoning 只走 SSE |
| tool 已由 `message.part.updated` 更新，poll 会滤掉 `kind===tool` | 维持 tool 走 SSE；poll 整段删除 |
| `text.ended` / `idle` / `error` / `message.updated` 后再 ingest 一次 | **删除** |
| 任务结束 `ingestNow` + `fetchSessionErrorMessage`（再查 messages 找 `info.error`） | **删除**。失败只信 `session.error` / `message.updated.info.error` |
| 每秒 `permission.list` 兜底自动批准 | **删除**。只处理 `permission.*.asked` |
| 「加载更早的记录」用 `session.messages` 向前翻页 | **去掉按钮与 `loadOlderTimeline`**。新 session + 从头订阅，内存即全集 |
| 看门狗挂在 1s poll 上 | 独立 `setTimeout`，与事件循环解耦 |

---

## 2. 聊天框实际能力（只接这些）

时间线卡片只有六种。`state`（顶部技能/耗时）由桌面端自己 `emit`，不来自 OpenCode。

| 卡片 `kind` | 现网来源 | 改后 |
|-------------|----------|------|
| `system`、首条 `user` | 本地 prefix（任务说明、完整指令、session id） | **继续本地写，不靠事件** |
| `assistant` | poll 的 text part + 部分 SSE | **只** `message.part.updated`（整份 `part.text` 覆盖） |
| `reasoning` | 同上 | **只** `message.part.updated`（整份 `part.text` 覆盖） |
| `tool` | SSE `message.part.updated` | **维持** |
| `error` / 重试 suffix | `session.error` / `session.status` + 结束再查 messages | 只走会话事件 |
| 「加载更早」 | `session.messages` 翻页 | **删除**（见 §0：每任务新 session） |

Composer「发送」保持禁用；不因 SSE 改造而开放自由对话。

---

## 3. 已确认选型

| 项 | 决定 |
|----|------|
| **Q1 权威模型** | **只信 Part 快照**：时间线卡片只由 `message.part.updated`（整份 `part`）和 `message.part.removed` 驱动。**不接** 全部 `session.next.*`，**不接** `message.part.delta` |
| **Q2 卡片 id** | `assistant-${partId}` / `reasoning-${partId}` / `tool-${partId}`。`partId` = `part.id` |
| **Q3 更新方式** | 每次 `updated` 用快照 **整卡覆盖**（text/reasoning 用 `part.text`；tool 用完整 `ToolState`）。不做 append / 拼 delta |
| **Q4 `session.next.*`** | **全部不接**（含 text/reasoning/tool/step/prompt）。与 Part 并行到达时直接忽略，避免双卡、双套 id |
| **Q5 用户消息回声** | 用 `message.updated` 记 `messageID → role`；user 的 part、正文等于本地 prompt 的 text，不当成模型回复 |
| **Q6 权限** | `permission.asked` 与 `permission.v2.asked` 一律 `reply: always`（与现网一致） |
| **Q7 历史翻页** | 不做。现网翻页只因 poll `limit=80`；SSE 从头订则不需要 |
| **Q8 过滤 session** | 有 `properties.sessionID` 且不等于当前 session 则丢弃。permission 用 SDK 类型自己的字段，不猜 `sessionId` / 从 `part` 里挖 |
| **Q9 类型来源** | 从 `@opencode-ai/sdk`（`Event`、`EventMessagePartUpdated`、`EventSessionStatus` 等）取 `type` 字面量与 `properties` 字段。对照 [legacy.md](../reference/opencode-events/legacy.md) |
| **Q10 重构姿态** | 删掉现网猜测与双路径，按 §4 重写订阅循环。禁止「先留着旧分支以免漏事件」 |

---

## 4. 必须处理的 Legacy 事件

字段见 [legacy.md](../reference/opencode-events/legacy.md)，触发时机见 [triggers.md](../reference/opencode-events/triggers.md)。

### 4.1 会话忙闲 / 失败（替换结束时 messages 与 `fetchSessionErrorMessage`）

| type | 时间线动作 |
|------|------------|
| `session.status` | `retry`：更新「重试中」suffix，记录 `retrySince`，启动看门狗；`idle`：若曾 retry 且无 `session.error` 则改为「已恢复」；`busy`：不清除 `retrySince` |
| `session.error` | suffix「模型调用失败」，正文用 `formatMessageError(properties.error)` |
| `session.idle` | **不接**。忙闲只看 `session.status.properties.status.type` |

看门狗：`retry` 持续超过 `RETRY_WATCHDOG_MS`（现网 120s）→ suffix「已自动停止」+ `session.abort` + `this.abort.abort()`。用独立 timer，禁止挂在消息轮询上。

### 4.2 文本 / 思考 / 工具（替换 `ingestMessages`）

| type | 时间线动作 |
|------|------------|
| `message.updated` | 缓存 `info.id → info.role`；若 `role===assistant` 且存在 `info.error`，补错误卡（部分失败只有这个、没有 `session.error`） |
| `message.part.updated` | `ignored===true` 或 user 消息：忽略。`text` → 回复卡（空或等于本地 prompt 则跳过）；`reasoning` → 思考卡；`tool` → `toolPartToTimelineItem`（pending/running/completed/error）。**整份覆盖，不 append** |
| `message.part.removed` | 按 `partID` 删除对应 `assistant-` / `reasoning-` / `tool-` 卡（压缩/回退时避免残留） |

### 4.3 权限（不是卡片，但工具必须能跑）

| type | 动作 |
|------|------|
| `permission.asked` | `EventPermissionAsked`：用 `properties.id` 调 `permission.reply({ requestID: id, reply: 'always' })` |
| `permission.v2.asked` | `EventPermissionV2Asked`：同样用 `properties.id`。**禁止** `type.includes('permission')` |

---

## 5. 实现约束（硬性）

### 5.1 只用 SDK 标准 type / 字段

订阅结果按 `Event` 判别，不要 `unknown` + 字符串猜测。

```typescript
import type { Event } from '@opencode-ai/sdk'

// type 必须是精确相等，禁止 includes / endsWith / 前缀猜测
switch (event.type) {
  case 'message.part.updated': // EventMessagePartUpdated
    event.properties.part     // Part，不要 asRecord 再挖 partID
    break
  case 'session.status':      // EventSessionStatus
    event.properties.status.type
    break
  case 'permission.asked':    // EventPermissionAsked
    event.properties.id
    break
  default:
    break
}
```

| 允许 | 禁止 |
|------|------|
| `event.type === 'message.part.updated'` | `type.includes('tool.')`、`type.endsWith('text.delta')` |
| `event.properties`（Legacy） | `properties ?? data ?? root`（把 V2/裸对象当兼容） |
| `properties.sessionID`、`part.id`、`info.id`、`permission.asked` 的 `id` | `sessionId` / `requestId` / `partID` 回退链 |
| `Part` / `ToolState` 的 `type`、`status` 字面量 | `field.includes('reason')` 猜思考还是回复 |

字段以 `desktop/node_modules/@opencode-ai/sdk/dist/v2/gen/types.gen.d.ts` 为准。SDK 没有的键就是没有，不要补别名。

### 5.2 重构，不写兼容层

本期是换数据源，不是给现网打补丁。`startEventBridge` **整段重写**。

**必须删掉、禁止再引入：**

| 现网 | 为什么删 |
|------|----------|
| `eventProps` 的 `properties ?? data ?? root` | 不是 Legacy；在猜信封 |
| `eventSessionId` 的 `sessionId` / `info` / `part` 回退 | SDK 事件自带 `sessionID` 的用它；没有就按该 type 的类型读 |
| `getRequestId` 的 `includes('permission')` + `requestID ?? requestId ?? id` | 两个 asked 的字段就是 `id` |
| `handleLiveDelta` 里全部 `session.next.*`、`endsWith`、`message.part.delta`、`type.includes('tool.')` | 本期不接流式 |
| `ingestMessages` / `ingestNow` / 每秒 poll / `permission.list` | 旧数据源 |
| `session.idle` 与 `session.status` 绑在同一分支 | 只处理 `session.status` |
| `upsertTextItem(..., 'live')` 无 id 兜底 | 没有 `part.id` 就丢弃该事件，不造假 id |
| 「先留 poll，SSE 稳了再删」 | 直接切；SSE 失败走 `failEventBridge`，不回退 messages |

可复用的只有与 OpenCode 无关的：`TimelineBuilder.upsertSessionItem`、`toolPartToTimelineItem`、`formatMessageError`、本地 prefix/suffix。messages 专用的 `rowsToTimelineItems` / `mergeLiveItems` / `prependOlderItems` **删**。

### 5.3 为什么可以不接流式增量

`session.next.text.delta` / `message.part.delta` 只是把同一份 `part.text` 拆成许多小片。OpenCode 在文本增长、思考更新、工具状态跃迁时会再发 **`message.part.updated`，载荷里已是完整 `part`**。右侧卡片不需要打字机效果：来一张快照覆盖一张即可。

取舍：回复/思考卡片会 **按快照节奏跳动更新**，而不是逐字出现。工具卡片现网本来就是快照（pending → running → completed），与此一致。

中间只有 delta、结束才有带正文的 `updated`，属于产品取舍（卡片跳一下），**本期不加 delta**。若以后要加，单开故事，仍不引入 `session.next`。

### 5.4 不处理（含全部流式）

**全部 `session.next.*`**（text / reasoning / tool / step / prompt / compaction / revert / retried）、**`message.part.delta`**、`server.connected`、`server.heartbeat`、`session.created/updated/deleted/diff/compacted`、`question.*`、MCP / LSP / 文件 / PTY / TUI / todo / project / workspace / installation。

`server.instance.disposed`：视为桥断开，走现网 `failEventBridge`（时间线错误卡 + abort）。SSE 订阅失败 **不准** 回退到 messages 轮询。

---

## 6. 与 `session.messages` 的一一替换

| 现网用法 | 改后 |
|----------|------|
| 每秒 `ingestMessages` | 删除。时间线只靠 §4 |
| `text.ended` / `idle` / `error` / `message.updated` 后再 ingest | 删除 |
| 任务结束 `ingestNow` | 删除。idle 前事件应已齐 |
| `fetchSessionErrorMessage` | 读已处理的 `session.error` / `message.updated.info.error` |
| `loadOlderTimeline` + AgentPanel「加载更早」 | 删除 UI 与 IPC |
| 每秒 `permission.list` | 只留 §4.3 |

可删：`rowsToTimelineItems`、`mergeLiveItems`、`prependOlderItems`（messages 专用）。**保留** `toolPartToTimelineItem`（给 `message.part.updated`）。

---

## 7. 实现顺序

改 `startEventBridge` 及各 skill 收尾路径，**一步可验收再做下一步**。

1. **重写事件桥**：按 `Event` 精确 `switch`，只处理 §4；删现网猜测与 Next/delta 分支。确认不 poll 也能出完整三类卡片。
2. **会话态**：只接 `session.status` / `session.error` / `message.updated`；删 `fetchSessionErrorMessage`、`ingestNow`、`session.idle` 兼容。
3. **拆 poll**：删除 messages 与 `permission.list` 定时器；看门狗独立 timer。
4. **收尾**：删除「加载更早」、`loadOlderTimeline`、全部 `session.messages` 调用与 messages 专用函数。

---

## 8. 身份与时序

同一 `part.id` 只对应一张卡。后续 `updated` **覆盖** body/title/status，不新建。流上其它 type（含全部 `session.next.*`、`message.part.delta`）直接忽略。

```
订阅 Legacy /event（promptAsync 之前）
  server.connected / session.next.* / message.part.delta → 忽略
  permission.*.asked        → always
  message.updated           → 记 role；assistant.error → 错误卡
  message.part.updated      → 按 part.id 建卡或整份覆盖
  message.part.removed      → 删卡
  session.status = retry    → 重试卡 + 看门狗
  session.error             → 失败卡
  session.status = idle     → 清重试；任务 wait 可同时返回
```

典型顺序（仅列会画进时间线的）：

```
message.updated（user，只记 role）
session.status = busy
  message.part.updated      → 思考 / 回复 / 工具（每张快照覆盖一次）
  permission.*.asked        → 自动批准
session.status = idle | session.error
```

---

## 9. 验收

- [ ] 跑任一流水线任务（如生成画像）：右侧出现本地 prefix、思考、工具、模型回复，过程中 **无** `session.messages` 请求。
- [ ] 同一 part 只有一张卡：思考/回复按快照跳动更新（允许非逐字），工具从 running → 完成/失败不闪成第二张。
- [ ] 人为制造模型失败（如欠费）：出现失败卡，**不必**结束后再查 messages。
- [ ] `retry` 超过约 2 分钟：自动停止，看门狗不依赖 poll。
- [ ] SSE 断开：错误卡 + 任务中止，**不**回退轮询 messages。
- [ ] AgentPanel 无「加载更早的记录」；向上滚仍能看到本轮从头订阅到的全部卡片。
- [ ] 权限弹窗不阻塞（asked 已 always）；无每秒 `permission.list`。
- [ ] 事件处理无 `includes` / `endsWith` / `sessionId` / `data ?? properties` 等猜测；`type` 与字段来自 SDK。
- [ ] 无「保留 poll 兜底」或并行 Next 分支。

---

## 10. 维护

升级 `@opencode-ai/sdk` 后：对照 [legacy.md](../reference/opencode-events/legacy.md) 检查 §4 所列 `type` 的 `properties` 是否改名；`ToolState` 对照 [nested-types.md](../reference/opencode-events/nested-types.md)。新增的无关 `type`（含新的 `session.next.*`）默认忽略，不扩时间线，除非要增加新卡片种类。

---

## 11. 修订记录

| 日期 | 说明 |
|------|------|
| 2026-10-01 | 修订注：think/正文增量流式已由 [US-ST-01](US-ST-01-增量事件接入与时间线状态.md) 接通 `message.part.delta`；本文档其余约束（权限、会话态、工具整段等）仍然有效 |
