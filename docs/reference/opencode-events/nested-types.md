# 嵌套类型（载荷内字段）

> 本文 **不属于任何一种信封**。描述的是 Legacy `properties`、V2 `data`、Sync `syncEvent.data` 里 **复杂字段** 的结构。  
> 信封分册：[README](./README.md) · **何时触发**：[triggers.md](./triggers.md)

---

## Part

用于 Legacy/V2/Sync 中 `message.part.updated` 的 **`part`** 字段。

| `part.type` | 含义 |
|-------------|------|
| `text` | 文本 |
| `reasoning` | 思考 |
| `tool` | 工具调用 → 见 ToolPart |
| `file` | 附件 |
| `subtask` | 子任务 |
| `step-start` / `step-finish` | 步骤 |
| `snapshot` / `patch` | 快照 / 补丁 |
| `agent` | Agent |
| `retry` | 重试记录 |
| `compaction` | 压缩 |

公共字段：`id`, `sessionID`, `messageID`, `type`。

### ToolPart / ToolState

```typescript
{
  type: "tool",
  callID: string,
  tool: string,
  state: ToolState
}

ToolState =
  | { status: "pending"; input; raw: string }
  | { status: "running"; input; title?; metadata?; time: { start } }
  | { status: "completed"; input; output: string; title; metadata; time: { start, end, compacted? }; attachments? }
  | { status: "error"; input; error: string; metadata?; time: { start, end } }
```

---

## Message

用于 `message.updated` 的 **`info`** 字段。

| `info.role` | 要点 |
|-------------|------|
| `user` | `id`, `sessionID`, `agent`, `model`, `time.created`, … |
| `assistant` | 上述 + `parentID`, `tokens`, `cost`, `error?`, `finish?` |

---

## Session

用于 `session.created` / `session.updated` / `session.deleted` 的 **`info`** 字段。

字段含：`id`, `title`, `agent`, `model`, `time`, `permission`, `revert`, …

---

## SessionStatus

用于 `session.status` 的 **`status`** 字段。

| `status.type` | 附加字段 |
|---------------|----------|
| `idle` | — |
| `busy` | — |
| `retry` | `attempt`, `message`, `next`（Unix ms）, `action?` |

---

## 错误对象

用于 `session.error` 的 **`error`**、`session.next.tool.failed` 等。

| `error.name` | 说明 |
|--------------|------|
| `APIError` | 含 `statusCode`, `responseBody`, `isRetryable` |
| `ProviderAuthError` | 鉴权 |
| `MessageAbortedError` | 中止 |
| `ContextOverflowError` | 上下文溢出 |
| `ContentFilterError` | 内容过滤 |
| 其他 | `UnknownError`, `MessageOutputLengthError`, `StructuredOutputError` |

---

## LlmToolContent

用于 **`session.next.tool.progress`** / **`session.next.tool.success`** 的 **`content[]`**（仅 Legacy/V2 流式事件，见各分册）。

```typescript
{ type: "text"; text: string }
| { type: "file"; uri: string; mime: string; name?: string }
```

与 ToolPart 的 ToolState **不是同一套模型**。

---

## 其他常用类型

| 类型 | 出现字段 |
|------|----------|
| `Todo[]` | `todo.updated` → `todos` |
| `Pty` | `pty.created/updated` → `info` |
| `RevertState` | `session.next.revert.staged` → `revert` |
| `SessionNextRetryError` | `session.next.retried` → `error` |
| `ModelRef` | `session.next.model.switched` → `model` |
| `LocationRef` | `session.next.moved` → `location` |
