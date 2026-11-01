# US-FD 索引：智能体自由对话与权限边界

> **需求**：[../40-需求-智能体自由对话与权限边界.md](../40-需求-智能体自由对话与权限边界.md) · Related [#118](https://github.com/Pedro-MAFS/ftcs/issues/118)  
> **状态**：O1～O6 已按下面的推荐写进各故事。待马丰顺确认后再开发。本文只做目录，不关 #118。  
> **基线**：`dev-0.6.1`（需求提交 `19db8bf`）。不改 `docs/40`，不改 `desktop/`。

| 文件 | 故事 | 选型 |
|------|------|------|
| [US-FD-01-开放自由对话.md](US-FD-01-开放自由对话.md) | 任意话题可发、可答 | O4 |
| [US-FD-02-任务中自动拒与续聊授权.md](US-FD-02-任务中自动拒与续聊授权.md) | 任务段自动拒，续聊才授权 | O1、O2、O6。O5 的主流程能否走完也在这里 |
| [US-FD-03-同会话混用与聊天启任务.md](US-FD-03-同会话混用与聊天启任务.md) | 同一会话闲聊，并经任务 MCP 启动 | O3。O5 的复制会话在这里 |

```mermaid
flowchart LR
  FD01[US-FD-01]
  FD02[US-FD-02]
  FD03[US-FD-03]
  FD01 --> FD02
  FD01 --> FD03
  FD02 --> FD03
```

02 的配置要先把 `ftcs-task_*` 写成 `ask`，03 才能在工具执行前等到授权。01 可以先做发送，但没有 02 时不要把权限留在现网的一律 `always`。

## O1～O6 结论

钉住的运行时是 OpenCode **1.18.4**（`desktop/electron/runtime/opencode-binary-install-types.ts`）和 SDK **1.18.1**。权限配置用 v1 的 `permission` 对象。官网 v2 的 `permissions` 数组不用于本期。

| 项 | 推荐 |
|----|------|
| **O1** | 一份配置：`*` 为 `ask`，硬边界 `deny`，内置 MCP 前缀 `allow`。`AgentRunController.running` 为真时，仍弹出来的 `permission.asked` / `permission.v2.asked` 立刻 `reject`。续聊只让用户选 `once` 或 `reject`。删掉一律 `always` |
| **O2** | allowlist 只来自 `workspace/config/opencode/opencode.json` 的 `mcp` 键，排除 `ftcs-task`。增删内置 MCP 时改同一文件里的 `"服务名_*": "allow"`，用测试锁住。不按已连接服务自动放行 |
| **O3** | 新 MCP `ftcs-task`，工具 `start_task`，阶段 `keywords` / `explore` / `score` / `email`。授权发生在工具执行前。同意且新会话创建成功后清空时间线；拒绝或启动失败不清空 |
| **O4** | 占位改为「发消息继续聊，或说明要启动的获客步骤」。发送进入当前 OpenCode 会话并得到回复。`generating` 时输入仍禁用 |
| **O5** | 复制仍按 docs/38。主流程要的是工作区内 Read 和内置 MCP；收紧 `edit` / `bash` / `webfetch` 后仍能走完。画像若只因复制文件被拒而整段失败，停下来交产品 |
| **O6** | 续聊可询问：`webfetch`、`websearch`、`task`、`ftcs-task_*`，以及其它落在 `*` 上的 `ask`。同意只此一次，拒绝则不执行。`edit`、`bash`、`external_directory` 不进询问 |

各故事里的备选只供确认时对照。开发按推荐，不按备选。

---

## 修订记录

| 日期 | 说明 |
|------|------|
| 2026-11-01 | 按故事拆出索引。O1～O6 写明推荐。Related #118，不关 Issue。 |
