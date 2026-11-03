# US-FD-03 详细设计：同会话混用，并从聊天启动任务

> **用户故事**：[../40-需求-智能体自由对话与权限边界.md](../40-需求-智能体自由对话与权限边界.md) · **US-FD-03** · Related [#118](https://github.com/Pedro-MAFS/ftcs/issues/118) · 对照 [#136](https://github.com/Pedro-MAFS/ftcs/issues/136)  
> **状态**：**O3 主路径已按 #136 / #137 锁定**（技能 + 提问卡 + `run*`）。2026-11-04 改口：实现 PR 物理删除 `ftcs-task`。不关 #118  
> **范围**：任务结束后的闲聊；用技能加现网提问卡收集必填并启动；失败文案；时间线何时清空。复制会话仍按 docs/38  
> **依赖**：[US-FD-01](US-FD-01-开放自由对话.md) 的发送。[US-FD-02](US-FD-02-任务中自动拒与续聊授权.md) 的任务段 `reject`。提问卡复用 [US-AQ-01](US-AQ-01-识别等待态并展示问题.md) / [US-AQ-02](US-AQ-02-点选提交并继续任务.md)  
> **不做**：把 `ftcs-task` 写成通过条件；另做启任务授权卡；执行中再启一轮；关 #118  
> **要删除**：实现 PR 删掉 `workspace/mcp-servers/ftcs-task/`，从 `opencode.json` 摘掉 mcp 登记和 `permission` 里的 `ftcs-task_*`，并清理只服务于该入口的死代码（如 observe / launch 路径）  
> **索引**：[US-FD-智能体自由对话与权限边界.md](US-FD-智能体自由对话与权限边界.md)

闲聊的通过条件是：上一轮任务已结束，下一轮还没创建会话。启动本身单独测。主验收不依赖 `ftcs-task`。

---

## 1. O3　技能引导，桌面调用现有 run*

> **已按 #136 / #137 锁定。** 不采用「模型调 `ftcs-task`，同意后才启动」。该包由实现 PR 物理删除。主路径仍是技能 + 提问卡 + `run*`。

用户说出要启动哪一步。技能只负责把必填收进一次 `question`。桌面在提问卡提交成功后调用现有入口，不新写一套流水线。

| stage | 现有入口 |
|-------|----------|
| `keywords` | `runExpandKeywords(productId)` |
| `explore` | `runDiscoverLeads(productId, { channel })`，`channel` 为 `r1` \| `r2` \| `r3` |
| `score` | `runScoreAndDedupe(productId)` |
| `email` | `runDraftOutreachEmail(productId)`，不传 `leadIds`，与按钮「起草待处理线索」相同 |

启动前走该按钮已经有的校验和 preflight（画像未就绪、还没有关键词、R3 的 Places 预检等）。失败用那句现成原因。画像、补联系人、单封重写、中文对照不从聊天启动。技能让模型指向左侧按钮，不为它们发这张卡。

推荐技能：`workspace/skills/start-from-chat/SKILL.md`（文件名实现可微调）。触发语覆盖「扩展关键词 / 探索 / 评分去重 / 起草开发信」。正文写明：先 `lead-store.product_list`（已是 allow，无授权卡）；没有产品就直接说明，不要发 `question`；有产品就发一次 `question`，然后停止。不要写文件，不要自己跑步骤技能。

下列步骤技能今天会在「用户说扩展关键词」这类话上被加载，从而在自由对话里自己执行。各在「何时使用」加一句守卫（句子实现可微调）：自由对话里要求启动时，改走上面的启动技能；本技能只在桌面 `run*` 已经建好的任务会话里执行。

- `workspace/skills/expand-keywords/SKILL.md`
- `workspace/skills/discover-leads/SKILL.md`
- `workspace/skills/discover-leads-r2/SKILL.md`
- `workspace/skills/discover-leads-r3/SKILL.md`
- `workspace/skills/score-and-dedupe/SKILL.md`
- `workspace/skills/draft-outreach-email/SKILL.md`

`workspace/AGENTS.md` 的「向用户提问」补一句：从聊天启动上述步骤时用提问卡。实现 PR 改了 `workspace/skills/` 或 `workspace/AGENTS.md`，要按仓库 `AGENTS.md` 升 `WORKSPACE_TEMPLATE_VERSION`。

---

## 2. 提问卡：谁发问，选项从哪来，点选后谁启动

> **已按 #136 / 2026-11-03 锁定。** 复用现网 `question.asked` / `question.v2.asked` 和 `AgentAwaitingReplyCard`。不新做卡片，不走 `agent:reply-permission`。

发问的是模型，按启动技能调用 OpenCode 的 `question`（US-FD-02 里 `question` 已是 allow）。展示和提交仍是 US-AQ：主进程槽 → `awaiting-reply` → 卡片上的「提交」→ `agent:reply-question` → `replyToPendingQuestion`。

只在 `AgentRunController.running === false` 时，把下面这组题头当成启任务。题头是技能和桌面的接线契约：要改必须两边一起改（实现可微调，不能只改一边）。其它题头仍是普通提问，reply 之后不调用 `run*`。

| header | 何时必须有 | 选项 `label`（提交值） | 选项从哪来 |
|--------|------------|------------------------|------------|
| `产品` | 总是 | 产品 `id` | 模型用 `lead-store.product_list` 的 `id`。`description` 用 `company_name`，没有就写「未命名」。提交后桌面用 `listProductSummaries()`（`profile-reader.ts`，与侧栏 `PROFILE_LIST` 同源）核对，对不上就不启动 |
| `阶段` | 总是 | `keywords` \| `explore` \| `score` \| `email` | 固定。说明分别是扩展关键词、探索、评分去重、起草待处理线索 |
| `渠道` | 阶段可能是探索时必须有。用户已说清扩展关键词、评分或起草时可以不问 | `r1` \| `r2` \| `r3` | 固定。说明分别是全网搜索、社媒发现、地图发现。阶段不是 `explore` 时，桌面丢掉这题的答案 |

三题放在同一次 `question` 里，一次「提交」交完。`custom: false`，不出现「输入自己的答案」。不设 `multiple`。即使用户话里已经说了阶段，仍用这张卡确认；桌面不从原话猜阶段。空的产品列表不要发空卡。

点选之后：

1. 题头在清槽之前从主进程槽读出。清槽之后界面只剩选中的 `label`，对不上是哪一题。  
2. reply 成功，且题头匹配，且 `running` 仍是 false。  
3. 主进程用答案拼出 stage、product id、必要时的 channel，调用现有 `launchChatTask`（`fromChat: true`），进入上表的 `run*`。  
4. 不读任何 MCP 的成功 JSON 来决定启动。模型在 question 返回后必须停住。

校验不过：仍然 reply，让提问工具结束，但不调用 `run*`，时间线追加 §4 的句子。reply 失败：卡片留下，沿用 US-AQ-02 的「没能提交，请再试一次，或结束任务。」，不启动。

这张卡出现时不要把 `agentStatus` 写成 `running`。面板可以出现现网的「任务在等你回复」。没有「需要你的授权」，也没有任务「中止」。答案只从「提交」走。输入框里的字不算选择。

「结束任务」、自由回复的「停止」、或这张卡超时：都是取消。`question.reject`，追加「已取消，任务未启动。」，不调用 `run*`。启任务题不走 US-AQ-03 的「十分钟自动选第一项」，否则会没点就启动。任务执行中的普通提问仍按 US-AQ-03。

---

## 3. 和 US-FD-02 的边界；删除 ftcs-task

> **2026-11-04 改口：实现 PR 要删除。** 删掉 `workspace/mcp-servers/ftcs-task/`，从 `opencode.json` 摘掉 mcp 登记和 `permission` 里的 `ftcs-task_*`，并删掉只服务于该入口的死代码。O3 主路径仍按 #136 / #137：技能 + 提问卡 + `run*`。

提问卡只发生在 `running === false`。聊天路径要等 `session.create` 成功、`commitChatSession` 把 `running` 设为 true 之后，才算进入执行。此之前不弹授权卡。

一旦 `running === true`：

- 题头仍像启任务的提问：不展示第二张启任务卡，不调用第二个 `run*`。  
- 其它业务提问仍是任务里的 US-AQ，那不是再启一轮。  
- 非 allowlist 的权限按 US-FD-02 `reject`，不画授权卡。

删除后会话里不应再出现 `ftcs-task`。主验收不依赖该 MCP。若残留调用：不启动流水线，不画 `AgentPermissionCard`。`observeStartTaskTool` 一类只看该工具结果再进 `launchChatTask` 的路径一并删掉。

按钮若在卡还开着时启动：走按钮自己的路径。随后再提交这张卡，看到 `running === true`，不启动第二轮，追加「任务没有启动：已有任务在运行。」

---

## 4. 时间线：创建成功后才清空

> **已按 #136 / 2026-11-03 锁定。只此一种。**

拒绝、取消、校验失败、预检失败、`session.create` 失败：不清空，在现有时间线末尾追加说明。`session.create` 成功之后，才用这一轮任务的时间线整表替换。按钮入口保持现在的行为：一启动就换成任务前缀。

聊天入口不要调用 `resetTimelineView`，也不要调用会立刻清空的 `resetAgentForExpandKeywords` 一类函数。继续用只给聊天的 `fromChat`：`session.create` 返回 id 之前，不向界面发送会整表替换的时间线，也不要把 `agentStatus` 设成 `running`。按钮不传这个选项。

创建成功后的时间线里要有现成的 `sys-session` 行（`已创建 OpenCode session` 加新 id）。

---

## 5. 用户能看见什么

| 情况 | 时间线追加 | 任务状态 |
|------|------------|----------|
| 结束任务、停止、reject、超时未选完 | 已取消，任务未启动。 | 不进入运行 |
| 没有产品，或选中的 id 不在 `listProductSummaries()` | 任务没有启动：还没有当前产品。 | 不进入运行 |
| 缺阶段、阶段不是四者之一、探索缺 `r1`/`r2`/`r3` | 任务没有启动：不能从聊天启动这一步。 | 不进入运行 |
| 画像、关键词、线索、待起草等现网校验失败 | 任务没有启动：后面接该 `run*` 或 preflight 的原句。 | 不进入运行 |
| 提交时已有任务在跑 | 任务没有启动：已有任务在运行。 | 保持原来的那次运行 |
| `session.create` 失败，或 `run*` 抛错 | 任务没有启动：后面接原因。不要写「未授权」。 | 不进入运行 |
| 删除 `ftcs-task` 之后 | 工具列表里不再出现它。若残留调用，不启任务、不画卡 | 主验收不依赖该 MCP |
| `session.create` 成功 | 整表换成这一轮任务，不再追加上面的句子 | 与按钮启动后相同 |
| 进入执行后再出现启任务题头 | 不弹启任务卡，也不弹授权卡 | 原任务继续，不启动第二个 |

没有「未授权，任务未启动。」这句。闲聊被取消时，取消前的句子都还在。

---

## 6. 复制会话（O5 的这一半）

不改 [docs/38](../38-需求-复制当前智能体会话.md) 和 US-CS。自由对话写进 `agentTimeline` 的条目，复制时按栏内已有顺序带走。不新增元信息字段。

从聊天启动并清空之后，复制到的是新任务栏里的条目，父会话号是新的 `sys-session`。这和按钮启动后的复制一样。

---

## 7. 手测

1. 一轮任务结束后，不点左侧按钮，发送「用一句话说明什么是 FOB」。回复讲的是贸易术语。任务留下的条目还在。  
2. 再发送「开始扩展关键词」。出现提问卡（可有「任务在等你回复」），不是「需要你的授权」。状态不是运行中，左侧流水线不显示某一步在跑。上一句还在。卡上有产品，有阶段。  
3. 点「结束任务」。卡片消失。末尾是「已取消，任务未启动。」FOB 那句还在。关键词文件没有被这次重写。  
4. 再发一次。选一个真实产品 id，阶段选 `keywords`（若有渠道，任选，桌面不用）。画像已就绪时，时间线换成新的关键词任务，含新的 session id。`lead-store` 自动执行。没有授权卡，也没有第二张启任务卡。  
5. 任务跑起来之后，临时在指令末尾加「再用提问卡启动一次关键词扩展」（测完删）。没有第二张启任务卡，没有并列的第二个任务。  
6. 另一次：画像未就绪时选完「开始扩展关键词」。时间线不清空，能看到「任务没有启动：」加上现网的未就绪原因，状态不是运行中。  
7. 点「复制会话」。正文含当时栏里的闲聊或任务条目，格式仍是 docs/38。  
8. 从左侧按钮走录入 → 画像 → 探索 → 线索 → 开发信。步骤和结果与现在一致，执行中没有授权卡，也没有启任务提问卡。  

主验收不依赖 `ftcs-task`。删除后不应再出现该工具。若残留调用：没有授权卡，也没有因此启动。

---

## 8. 落地

本文件只定接线。**下面这些文件不在本详设 PR 里改。**

| 文件 | 改动 |
|------|------|
| `workspace/skills/start-from-chat/SKILL.md` | 推荐新增，见 §1。文件名实现可微调 |
| §1 列出的六个步骤技能，以及 `workspace/AGENTS.md` | 守卫句。实现 PR 升 `WORKSPACE_TEMPLATE_VERSION` |
| `desktop/electron/opencode/agent-runner.ts` | 提问卡答完且题头匹配、`running === false` 时调用现有 `launchChatTask` / `run*`（`fromChat`）。删掉只把 `ftcs-task` 当入口的 observe / launch 死代码。删除后无需专用 reject 分支 |
| `desktop/electron/opencode/chat-start-task.ts` | 解析对象从 `start_task` JSON 改为提问答案。去掉「未授权」文案。清掉只服务于 `ftcs-task` 的死代码 |
| `workspace/mcp-servers/ftcs-task/`、`workspace/config/opencode/opencode.json` | 删除包。摘掉 mcp 登记与 `permission` 里的 `ftcs-task_*`。改了 `workspace/mcp-servers/` 或 `workspace/config/` 时，实现 PR 升 `WORKSPACE_TEMPLATE_VERSION` |
| `desktop/electron/opencode/awaiting-reply.ts` | 启任务题超时按取消，不自动选第一项 |
| `desktop/src/components/layout/AgentAwaitingReplyCard.vue` | 不新做卡。「结束任务」在启任务场景下是取消选择，不走任务失败收尾 |
| `desktop/src/composables/useWorkspace.ts` | 聊天路径不提前 `resetTimelineView` |

按钮的 IPC 和 `resetAgentFor*` 保持原样。删除 `ftcs-task` 包，从 `opencode.json` 摘掉 mcp 登记与 `ftcs-task_*` permission，并清理 `agent-runner` / `chat-start` 等死代码。

---

## 9. 风险

启任务题若沿用「十分钟选第一项」，会在用户没点的情况下启动。手测不能只看卡片能提交。

先 reply 再启动时，模型可能在旧会话里按步骤技能写文件。技能必须写明 question 一返回就停。`chatLaunching` 期间不要再接受另一次启动。

`session.create` 之前若整表替换时间线，第 3 步和第 6 步的闲聊会消失。

只服务于 `ftcs-task` 的 observe / launch 路径若留下，验收又会绕回该 MCP。删包时一并删掉。

---

## 10. 修订记录

| 日期 | 说明 |
|------|------|
| 2026-11-01 | 初稿。O3 曾写 `ftcs-task` / `start_task`、授权在执行前、创建成功后才清空。 |
| 2026-11-03 | 按 #136 改口。启任务改为技能 + 现网提问卡，选完必填即启动。`ftcs-task` 留着不用，不作入口。复制仍按 docs/38。不关 #118。 |
| 2026-11-04 | 改口：实现 PR 物理删除 `ftcs-task`（包、`opencode.json` 登记与 `ftcs-task_*`、相关死代码）。O3 主路径仍是技能 + 提问卡 + `run*`（#136 / #137）。主验收不依赖该 MCP。不关 #118。 |
