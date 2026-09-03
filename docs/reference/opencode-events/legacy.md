# Legacy 信封格式

> **订阅**：`GET /event` · SDK `client.event.subscribe()`  
> **TS 类型**：`Event`（`EventMessagePartUpdated` 等 `Event*` 前缀）  
> **总览**：[README](./README.md) · **嵌套类型**：[nested-types.md](./nested-types.md) · **何时触发**：[triggers.md](./triggers.md)

---

## 1. 根 JSON 结构

每条 SSE 消息 **就是** 一个 Legacy 事件对象（无额外外包）：

```typescript
interface LegacyEnvelope {
  id: string
  type: string              // 事件种类，见 §3
  properties: {              // 载荷，结构由 type 决定
    [key: string]: unknown
  }
}
```

### 识别条件

- 根上有 `type` + `properties`
- 根上 **没有** `directory`
- 根上 **没有** `data`（那是 V2）
- 根上 `type` **不是** `"sync"`

### 示例

```jsonc
{
  "id": "evt-001",
  "type": "message.part.updated",
  "properties": {
    "sessionID": "ses-abc",
    "time": 1710000000000,
    "part": {
      "id": "part-1",
      "type": "tool",
      "callID": "c1",
      "tool": "search-api_query",
      "state": { "status": "running", "input": {}, "time": { "start": 1710000000000 } }
    }
  }
}
```

---

## 2. SDK 映射

- Union：`export type Event = EventModelsDevRefreshed | EventSessionCreated | …`
- 单个事件：`EventMessagePartUpdated` → `type: "message.part.updated"`

---

## 3. 事件 type 目录（`properties` 字段）

下列 **`type` 值** 与 **`properties` 内字段** 一一对应。复杂字段类型见 [nested-types.md](./nested-types.md)；每种 type 何时发出见 [triggers.md](./triggers.md)。

### 3.1 连接与安装

| type | properties |
|------|------------|
| `server.connected` | 开放键值 |
| `server.instance.disposed` | `directory: string` |
| `global.disposed` | 开放键值 |
| `installation.updated` | `version: string` |
| `installation.update-available` | `version: string` |

### 3.2 项目 / 工作区

| type | properties |
|------|------------|
| `project.updated` | `id`, `worktree`, `vcs?`, `name?`, `icon?`, `commands?`, `time`, `sandboxes[]` |
| `project.directories.updated` | `projectID` |
| `catalog.updated` | 开放键值 |
| `models-dev.refreshed` | 开放键值 |
| `integration.updated` | 开放键值 |
| `integration.connection.updated` | `integrationID` |
| `reference.updated` | 开放键值 |
| `vcs.branch.updated` | `branch?` |
| `workspace.ready` | `name` |
| `workspace.failed` | `message` |
| `workspace.status` | `workspaceID`, `status: connected\|connecting\|disconnected\|error` |
| `worktree.ready` | `name`, `branch?` |
| `worktree.failed` | `message` |

### 3.3 会话

| type | properties |
|------|------------|
| `session.created` | `sessionID`, `info: Session` |
| `session.updated` | 同上 |
| `session.deleted` | 同上 |
| `session.status` | `sessionID`, `status: SessionStatus` |
| `session.idle` | `sessionID` |
| `session.error` | `sessionID?`, `error?` |
| `session.diff` | `sessionID`, `diff: SnapshotFileDiff[]` |
| `session.compacted` | `sessionID` |

### 3.4 消息与 Part

| type | properties |
|------|------------|
| `message.updated` | `sessionID`, `info: Message` |
| `message.removed` | `sessionID`, `messageID` |
| `message.part.updated` | `sessionID`, `part: Part`, `time: number` |
| `message.part.removed` | `sessionID`, `messageID`, `partID` |
| `message.part.delta` | `sessionID`, `messageID`, `partID`, `field`, `delta` |

### 3.5 Session Next — 流式文本

共有前缀：`timestamp`, `sessionID`, `assistantMessageID`

| type | 额外 properties |
|------|-----------------|
| `session.next.text.started` | `textID` |
| `session.next.text.delta` | `textID`, `delta` |
| `session.next.text.ended` | `textID`, `text` |

### 3.6 Session Next — 流式思考

| type | 额外 properties |
|------|-----------------|
| `session.next.reasoning.started` | `reasoningID`, `providerMetadata?` |
| `session.next.reasoning.delta` | `reasoningID`, `delta` |
| `session.next.reasoning.ended` | `reasoningID`, `text`, `providerMetadata?` |

### 3.7 Session Next — 工具流式

共有前缀：`timestamp`, `sessionID`, `assistantMessageID`, `callID`

| type | 额外 properties |
|------|-----------------|
| `session.next.tool.input.started` | `name` |
| `session.next.tool.input.delta` | `delta` |
| `session.next.tool.input.ended` | `text` |
| `session.next.tool.called` | `tool`, `input`, `provider` |
| `session.next.tool.progress` | `structured`, `content: LlmToolContent[]` |
| `session.next.tool.success` | `structured`, `content`, `outputPaths?`, `result?`, `provider` |
| `session.next.tool.failed` | `error`, `result?`, `provider` |

### 3.8 Session Next — 步骤 / Shell / Agent

| type | properties 要点 |
|------|-----------------|
| `session.next.step.started` | `assistantMessageID`, `agent`, `model`, `snapshot?` |
| `session.next.step.ended` | `assistantMessageID`, `finish`, `cost`, `tokens`, `snapshot?`, `files?` |
| `session.next.step.failed` | `assistantMessageID`, `error` |
| `session.next.shell.started` | `messageID`, `callID`, `command` |
| `session.next.shell.ended` | `callID`, `output` |
| `session.next.agent.switched` | `messageID`, `agent` |
| `session.next.model.switched` | `messageID`, `model: ModelRef` |
| `session.next.moved` | `location`, `subdirectory?` |

### 3.9 Session Next — Prompt / 重试 / 压缩 / Revert

| type | properties 要点 |
|------|-----------------|
| `session.next.prompted` | `messageID`, `prompt`, `delivery: steer\|queue` |
| `session.next.prompt.admitted` | 同上 |
| `session.next.context.updated` | `messageID`, `text` |
| `session.next.synthetic` | `messageID`, `text` |
| `session.next.retried` | `attempt`, `error: SessionNextRetryError` |
| `session.next.compaction.started` | `messageID`, `reason: auto\|manual` |
| `session.next.compaction.delta` | `messageID`, `text` |
| `session.next.compaction.ended` | `messageID`, `reason`, `text`, `recent` |
| `session.next.revert.staged` | `revert: RevertState` |
| `session.next.revert.cleared` | （仅 `timestamp`, `sessionID`） |
| `session.next.revert.committed` | `messageID` |

### 3.10 权限

| type | properties |
|------|------------|
| `permission.asked` | `id`, `sessionID`, `permission`, `patterns[]`, `metadata`, `always[]`, `tool?` |
| `permission.replied` | `sessionID`, `requestID`, `reply: once\|always\|reject` |
| `permission.v2.asked` | `id`, `sessionID`, `action`, `resources[]`, `save?[]`, `metadata?`, `source?` |
| `permission.v2.replied` | `sessionID`, `requestID`, `reply` |

### 3.11 问答 / MCP / 文件 / PTY / TUI / 命令

| type | properties |
|------|------------|
| `question.asked` | `id`, `sessionID`, `questions[]`, `tool?` |
| `question.replied` | `sessionID`, `requestID`, `answers[]` |
| `question.rejected` | `sessionID`, `requestID` |
| `question.v2.asked` | `id`, `sessionID`, `questions[]`, `tool?` |
| `question.v2.replied` | `sessionID`, `requestID`, `answers[]` |
| `question.v2.rejected` | `sessionID`, `requestID` |
| `mcp.tools.changed` | `server` |
| `mcp.browser.open.failed` | `mcpName`, `url` |
| `lsp.updated` | 开放键值 |
| `file.edited` | `file` |
| `file.watcher.updated` | `file`, `event: add\|change\|unlink` |
| `todo.updated` | `sessionID`, `todos[]` |
| `pty.created` / `pty.updated` | `info: Pty` |
| `pty.exited` | `id`, `exitCode` |
| `pty.deleted` | `id` |
| `plugin.added` | `id` |
| `tui.prompt.append` | `text` |
| `tui.command.execute` | `command` |
| `tui.toast.show` | `title?`, `message`, `variant`, `duration?` |
| `tui.session.select` | `sessionID` |
| `command.executed` | `name`, `sessionID`, `arguments`, `messageID` |

---

## 4. 运行时序（Legacy 流内 type 关系）

```
session.next.step.started
  ├─ session.next.text.started → .delta* → .ended
  ├─ session.next.reasoning.started → .delta* → .ended
  ├─ session.next.tool.input.* → .called → .progress* → .success | .failed
  ├─ message.part.updated / message.part.delta
  └─ session.next.step.ended | .failed

session.status (busy | retry | idle)
session.idle
session.error
```

---

## 5. 完整 type 列表（SDK `Event` union）

与 `types.gen.d.ts` 中 `export type Event = …` 一致，共 90+ 成员；上表已按业务分组覆盖全部 `type` 字符串。
