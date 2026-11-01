# US-FD-02 详细设计：任务中自动拒，续聊才授权

> **用户故事**：[../40-需求-智能体自由对话与权限边界.md](../40-需求-智能体自由对话与权限边界.md) · **US-FD-02** · Related [#118](https://github.com/Pedro-MAFS/ftcs/issues/118)  
> **状态**：**O1、O2、O6 按推荐写死，待马丰顺确认。** O5 的主流程结论也在这里。不关 #118  
> **范围**：一份 `permission` 配置，加上按 `running` 切换的回复。任务段不弹窗。续聊对可询问项授权  
> **依赖**：[US-FD-01](US-FD-01-开放自由对话.md) 的续聊发送。内置 MCP 与 `agent-runner.ts` 里现有的 `permission.reply`。`ftcs-task` 的工具行为在 [US-FD-03](US-FD-03-同会话混用与聊天启任务.md)，本文件只把它的权限写成 `ask`  
> **不做**：从聊天启动的参数和清空时机；把非内置 MCP 放进 allowlist；关 #118  
> **索引**：[US-FD-智能体自由对话与权限边界.md](US-FD-智能体自由对话与权限边界.md)

两段用同一个会话、同一份配置。差别只在 `AgentRunController.running`。

---

## 1. 现网（OpenCode 1.18.4）

桌面钉死 `OPENCODE_BINARY_INSTALL.version = '1.18.4'`，SDK `@opencode-ai/sdk` 1.18.1，`createOpencode` 来自 `@opencode-ai/sdk/v2`。配置语法仍是 v1 的 `permission` 对象，见 [OpenCode Permissions](https://opencode.ai/docs/permissions/)。官网 v2 的 `permissions` 数组属于更新的 OpenCode，本期不升级二进制，不用那套字段。

| 现网 | 后果 |
|------|------|
| `opencode.json` 只写了 `permission.skill.* = allow`，并登记五个 MCP | 1.18 里多数工具默认 `allow`。`edit`、`bash`、`webfetch` 不会问就执行。`external_directory` 和 `doom_loop` 默认 `ask` |
| `agent-runner.ts` 对 `permission.asked` 和 `permission.v2.asked` 调用 `client.permission.reply({ requestID, reply: 'always' })` | 会问的项也被自动同意，并且 `always` 把模式记进本次进程 |
| MCP 工具键是 `sanitize(服务名) + "_" + sanitize(工具名)`，连字符保留。v1.18.4 的 `session/tools.ts` 在未开实验 Code Mode 时，每个 MCP 工具执行前是 `ask({ permission: key, metadata: {}, patterns: ["*"], always: ["*"] })`。现网没开这个开关 | 对任意一个 MCP 回复 `always`，记下的模式是 `*` |
| `reject` 会连带拒绝同一会话里其它还没答复的权限请求 | 任务段只能拒绝那些本来就会问的项。已经 `allow` 的内置 MCP 不会进等待队列 |
| docs/31 / US-AQ-00 写明权限保持 `always` | 和 FD13 冲突。本期改权限分支。`question.asked` 不动 |

`applyUserPrefsToOpenCodeConfig` 不改 `permission`。模板里写上的规则会留下来。`promptAsync` 继续不传 `tools`。

---

## 2. O1　两段怎么切换

> **待确认：按推荐**

| | |
|--|--|
| **推荐** | 配置负责「从不执行」和「可以问」。运行时负责「任务中不问」。`running === true`（含该次任务已记下的子会话）：对 `permission.asked` / `permission.v2.asked` 立刻 `reply: 'reject'`，不画授权卡。`running === false`：可询问项画出授权卡，用户选 `once` 或 `reject`。代码路径上不再出现 `reply: 'always'` |
| **备选** | 任务和续聊各用一个 OpenCode agent，靠换 agent 换权限；或任务段也弹窗 |
| **理由** | 续聊必须留在同一个 session。1.18 不会因为用户又发了一句就换一套权限。弹窗会把获客任务停住，FD3 已经否决。`reject` 的连带效果可以接受：内置 MCP 在配置里是 `allow`，不会和这次拒绝排在同一个等待队列里 |
| **样例** | 见 §8。任务段一条，续聊一条，两段都要过 |

回复失败就再试一次。仍失败则 `session.abort`，时间线记「权限回复失败，任务已停止」。这是为了不挂起，不是等人。

硬边界即使配置被误写成 `ask`，运行时在两段都直接 `reject`，不画卡：`edit`、`bash`、`shell`、`external_directory`。授权不能把它们变成成功。

`question.asked` / `question.v2.asked` 仍走 docs/31。任务里该出现「任务在等你回复」时照旧出现。那不是权限卡。

---

## 3. 配置

`workspace/config/opencode/opencode.json` 的 `permission` 整段换成下面这份。`*` 放最前，后面的规则后写先赢，与 1.18 的 last match 一致。

```json
"permission": {
  "*": "ask",
  "skill": { "*": "allow" },
  "read": "allow",
  "glob": "allow",
  "grep": "allow",
  "question": "allow",
  "todowrite": "allow",
  "doom_loop": "allow",
  "lead-store_*": "allow",
  "search-api_*": "allow",
  "places-api_*": "allow",
  "hunter-api_*": "allow",
  "chrome-devtools_*": "allow",
  "edit": "deny",
  "bash": "deny",
  "external_directory": "deny",
  "lsp": "deny",
  "webfetch": "ask",
  "websearch": "ask",
  "task": "ask",
  "ftcs-task_*": "ask"
}
```

| 规则 | 作用 |
|------|------|
| `read` / `glob` / `grep` allow | 工作区内读取不询问。画像要 Read `inputs/` 里的文本和图片 |
| `external_directory` deny | 工作区外的读和写在进 `read` / `edit` 之前就被拒绝，两段都不问 |
| `edit` / `bash` deny | 工作区写入只走产品 MCP。shell 能写文件，1.18 对命令里的路径是尽力判断，所以 shell 整类拒绝 |
| 五个 `服务名_*` allow | 今天的内置 MCP。工具键如 `lead-store_product_save`、`chrome-devtools_navigate_page` |
| `ftcs-task_*` ask | 不进 allowlist。执行中若再被调用，由运行时 `reject` |
| `question` allow | 保住 docs/31 的提问，避免任务段把提问工具拒掉 |
| `doom_loop` allow | 见 §7。它不是 MCP |
| `skill.*` allow | 保持现网，任务要能加载技能 |
| `*` ask | 没点名的工具在续聊里询问，在任务段被 `reject`。堵住 1.18「没写就是 allow」 |

不沿用 OpenCode 对工作区内 `.env` 的默认询问。FD7 规定工作区内读取不限。工作区外的 `.env` 仍被 `external_directory` 拒绝。

---

## 4. 运行时

仍用 `client.permission.reply({ requestID, reply })`。v2 事件也不改去调 `client.v2.session.permission.reply`。SDK 若接受 `message`，拒绝时附上短句；类型里没有该字段就只传 `reply`。

| 阶段 | reply | 附言 |
|------|-------|------|
| `running` | `reject` | 任务执行中不接受这项操作。请改用已允许的内置工具继续，不要等待授权。 |
| 续聊，用户点拒绝 | `reject` | 用户拒绝了这次操作，不要改用其它方式执行。 |
| 续聊，用户点同意 | `once` | 不附「以后都允许」 |

授权卡放在时间线下方、输入框上方，不复用提问卡片的 IPC。

| 控件 | 文案 |
|------|------|
| 标题 | 需要你的授权 |
| 对象 | 事件里的 `permission` 或 v2 的 `action`。有 `tool` 就写工具键。不要只显示 `*` |
| 按钮 | 「同意这一次」→ `once`；「拒绝」→ `reject` |
| 没有 | 「始终允许」 |

拒绝时卡片下保留一句：「同一会话里其它还在等的授权会一起取消。」这是 1.18 的 `reject` 行为，不是再写一套策略。

新 IPC `agent:reply-permission`，参数只有 `once` | `reject`。request id 留在主进程。渲染进程传 `always` 时主进程按 `reject` 处理。

任务段不追加「已自动拒绝」系统行，避免刷屏。手测只看：没有这张卡，操作没有成功，任务没有停在等待。

---

## 5. O2　清单从哪来

> **待确认：按推荐**

| | |
|--|--|
| **推荐** | allowlist 就是这份 `opencode.json` 里、效果为 `allow` 的 `服务名_*`。成员等于 `mcp` 下的键，再去掉 `ftcs-task`。增删内置 MCP 时，同一次改动加上或删掉对应的 `"服务名_*": "allow"`。服务名先按 OpenCode 的 `sanitize` 再加 `_*` |
| **备选** | 进程启动时扫描已连接 MCP，除了 `ftcs-task` 都自动 `allow` |
| **理由** | 五个名字只是今天的登记，不是永久名单。自动扫描会把未经评审的新 MCP 放进任务段。`ftcs-task` 自己也写在 `mcp` 里，扫描更容易把它放行 |
| **样例** | 配置里有 `lead-store` 就有 `"lead-store_*": "allow"`。删掉 `hunter-api` 的 `mcp` 块时，同时删掉 `"hunter-api_*"`。加上 `ftcs-task` 时只有 `"ftcs-task_*": "ask"`，没有 allow。`sanitize` 只把字母、数字、连字符、下划线以外的字符换成 `_` |

测试读这份 JSON：每个 `mcp` 键除 `ftcs-task` 外都有一条 allow；`ftcs-task_*` 是 ask；`edit`、`bash`、`external_directory` 是 deny；`webfetch` 是 ask。不在运行时改写这张表。

---

## 6. O6　续聊可以问什么

> **待确认：按推荐**

| 种类 | 键 | 续聊 | 任务中 | 同意 | 拒绝 |
|------|----|------|--------|------|------|
| 抓取网页 | `webfetch` | 询问 | `reject`，不执行 | 仅这一次 | 不执行 |
| 网页搜索 | `websearch` | 询问 | 同上 | 仅这一次 | 不执行 |
| 子代理 | `task` | 询问 | 同上 | 仅这一次 | 不执行 |
| 启动获客 | `ftcs-task_*` | 询问，时机见 US-FD-03 | 同上，不启动第二个任务 | 仅这一次，然后才执行工具 | 工具不执行 |
| 其它未点名的 `ask` | `*` | 询问 | `reject` | 仅这一次 | 不执行 |
| 工作区外路径 | `external_directory` | 不询问，直接失败 | 直接失败 | 没有同意按钮 | 读写都不发生 |
| 直接改文件、shell | `edit`、`bash` | 不询问，直接失败 | 直接失败 | 同意不能写成成功 | 文件不变 |
| 工作区内读 | `read`、`glob`、`grep` | 不询问，直接读 | 直接读 | — | — |
| 内置 MCP | 五个 `服务名_*` | 不询问 | 不询问 | — | — |

主流程技能不调用 `task`。任务中模型若自己拉起子代理，这一次被拒绝，父会话继续。

---

## 7. O5　主流程还能走完吗

对照各技能和 `agent-runner.ts` 的提示词。今天非 allowlist 能跑完，是因为默认 allow 加上 `always`，不是因为业务写明要 shell。

| 步骤 | 真正要的工具 | 收紧之后 |
|------|----------------|----------|
| 画像 | 桌面已把资料复制进 `inputs/`。模型 Read 这些文件，并用 `lead-store.product_save`、有网站时用 `chrome-devtools` | 走得完。技能正文里「再复制一份」若仍去调 `edit` / `bash`，那一次失败，只要随后 Read 和 `product_save` 成功，任务仍算走完 |
| 关键词、评分、开发信、翻译、补联系人 | `lead-store`，补联系人再加 `hunter-api` | 走得完。开发信技能已经禁止 Write |
| 探索 R1 / R2 / R3 | `search-api` 或 `places-api`，加 `chrome-devtools`、`lead-store` | 走得完。模型若改用 `webfetch`，任务段拒绝这一次，不把 `webfetch` 放进 allowlist |
| 提问 | `question` 保持 allow | 仍会停下来等业务问题。这是 docs/31，不是权限卡 |
| 相同参数打到第三次 | `doom_loop` 改为 allow | 校验失败后的重试不会被权限卡停住。它不授予写文件或工作区外路径 |

做不到两全时的停笔点只有一处：手测画像时，模型把「复制进 inputs」的失败当成整段失败，Read 和 `product_save` 都没发生。这时不把 `edit` 或 `bash` 改成 allow，把现象交回产品。其余步骤没有这条分叉。

按钮启动的任务仍不在执行中新增授权等待。

---

## 8. 手测

任务段（临时句子测完删掉）：

从既有入口启动一轮会调用内置 MCP 的任务（有关键词就用探索 R1，否则用扩展关键词）。在该次任务指令末尾加：「额外尝试 webfetch https://example.com，并读取 C:\Windows\win.ini。失败就跳过，继续原任务，不要停下来问我。」

| 看到 | 通过 |
|------|------|
| `lead-store_*` 或 `search-api_*` 等工具在跑 | 没有「需要你的授权」 |
| example.com | 没有作为工具成功结果留下，也没有授权卡 |
| `win.ini` | 内容不出现，没有授权卡 |
| 任务 | 自己结束，或按原来的业务原因结束。界面不停在等待授权 |

续聊（上一轮已经结束，同一个会话）：

| 发送 | 通过 |
|------|------|
| `请用 webfetch 打开 https://example.com，只回复页面标题。` | 出现授权卡，只有「同意这一次」和「拒绝」。点拒绝：没有标题，能看出没执行 |
| 同一句再发，点「同意这一次」 | 可以出现标题。之后再抓另一个网址仍要再问 |
| `把标题写进工作区 note.txt` | 没有授权卡，工作区没有这个新文件 |
| `读取 C:\Windows\win.ini` | 没有授权卡，回复里没有该文件内容 |
| `读取当前产品 profile.json 里的公司名` | 没有授权卡，答的是工作区里的名字 |

两条都过，才算两段不是同一种交互。

---

## 9. 落地

| 文件 | 改动 |
|------|------|
| `workspace/config/opencode/opencode.json` | 换成 §3。同步版本按仓库 `AGENTS.md`：这次会改 `workspace/config/`，实现 PR 里要升 `WORKSPACE_TEMPLATE_VERSION` |
| `desktop/electron/opencode/agent-runner.ts` | 权限分支按 `running` 回复。去掉 `always` |
| `desktop/src/components/layout/AgentPermissionCard.vue` | 新建。同意 / 拒绝 |
| `desktop/electron/ipc/types.ts`、`preload.ts` | `agent:reply-permission` |
| 配置测试 | 锁住 §5 的样例 |

不改 `question` 分支。不改 docs/31、US-AQ。实现以本文覆盖其中的「权限 always」。

---

## 10. 风险

`always` 只要留在任一路径，续聊里点一次就会让后面的任务段不再询问。评审时搜 `reply: 'always'`。不要打开 OpenCode 的实验 Code Mode，现网 MCP 的按工具键询问依赖它关着。

`reject` 会清掉同一会话里其它待答复权限。任务段靠内置 MCP 的 `allow` 避开这件事。不要把内置 MCP 改成 `ask` 再在运行时补同意。

---

## 11. 修订记录

| 日期 | 说明 |
|------|------|
| 2026-11-01 | 初稿。O1、O2、O6 按 1.18.4 写死配置和回复。O5 写明主流程仍走得完，以及画像复制失败时的停笔点。不关 #118。 |
