# 事件触发说明

> 本文 **不属于任何一种信封**。描述的是每种 `type` **何时发出**。  
> 同一 `type` 在 Legacy / V2 / Global / Sync 里语义相同；Sync 仅有部分 type（无 delta），见 [sync.md](./sync.md)。  
> 字段结构：[legacy.md](./legacy.md) · 嵌套类型：[nested-types.md](./nested-types.md)

---

## 两套并行模型（读后续表格前先看）

一次 Agent 回复里，**同一件事可能发出两类事件**：

| 模型 | type 前缀 | 触发粒度 | 用途 |
|------|-----------|----------|------|
| **Part 快照** | `message.part.*` | part 整份状态变更（含 tool 的 pending/running/completed） | 权威快照，可落库、可回放 |
| **Session Next 流式** | `session.next.*` | 步骤/文本/思考/工具的开始、增量、结束 | 实时 UI |

它们会 **同时出现**，不是二选一。例如工具执行：`session.next.tool.called` 与 `message.part.updated`（`part.type === "tool"`）会先后或交错到达。

---

## 1. 连接与安装

| type | 何时触发 |
|------|----------|
| `server.connected` | **本条 SSE 连接刚建立**时发出，通常是流上的第一条。`properties`/`data` 实际为空 `{}`。表示「可以开始收后续事件」，不含业务数据。 |
| `server.heartbeat` | 服务端约每 10s 发一次保活。**不在** SDK `Event` union 里；若收到可忽略。 |
| `server.instance.disposed` | **当前项目实例**即将关闭（dispose）。实例流在此事件后结束。 |
| `global.disposed` | **全局服务**已释放全部实例（进程级收尾）。 |
| `installation.updated` | OpenCode **已升级到新版本**（升级完成）。 |
| `installation.update-available` | 检测到 **有新版本可更新**（尚未升级）。 |

---

## 2. 项目 / 工作区 / 目录

| type | 何时触发 |
|------|----------|
| `project.updated` | 当前项目元数据变化：名称、图标、worktree、沙箱列表等。 |
| `project.directories.updated` | 项目关联的 **目录列表** 变化。 |
| `catalog.updated` | 模型/能力目录刷新（开放键值，无固定字段）。 |
| `models-dev.refreshed` | `models.dev` 模型清单刷新完成。 |
| `integration.updated` | 第三方集成配置变化。 |
| `integration.connection.updated` | 某个集成的 **连接状态** 变化（载荷含 `integrationID`）。 |
| `reference.updated` | 引用/索引数据变化（开放键值）。 |
| `vcs.branch.updated` | 当前 Git 分支切换或变更。 |
| `workspace.ready` | 控制面 workspace **已就绪**，可连。 |
| `workspace.failed` | workspace 创建或连接 **失败**。 |
| `workspace.status` | workspace 连接状态变化：`connecting` / `connected` / `disconnected` / `error`。 |
| `worktree.ready` | Git worktree **创建完成**。 |
| `worktree.failed` | Git worktree 创建 **失败**。 |

---

## 3. 会话

| type | 何时触发 |
|------|----------|
| `session.created` | 新建会话（`POST /session` 或 TUI 新建）。 |
| `session.updated` | 会话元数据变化：标题、agent、model、share、revert 等。 |
| `session.deleted` | 会话被删除。 |
| `session.status` | 会话运行态变化：`busy`（正在跑）/ `retry`（等待重试）/ `idle`（空闲）。**判断忙闲应优先用此事件。** |
| `session.idle` | 会话进入空闲。兼容旧客户端；新代码请用 `session.status` 的 `idle`。 |
| `session.error` | 会话级错误（鉴权失败、中止、上下文溢出、API 错误等）。可能不带 `sessionID`。 |
| `session.diff` | 本会话产生的 **文件 diff 集合** 更新（快照对比结果）。 |
| `session.compacted` | 会话压缩（compaction）**整轮完成**（偏会话级收尾；过程见 `session.next.compaction.*`）。 |

---

## 4. 消息与 Part

| type | 何时触发 |
|------|----------|
| `message.updated` | 一条 user/assistant **消息头**被创建或更新（角色、tokens、cost、finish、error 等）。新建消息和后续补全都会发。 |
| `message.removed` | 一条消息被删除（revert、清理历史等）。 |
| `message.part.updated` | 消息上某个 **Part 被创建或整份更新**。文本、思考、工具、步骤、附件等都走这里。工具状态从 pending → running → completed/error **每次跃迁都会再发一次**（`part` 为完整快照）。 |
| `message.part.removed` | 某个 Part 被删除。 |
| `message.part.delta` | 某个 Part 字段的 **增量文本**（多为 assistant 文本流）。无 Sync 版本。与 `session.next.text.delta` 同类，但是 Part 模型。 |

---

## 5. Session Next — 步骤 / Agent / 模型

一次「模型回合」通常先 `step.started`，中间穿插 text / reasoning / tool，最后 `step.ended` 或 `step.failed`。

| type | 何时触发 |
|------|----------|
| `session.next.step.started` | Agent **一步开始**：即将向模型请求（含本次 agent、model）。 |
| `session.next.step.ended` | 该步 **正常结束**（有 finish、cost、tokens）。 |
| `session.next.step.failed` | 该步 **失败**（模型/运行时错误）。 |
| `session.next.agent.switched` | 本会话 **切换了 Agent**。 |
| `session.next.model.switched` | 本会话 **切换了模型**。 |
| `session.next.moved` | 会话工作目录/位置变更。 |

---

## 6. Session Next — 流式文本 / 思考

| type | 何时触发 |
|------|----------|
| `session.next.text.started` | 助手开始输出一段正文（出现新的 `textID`）。 |
| `session.next.text.delta` | 正文 **增量片段**到达（高频）。无 Sync 版本。 |
| `session.next.text.ended` | 该段正文输出完毕（带完整 `text`）。 |
| `session.next.reasoning.started` | 模型开始输出 **思考/推理**（出现 `reasoningID`）。 |
| `session.next.reasoning.delta` | 思考文本增量。无 Sync 版本。 |
| `session.next.reasoning.ended` | 该段思考结束（带完整 `text`）。 |

---

## 7. Session Next — 工具

典型顺序：`input.started` → `input.delta*` → `input.ended` → `called` → `progress*` → `success` | `failed`。

| type | 何时触发 |
|------|----------|
| `session.next.tool.input.started` | 模型开始流式生成 **工具入参**（已知工具名 `name`）。 |
| `session.next.tool.input.delta` | 入参 JSON/文本增量。无 Sync 版本。 |
| `session.next.tool.input.ended` | 入参流结束（带完整 `text`）。 |
| `session.next.tool.called` | 入参已齐，**正式发起工具调用**（含 `tool`、`input`）。 |
| `session.next.tool.progress` | 工具执行中的 **中间进度**（可多次）。 |
| `session.next.tool.success` | 工具 **成功返回**。 |
| `session.next.tool.failed` | 工具 **执行失败**。 |

同一工具调用期间，`message.part.updated` 会带着 `part.type === "tool"` 的完整 `ToolState` 再发若干次。

---

## 8. Session Next — Prompt / Shell / 重试 / 压缩 / Revert

| type | 何时触发 |
|------|----------|
| `session.next.prompted` | 用户输入被 V2 引擎 **接受**（`delivery` 为 `steer` 插入当前步，或 `queue` 排队）。 |
| `session.next.prompt.admitted` | 排队/插入的 prompt **真正开始被处理**。 |
| `session.next.context.updated` | 会话上下文文本被改写（压缩或系统注入后）。 |
| `session.next.synthetic` | 引擎 **插入合成文本**（非用户手打，如系统说明）。 |
| `session.next.shell.started` | 会话内 **Shell 命令开始执行**。 |
| `session.next.shell.ended` | 该 Shell 命令结束（带 `output`）。 |
| `session.next.retried` | 模型调用失败后 **自动重试**（含 attempt、错误）。常与 `session.status` 的 `retry` 一起出现。 |
| `session.next.compaction.started` | 开始压缩历史（`reason`: `auto` 自动 / `manual` 手动）。 |
| `session.next.compaction.delta` | 压缩摘要文本增量。无 Sync 版本。 |
| `session.next.compaction.ended` | 本轮压缩结束。 |
| `session.next.revert.staged` | 用户标记「从某条消息起 revert」，进入暂存态。 |
| `session.next.revert.cleared` | 取消暂存的 revert。 |
| `session.next.revert.committed` | revert **正式提交**（对应消息及之后被回退）。 |

---

## 9. 权限

v1 / v2 是两套权限协议，运行时可能只发其中一套（视 OpenCode 版本与配置）。

| type | 何时触发 |
|------|----------|
| `permission.asked` | 某操作需用户批准（读文件、跑命令等）。UI 应弹出许可。 |
| `permission.replied` | 用户已答复：`once` / `always` / `reject`。 |
| `permission.v2.asked` | v2 权限请求（按 `action` + `resources[]`）。 |
| `permission.v2.replied` | 用户已答复 v2 权限请求。 |

---

## 10. 问答

Agent 通过 question 工具向用户提问（与权限不同：是业务问题，不是授权）。

| type | 何时触发 |
|------|----------|
| `question.asked` | 向用户提出一组问题。 |
| `question.replied` | 用户提交了答案。 |
| `question.rejected` | 用户关闭/拒绝作答。 |
| `question.v2.asked` / `.replied` / `.rejected` | 同上，v2 问答协议。 |

---

## 11. MCP / LSP / 文件 / Todo / PTY / TUI / 命令

| type | 何时触发 |
|------|----------|
| `mcp.tools.changed` | 某个 MCP server 的 **工具列表** 变化（上线、重载、断开）。 |
| `mcp.browser.open.failed` | MCP OAuth/浏览器打开失败。 |
| `lsp.updated` | LSP 服务状态或列表变化。 |
| `file.edited` | OpenCode **通过自身工具/服务改写了文件**（不是任意磁盘变更）。 |
| `file.watcher.updated` | 文件监视器看到磁盘变化：`add` / `change` / `unlink`。 |
| `todo.updated` | 该会话的 todo 列表被整体替换或更新。 |
| `pty.created` | 交互式终端会话创建。 |
| `pty.updated` | PTY 元数据/状态变化。 |
| `pty.exited` | PTY 进程退出（带 `exitCode`）。 |
| `pty.deleted` | PTY 会话被删除。 |
| `plugin.added` | 新插件被加载。 |
| `tui.prompt.append` | 请求 TUI **在当前输入框追加文本**（控制事件）。 |
| `tui.command.execute` | 请求 TUI **执行一条命令**（如 `session.interrupt`）。 |
| `tui.toast.show` | 请求 TUI **弹出 toast**。 |
| `tui.session.select` | 请求 TUI **切到指定会话**。 |
| `command.executed` | 斜杠命令/自定义命令 **已执行**（含 name、arguments、messageID）。 |

---

## 12. 一次典型回复的时序（触发先后）

```
用户发消息
  session.next.prompted
  session.next.prompt.admitted
  message.updated                    （user 消息）
  session.status = busy

  session.next.step.started
    ├─ session.next.reasoning.started → delta* → ended
    ├─ session.next.text.started → delta* → ended
    ├─ message.part.updated / message.part.delta   （同一内容的 Part 快照）
    └─ 工具：
         session.next.tool.input.* → .called → .progress* → .success | .failed
         message.part.updated      （ToolPart 状态跃迁）
         permission.*.asked        （若需授权，在 called 前后）
  session.next.step.ended | .failed

  session.status = idle
  session.idle                       （兼容，可忽略）
```

中止、鉴权失败、上下文溢出等走 `session.error` / `session.next.step.failed`，然后回到 `idle`。
