# Sync 信封格式

> **出现场景**：Global 流的 `payload`、durable 事件同步  
> **TS 类型**：`SyncEventSessionCreated` 等（`syncEvent.type` 带 `.1` 后缀）  
> **总览**：[README](./README.md) · **嵌套类型**：[nested-types.md](./nested-types.md) · **何时触发**：[triggers.md](./triggers.md)

Sync 用于 **可排序、可回放** 的 durable 事件。外层固定 `type: "sync"`，真实事件在 `syncEvent` 内。

---

## 1. 根 JSON 结构（Sync 信封）

```typescript
interface SyncEnvelope {
  type: "sync"              // 固定值，表示这是 Sync 包装
  id: string                // 包装层 id
  syncEvent: SyncInnerEvent
}

interface SyncInnerEvent {
  type: string              // 通常为 "<base-type>.1"
  id: string
  seq: number
  aggregateID: string
  data: {                   // 载荷（与 Legacy properties 同构）
    [key: string]: unknown
  }
}
```

### 识别条件

- 根上（或 Global 的 `payload` 上）**`type === "sync"`**
- 存在 **`syncEvent`** 对象
- 内层载荷在 **`syncEvent.data`**（不是 `properties`）

### 完整示例

```jsonc
{
  "type": "sync",
  "id": "sync-wrap-001",
  "syncEvent": {
    "type": "message.part.updated.1",
    "id": "evt-inner-001",
    "seq": 42,
    "aggregateID": "agg-session-xyz",
    "data": {
      "sessionID": "ses-abc",
      "time": 1710000000000,
      "part": {
        "id": "part-1",
        "type": "tool",
        "tool": "lead-store_search",
        "state": { "status": "completed", "output": "..." }
      }
    }
  }
}
```

---

## 2. 与 Legacy 的对应关系

| 项目 | Legacy | Sync 内层 |
|------|--------|-----------|
| 事件 `type` | `message.part.updated` | `message.part.updated.1` |
| 载荷键名 | `properties` | `syncEvent.data` |
| 载荷字段 | 相同 | 相同 |
| 排序 | 无 | `seq`, `aggregateID` |

**没有 `.1` 后缀的 type 不在 Sync 内层出现**（例如没有 `session.next.text.delta.1`）。

---

## 3. Sync 外层 vs 内层

| 层级 | 字段 | 说明 |
|------|------|------|
| **Sync 信封** | `type: "sync"`, `id` | 包装，不是业务事件 |
| **Sync 内层** | `syncEvent.type`, `syncEvent.data` | 真实业务事件 + 载荷 |
| **Durable 元数据** | `seq`, `aggregateID` | 聚合内排序、回放 |

---

## 4. 事件 type 目录（`syncEvent.type` / `syncEvent.data`）

下列为 SDK 中 **有 Sync 变体** 的 `syncEvent.type`（均带 `.1`）。`data` 字段与 [Legacy](./legacy.md) 中 **去掉 `.1` 后缀的同名 type** 的 `properties` 相同。何时触发见 [triggers.md](./triggers.md)（去掉 `.1` / `.2` 后缀对照）。

### 4.1 会话

| syncEvent.type | data |
|----------------|------|
| `session.created.1` | `sessionID`, `info: Session` |
| `session.updated.1` | 同上 |
| `session.deleted.1` | 同上 |

### 4.2 消息与 Part

| syncEvent.type | data |
|----------------|------|
| `message.updated.1` | `sessionID`, `info: Message` |
| `message.removed.1` | `sessionID`, `messageID` |
| `message.part.updated.1` | `sessionID`, `part: Part`, `time` |
| `message.part.removed.1` | `sessionID`, `messageID`, `partID` |

### 4.3 Session Next（仅部分，**无 delta 类**）

| syncEvent.type | data 要点 |
|----------------|-----------|
| `session.next.agent.switched.1` | `timestamp`, `sessionID`, `messageID`, `agent` |
| `session.next.model.switched.1` | + `model` |
| `session.next.moved.1` | + `location` |
| `session.next.prompted.1` | + `prompt`, `delivery` |
| `session.next.prompt.admitted.1` | 同上 |
| `session.next.context.updated.1` | + `text` |
| `session.next.synthetic.1` | + `text` |
| `session.next.shell.started.1` | `callID`, `command` |
| `session.next.shell.ended.1` | `output` |
| `session.next.step.started.1` | `agent`, `model` |
| `session.next.step.ended.2` | `finish`, `cost`, `tokens` |
| `session.next.step.failed.2` | `error` |
| `session.next.text.started.1` | `textID` |
| `session.next.text.ended.1` | `text` |
| `session.next.reasoning.started.1` | `reasoningID` |
| `session.next.reasoning.ended.1` | `text` |
| `session.next.tool.input.started.1` | `callID`, `name` |
| `session.next.tool.input.ended.1` | `text` |
| `session.next.tool.called.1` | `tool`, `input`, `provider` |
| `session.next.tool.progress.1` | `structured`, `content[]` |
| `session.next.tool.success.1` | 同上 + `outputPaths?`, `result?` |
| `session.next.tool.failed.1` | `error`, `provider` |
| `session.next.retried.1` | `attempt`, `error` |
| `session.next.compaction.started.1` | `messageID`, `reason` |
| `session.next.compaction.ended.1` | `text`, `recent` |
| `session.next.revert.staged.1` | `revert` |
| `session.next.revert.cleared.1` | — |
| `session.next.revert.committed.1` | `messageID` |

### 4.4 Sync 中 **不存在** 的 type（仅 Legacy/V2）

以下流式 **delta** 事件 **没有** Sync `.1` 版本，不会出现在 `syncEvent.type` 中：

- `session.next.text.delta`
- `session.next.reasoning.delta`
- `session.next.tool.input.delta`
- `message.part.delta`
- `session.next.compaction.delta`

实时 UI 依赖 delta 的事件 **必须** 订阅 [Legacy](./legacy.md) 或 [V2](./v2.md) 流，不能仅靠 Sync。

---

## 5. 嵌套在 Global 内时的完整路径

```
Global 根
  directory, project?, workspace?
  payload                          ← 此处是 Sync 信封
    type: "sync"
    syncEvent
      type: "message.part.updated.1"
      data: { sessionID, part, time }
```

步骤：

1. [global.md](./global.md) — 读 `directory`，取 `payload`
2. 本文 — 读 `syncEvent`
3. [nested-types.md](./nested-types.md) — 解析 `data.part` 等

---

## 6. SDK 类型

- 包装：`SyncEventMessagePartUpdated` 等，外层 `type: "sync"`
- 内层：`syncEvent.type: "message.part.updated.1"` 等
- 见 `types.gen.d.ts` 中 `SyncEvent*` 系列

---

## 7. 解析流程（仅 Sync 信封）

```
1. 断言 type === "sync"
2. 读取 syncEvent.type、syncEvent.seq、syncEvent.aggregateID
3. 读取 syncEvent.data 作为载荷
4. 将 syncEvent.type 去掉 ".1" / ".2" 后缀后，与 Legacy 目录对照语义
5. 嵌套字段查 nested-types.md
```
