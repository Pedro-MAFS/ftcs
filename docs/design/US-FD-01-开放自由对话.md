# US-FD-01 详细设计：开放自由对话

> **用户故事**：[../40-需求-智能体自由对话与权限边界.md](../40-需求-智能体自由对话与权限边界.md) · **US-FD-01** · Related [#118](https://github.com/Pedro-MAFS/ftcs/issues/118)  
> **状态**：**O4 按推荐写死，待马丰顺确认。** 确认前不开发。不关 #118  
> **范围**：占位文案、发送进入当前会话、得到针对该话题的回复。任务进行中输入仍禁用  
> **依赖**：现网 `AgentPanel.vue` 的占位与 `onSend`。回复沿用现有时间线事件。权限两段在 [US-FD-02](US-FD-02-任务中自动拒与续聊授权.md)  
> **不做**：授权卡；FTCS 任务 MCP；执行中插话；关 #118  
> **索引**：[US-FD-智能体自由对话与权限边界.md](US-FD-智能体自由对话与权限边界.md)

本故事只打通「发出去并得到回复」。权限外的操作会不会执行，用 US-FD-02 验收。

---

## 1. 现网

对照 `dev-0.6.1`。

| 现网 | **本故事** |
|------|------------|
| 占位「自由对话暂未开放，请用左侧流水线启动任务…」 | 改为「发消息继续聊，或说明要启动的获客步骤」 |
| `onSend` 只写 `composerHint`：「当前暂不支持在对话区自由发送指令，请通过左侧按钮启动对应任务。」不产生用户消息 | 去掉这两句。文本进入当前会话，时间线出现这条用户消息，并出现针对该话题的回复 |
| `generating`（`agentStatus === 'running'`）时输入框和「发送」禁用，另有「中止」 | 保持。自由对话这一轮不把 `agentStatus` 设成 `running` |
| 空时间线写「点击「生成画像」后，此处按时间顺序展示过程」 | 改为「还没有对话。在下方输入即可。」任务启动中仍是「任务启动中…」 |
| 流水线任务每次 `session.create`，结束后 `sessionId` 留在 `AgentRunController` 上，事件订阅在 `finally` 里卸掉 | 任务已经结束时，续聊用这个 `sessionId` 再 `promptAsync`，不新建会话。还没有会话时才 `session.create`，标题 `自由对话` |

---

## 2. O4　占位与发送

> **待确认：按推荐**

| | |
|--|--|
| **推荐** | 占位用上一节那句。发送调用新 IPC `agent:send-message`，主进程 `sendFreeDialogue`。先在时间线追加 `kind: 'user'`、标题「你」、正文为原文，再 `promptAsync`。助手回复走现有 `message.part.*`。本轮用单独的 `dialogueBusy` 禁用输入和发送，不把 `agentStatus` 设为 `running`，因此不出现任务「中止」，探索页也不显示任务在跑。`generating` 时输入保持禁用 |
| **备选** | 自由对话也把 `agentStatus` 设为 `running`；或在 `generating` 时允许插话 |
| **理由** | `generating` 今天同时表示流水线占用、禁用输入和显示「中止」。自由回复若复用它，左侧会误以为获客任务在跑。执行中插话和 FD3 抢同一条输入，docs/40 也没把插话列为要做的事 |
| **样例** | 没有任务时发送「用三句话解释信用证」。时间线先出现用户这句，随后回复讲的是信用证，不出现「暂不支持自由发送」，也不把话题拉回画像或线索。占位不再含「暂未开放」。发送过程中输入暂时不可用；回复结束后可再发。此时左侧流水线不显示某一步正在跑 |

空文本不发送。服务未就绪时，`composerHint` 用现成的「服务未就绪，请稍后或重启应用」，不恢复「暂不支持」那句。

自由回复挂住时，输入框旁显示「停止」。它只对当前会话 `session.abort`，时间线追加「已停止这一轮回复」，然后恢复输入。不走任务失败收尾，不改产品数据。

---

## 3. 接线

| 项 | 约定 |
|----|------|
| IPC | `agent:send-message`，参数是字符串。渲染进程不持有 session id |
| 任务进行中 | 界面已禁用。主进程若 `running` 仍为真，直接返回「任务进行中，请结束后再发」，不 `promptAsync` |
| 已有会话 | `promptAsync({ sessionID, parts: [{ type: 'text', text }] })`。不传 `tools`，避免把会话权限盖成另一套 |
| 尚无会话 | `session.create({ title: '自由对话' })`，时间线追加现有格式的 `sys-session`（`已创建 OpenCode session` 加 id）。不调用 `resetTimelineView` |
| 事件 | 与任务共用一条订阅，会话号读控制器上的当前 id。本轮只等到 idle 或 abort，不走任务的产物读取 |
| 权限 | 本轮 `running === false`，弹出的权限按 US-FD-02 的续聊处理 |

---

## 4. 验收

- [ ] 无任务时发送一个与获客无关的问题。时间线有这条用户消息，回复针对该问题。
- [ ] 界面上找不到「自由对话暂未开放」和「当前暂不支持在对话区自由发送指令」。
- [ ] 回复不拒答，不改口去讲画像、线索或开发信。
- [ ] 上一轮任务结束后再发一句，仍是同一个 OpenCode session（`sys-session` 那一行的 id 不变），上文还在。
- [ ] 任务执行中输入框和「发送」仍不可用，仍有「中止」。
- [ ] 只闲聊时，流水线不显示某一步正在执行。

本故事不要求授权卡，也不要求启动任务。

---

## 5. 落地

| 文件 | 改动 |
|------|------|
| `desktop/src/components/layout/AgentPanel.vue` | 占位、空态、`onSend`、`dialogueBusy` 时禁用和「停止」 |
| `desktop/src/composables/useWorkspace.ts` | `dialogueBusy`。`generating` 仍只等于 `agentStatus === 'running'` |
| `desktop/electron/ipc/types.ts`、`preload.ts`、`main.ts` | `agent:send-message` |
| `desktop/electron/opencode/agent-runner.ts` | `sendFreeDialogue`。任务订阅改为可在续聊时留着，见 US-FD-02 |

不改 `workspace/config/opencode/opencode.json` 的活留在 US-FD-02。本故事单独合入时，权限仍是现网一律 `always`，不能当成 FD3～FD4 已经完成。

---

## 6. 风险

续聊必须接在任务留下的 `sessionId` 上。若结束后把 id 清掉，再发就会新开一段，任务后的「同一会话」验收失败。

`dialogueBusy` 期间若误把 `agentStatus` 写成 `running`，输入会被任务规则锁住，左侧按钮也会进入忙碌。手测第 1 条时看一眼流水线。

---

## 7. 修订记录

| 日期 | 说明 |
|------|------|
| 2026-11-01 | 初稿。O4 按推荐写死占位、发送和 `generating` 禁用。不关 #118。 |
