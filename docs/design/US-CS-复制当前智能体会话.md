# US-CS 详细设计：复制当前智能体会话

> **用户故事**：[../38-需求-复制当前智能体会话.md](../38-需求-复制当前智能体会话.md) · **US-CS-01**、**US-CS-02** · Related [#117](https://github.com/Pedro-MAFS/ftcs/issues/117)  
> **状态**：**O3 已按马丰顺 2026-11-01 锁定：超限自动存下载目录 + Toast 路径；剪贴板只留一行路径提示；待小补丁合入后开发跟改 #122**（O1 已定为弱样式 `btn-ghost`。O2、O4～O6 仍为详设默认方案。本 PR 只改详设，不改 `desktop/`）  
> **范围**：智能体栏一次复制当前会话。未超限时脱敏全文只进剪贴板；超限时脱敏全文自动进系统下载目录，剪贴板只留一行路径提示。正文按界面顺序；同一份文本在正文前附带排查元信息  
> **依赖**：现网 `AgentPanel` 的 `agentTimeline`；已有 `window.ftcs.getAppVersion()`；系统剪贴板；`app.getPath('downloads')`；`showToast`  
> **不做**：自动上报；改会话存储与展示；自由对话（[#118](https://github.com/Pedro-MAFS/ftcs/issues/118)）；搬动智能体栏；弹另存为或自选路径；超限把截断长文写入剪贴板；关闭 #117；合入 `main`  
> **文档位置**：`docs/design/`

需求依据是已合入 `dev-0.6.1` 的 `docs/38-需求-复制当前智能体会话.md`（规则 CS1～CS8、US-CS-01、US-CS-02、§7 O1～O6；基线提交 `75c219b`）。本文不改该需求正文。O3 与需求正文若仍写「待详设」，以本文锁定口径为准；分析师改 `docs/38` 时与「一行路径提示」对齐。

**O3 已按马丰顺 2026-11-01 锁定。** O1 的样式以 §2.1 为准。O3 的上限、落盘、Toast 与剪贴板一行以 §2.4 为准。O2、O4～O6 仍是详设默认方案。本文只作详设，不改 `desktop/` 业务代码。#122 已合入的是旧截断实现，待本小补丁合入后由开发跟改。

US-CS-01 与 US-CS-02 分节验收，合在这一份详设里。两次点击仍是同一个按钮。未超限时，剪贴板里同时有元信息和正文。超限时，元信息和正文在下载目录的全文文件里，剪贴板只有 §2.4 那一行路径提示。

---

## 0. 相对现网

对照 `dev-0.6.1`（`75c219b`）。

| 现网 | **本期** |
|------|----------|
| `WorkspaceLayout.vue` 从左到右是活动栏、产品与流水线侧栏、主区域、`AgentPanel`。智能体栏在主区域右侧（`border-left`，宽 `--agent-width: 340px`）。Issue 称「左侧智能体栏」 | 入口加在现网这面栏上。不搬到主区域左侧，不改栏宽 |
| `AgentPanel` 标题行：左侧脉冲 +「智能体」，右侧技能名（`SKILL_LABELS`）。其下是 `agentMeta` 卡片、时间线、等待回复卡片、输入框。没有复制会话 | 标题行右侧、技能名之后，放弱样式按钮「复制会话」（`btn-ghost`：透明底、无边框、次要文字色）。一次点击。不放进菜单。不用 `btn-primary` |
| `AgentTimelineItem.kind`：`user` / `system` / `assistant` / `reasoning` / `tool` / `error`。子代理在同一条目的 `subagent.steps`（`tool` / `reasoning` / `error`）。界面顺序即 `agentTimeline` 数组顺序 | 复制按这个数组顺序读内存里的条目。种类、顺序、折叠规则、推送方式都不改 |
| 用户消息、思考，以及 `collapsed` 的条目，界面默认 `preview(body, 160)` 再加省略号。子代理步骤默认收起，展开后长正文再 `preview(step.body, 80)` | 复制读 `item.body` 与 `step.body` 的全文。`agentExpanded` 不参与复制。界面折叠保持原样 |
| 时间线为空时，面板写占位句：生成中是「任务启动中…」，否则是「点击「生成画像」后，此处按时间顺序展示过程」 | 这两句只留在界面上。时间线长度为 0 时点击只提示，不写入剪贴板 |
| 等待回复由 `AgentAwaitingReplyCard` 画在时间线下方，数据在 `awaitingUserReply`。可渲染时展示题头、题干、选项；不可渲染时展示「这项操作需要你处理，当前无法代为回答。」 | 时间线至少有一条时，把当时可见的问题文案单独成段「等待用户回复」。没有这张卡片则整段不出现 |
| 时间线在 `useWorkspace` 的进程内 `agentTimeline`。新任务 `resetTimelineView()` 清空。无磁盘持久化。父会话号在主进程 `AgentRunController.sessionId`，渲染进程没有单独字段；创建成功后有一条 `id === 'sys-session'` 的系统条目，正文为 `已创建 OpenCode session` 换行再加该 id。子代理 id 在 `item.subagent.sessionId` | 父会话号只从这条已有系统条目读取。读不到就省略该行。不新增 IPC |
| 运行中的版本已有通道：`window.ftcs.getAppVersion()` → `app:get-version` → `getAppVersion()` → `app.getVersion()`。设置页与更新检查已在用。`app.getVersion()` 抛错时主进程现网返回 `0.0.0` | 元信息里的版本号调用这一条，不新开通道，也不把文档编写时的号码写死 |
| 诊断详情 `DiagnosticDetails.vue`：`navigator.clipboard.writeText`，失败再放隐藏 `textarea` 并 `document.execCommand('copy')`，按钮文案改成「已复制」约 1.5 秒。线索 JSON 只 `writeText`，失败被吃掉。分享下载链接失败时把链接放进返回文案 | 写入沿用诊断详情的两段式。结果用 `showToast`。按钮文字保持「复制会话」 |
| 输入框占位「自由对话暂未开放…」。点「发送」只把 `composerHint` 设为暂不支持，不产生用户消息 | 不复制输入框草稿，不改变发送行为 |

现网接缝（实现时按本节）：

1. **复制只读快照。** 点击处理函数在第一次 `await` 之前，把 `agentTimeline`、`agentMeta`、`agentSkill`、`agentStatus`、`awaitingUserReply`、`activeProductId` 深拷贝到本次局部变量，并记下 `copiedAt`。之后版本 IPC、超限落盘 IPC 和剪贴板等待期间，时间线可以继续增长，这一份文本仍是点击瞬间的快照。不调用 `resetTimelineView`，不写这些 ref，不改 `agentExpanded`。
2. **父会话号没有渲染进程字段。** 八处任务都在创建 OpenCode session 之后 `addPrefix` 一条 `id: 'sys-session'`，正文固定为两行：`已创建 OpenCode session` 与 session id。会话尚未创建时这条还不在。详设不为此增加 `getSessionId`。
3. **栏上「产品」卡片经常是截断值。** 主进程 `pushState` 里多见 `productId.slice(0, 18)`。渲染进程的 `activeProductId` 是完整 id。元信息里两处都写：卡片按界面原文，「产品标识」用完整 `activeProductId`。
4. **版本 IPC 已经通到渲染进程。** `preload.ts` 的 `getAppVersion` 与 `desktop/src/types/electron.d.ts` 已声明。未超限复制仍只走这条。超限落盘另增一条窄通道 `saveTextToDownloads`（§5.2）。除此之外不为会话号、版本或复制时间再开通道。
5. **空态句不在时间线数据里。** 它们是 `AgentPanel` 模板里 `v-if="!agentTimeline.length"` 的两句。序列化函数不接收 DOM 文本，因此不会把它们写进剪贴板。
6. **等待卡片的点选存在卡片内部。** `selected` / `customTexts` 没有进 `useWorkspace`。复制不读这些未提交的输入。

---

## 1. 两条故事的分工

| 内容 | 归谁 |
|------|------|
| 标题行按钮、一次点击、快照顺序、全文而非预览、空会话提示、成功与失败提示、脱敏、超长落盘与一行路径提示、等待段与未点名块、不改时间线 | **US-CS-01** |
| 同一份文本文首的元信息：应用版本、复制时间，以及 §4 清单里的其余字段和省略规则 | **US-CS-02** |
| 智能体栏放在主区域哪一侧 | 维持现网。本文不加入口以外的布局 |
| 自由发送 | [#118](https://github.com/Pedro-MAFS/ftcs/issues/118)。输入框与「发送」保持现网 |

US-CS-01 可以用一段不含版本断言的正文样例验收顺序、空态和脱敏。US-CS-02 验收文首字段。开发完成后，同一次点击同时满足两节。时间线长度为 0 时两节都不写剪贴板，也不写下载目录。

---

## 2. 详设拍板（docs/38 §7）

**O3 已按马丰顺 2026-11-01 锁定。** O1 已按马丰顺 2026-10-31 反馈定为弱样式 `btn-ghost`。O2、O4～O6 仍是详设默认方案。验收按本表与样例执行。O3 的开发跟改见 #122，待本详设小补丁合入后。

| 项 | 详设默认方案 |
|----|----------------|
| **O1 入口** | 智能体栏**标题行右侧**、技能名之后，一枚弱样式按钮，`class="btn-ghost"`（透明底、无边框、字色 `var(--text-muted)`，悬停为正文色；规则见 §2.1）。可见文字「复制会话」，`aria-label` 为「复制当前会话」。不用 `btn-primary`。一次点击，不放进菜单，不二次确认。时间线为空时按钮仍可见、仍可点，点击走空态提示。任务进行中也可点 |
| **O2 脱敏** | 写入前对**整份已序列化文本**（含元信息、正文、等待段）做密钥类替换，命中段换成固定占位 `[REDACTED]`。覆盖 API Key 标注、`Bearer`、`sk-` 前缀、`key=` 一类赋值，以及本仓库 Places 密钥的 `AIza` 前缀。公司名、邮箱、本机路径原样保留。`keyword=` 不误伤 |
| **O3 超长** | **已锁定。** 按脱敏后的纯文本字符数判断，上限 **`200_000`**（JavaScript 字符串长度，一个 UTF-16 码元算 1，一个汉字算 1）。**`N ≤ 200_000`**：行为不变，脱敏全文只写剪贴板，Toast「已复制会话」。**`N > 200_000`**：脱敏后的**全文**自动写入系统下载目录（`app.getPath('downloads')`），文件名 `ftcs-session-YYYYMMDD-HHmmss.txt`（点击瞬间的本地时间），UTF-8 纯文本，扩展名 `.txt`。不弹系统另存为。Toast（`tone: 'success'`）必须给出绝对路径，文案：`内容过长，已保存全文到 {绝对路径}`。剪贴板**只写一行** `会话过长，全文已保存到：{绝对路径}`（路径取实际写入成功后的路径）。不把截断到 `200_000` 的长文写入剪贴板，不写「已截断，原长 N，保留前 M」。落盘失败：Toast error「保存全文失败：{简短原因}」；剪贴板至多再写一行 `会话过长，全文保存失败`，不降级成截断长文。见 §2.4 |
| **O4 折叠** | 复制该条目持有的全文（`item.body`、`step.body`）。界面上的 160 字 / 80 字预览和「展开全文」状态不影响复制范围。子代理卡片收起时，步骤全文仍进入剪贴板 |
| **O5 未点名块** | 除 `user` / `assistant` / `tool`（含 `tool` 的 `body` 结果）外，纳入 `system`、`reasoning`、`error` 和子代理步骤。时间线至少有一条且存在等待回复卡片时，正文之后单独成段「等待用户回复」，写入当时可见的问题文案。空态占位句永不写入。输入框草稿不写入 |
| **O6 写入失败** | 先 `navigator.clipboard.writeText`。失败则沿用诊断详情：隐藏只读 `textarea` + `document.execCommand('copy')`，并在 `finally` 移除该节点。两段都失败时 Toast「复制失败，剪贴板不可用，请再试一次」，不改时间线。回退成功则与一次成功同一套成功提示 |

常量写死为 `COPY_SESSION_CHAR_LIMIT = 200_000`。用户可见的数字写成十进制 `200000`，不用下划线。

### 2.1 O1 按钮

马丰顺 2026-10-31：复制入口不要太明显的主按钮，需要时能看到即可。

标题行结构：左侧仍是脉冲和「智能体」；右侧一个横排，先技能名，再「复制会话」。控件是该行最右，`flex-shrink: 0`，单行不换行，不收进菜单。技能名过长时省略号截断。340px 栏宽放得下这四个字，因此不改成菜单。

可见文字「复制会话」，`aria-label` 为「复制当前会话」。

样式对照（都是仓内已有写法）后，选用 **`btn-ghost`**：

| 样式 | 现网落点 | 与标题行 |
|------|----------|----------|
| `btn-primary` | 实心强调色。本栏底部「发送」就是 `btn-primary btn-sm` | 主操作权重，本入口不用 |
| `btn-secondary` | 有底色和边框。本栏底部「中止」是 `btn-secondary btn-sm` | 仍是一枚按钮块，标题行上偏重 |
| `text-link-btn` | 强调色加下划线，用在设置页正文链接 | 在以 `text-muted` 为主的标题行上更跳 |
| `btn-accent-ghost` | 强调色浅底、字重 600、高 36px | 比标题行高出一截，且带强调色 |
| **`btn-ghost`** | `WorkflowSchedulePanel.vue` 的 scoped 规则：透明底、无边框、`color: var(--text-muted)`，悬停变为 `var(--text)`，`padding: 4px 6px`，字号 12px | **选用。** 与技能名同为次要文字色，需要时能读到字 |

`btn-ghost` 今天只写在日程面板的 scoped 样式里，`AgentPanel` 加这个 class 不会带上那些规则。实现时把同等规则放进 `desktop/src/styles/main.css` 的 Agent 栏一节，按钮写 `class="btn-ghost"`。标题行上字号用 **11px**，与 `.agent-panel__skill` 对齐；其余保持透明底、无边框、次要文字色、悬停变正文色。不改日程面板的模板。不新增一套实心或强调色按钮。

| 状态 | 按钮 | 点击 |
|------|------|------|
| 时间线至少一条，任务已结束或进行中 | 可见、可点 | 按 §5：未超限写入剪贴板；超限先落盘再写一行路径 |
| 时间线长度为 0（含「任务启动中…」） | 可见、可点，不加 `disabled` | 只 Toast，不调用剪贴板，不落盘 |
| 上一次复制的 Promise 尚未结束 | 仍可见 | 直接返回，不叠第二份 Toast |

按钮文字不改成「已复制」。成功与失败都由 Toast 表达，便于连续再复制一版。

### 2.2 O2 脱敏规则

对序列化之后、计长度之前的整份字符串做替换。不写回 `agentTimeline`。占位符只有 `[REDACTED]`，不留密钥的前四位或后四位。

按下列顺序各做一次全局替换。先处理带标签的形式，避免 `api_key=sk-…` 被拆成两段。

| 顺序 | 形态 | 判定 | 替换 |
|------|------|------|------|
| 1 | Bearer | 不区分大小写的 `Bearer`，后接空白，再接至少 8 位 `[A-Za-z0-9._~+/=-]` | 整段换成 `Bearer [REDACTED]` |
| 2 | 带标签的密钥 | 名称是 `x-api-key`、`apikey`、`api key`、`api_key`、`api-key`，或独立单词 `key`（左侧不能是字母、数字或 `_`，故 `keyword` 不中）。后接可选空白、`:` 或 `=`、可选空白、可选引号，再接至少 8 位非空白且非引号、非 `&` 的值。匹配到成对引号时把引号一并吃掉 | 保留名称和分隔符，值换成 `[REDACTED]`。例：`api_key=[REDACTED]`、`api-key: [REDACTED]` |
| 3 | `sk-` | 不区分大小写，单词边界后的 `sk-` 再加至少 8 位 `[A-Za-z0-9_-]` | 整段换成 `[REDACTED]` |
| 4 | `AIza` | 单词边界后的 `AIza` 再加至少 20 位 `[0-9A-Za-z_-]` | 整段换成 `[REDACTED]` |

名称匹配不区分大小写。`token=`、普通句子里的「密钥」二字、短于上述长度的片段，本刀不替换。

明确保留：

| 内容 | 处理 |
|------|------|
| 客户公司名 | 原样 |
| 邮箱 | 原样 |
| 本机路径（`D:\…`、`/home/…` 等） | 原样 |
| `keyword=` 以及其它只是以 `key` 结尾的单词 | 原样 |

### 2.3 O2 验收样例（脱敏）

工具结果在点击前含有下面这段。复制后的对应段落必须与右列一致，且全文不再出现左列里的密钥串。

| 点击前 | 剪贴板中 |
|--------|----------|
| `Authorization: Bearer sk-test-FAKEKEY123456` | `Authorization: Bearer [REDACTED]` |
| `api_key=sk-live-abcdef123456` | `api_key=[REDACTED]` |
| `api-key: "sk-proj-ABCDEFGH1234"` | `api-key: [REDACTED]` |
| `key=AIzaSyDummyKey0123456789abcd` | `key=[REDACTED]` |
| 单独一行 `sk-ant-api03-FAKEKEY1234567890` | `[REDACTED]` |
| 单独一行 `AIzaSyDummyKey0123456789abcd` | `[REDACTED]` |
| `公司：绿森塑木` | `公司：绿森塑木` |
| `邮箱：sales@example.com` | `邮箱：sales@example.com` |
| `路径：D:\FTCS_WORKSPACE\products` | `路径：D:\FTCS_WORKSPACE\products` |
| `keyword=wpc decking` | `keyword=wpc decking` |

### 2.4 O3 超长与落盘

马丰顺 2026-11-01 锁定。上限仍是 `COPY_SESSION_CHAR_LIMIT = 200_000`。先得到脱敏后的完整文本 `T`，`N = T.length`。`T` 不含截断说明，也不含路径提示。超限不对 `T` 做 `slice`，不把截断到 20 万的长文写入剪贴板。

1. **`N ≤ 200_000`**：行为不变。只把 `T` 写入剪贴板。不写文件，不调用 `saveTextToDownloads`。不出现「已截断」，也不出现「全文已保存」。Toast：「已复制会话」（`tone: 'success'`）。
2. **`N > 200_000`**：先落盘全文，再让剪贴板只留一行。
   1. 文件名用点击瞬间的本地时间 `copiedAt`：`ftcs-session-YYYYMMDD-HHmmss.txt`。年月日与时分秒都补零，中间一个连字符，扩展名固定 `.txt`。例：`ftcs-session-20261101-153045.txt`。与元信息「复制时间」同一时刻；文件名不含空格、冒号和时区。
   2. 渲染进程 `await window.ftcs.saveTextToDownloads({ suggestedName, content: T })`。主进程把 `T` 以 UTF-8（无 BOM）写入 `path.join(app.getPath('downloads'), suggestedName)`。不调用 `dialog.showSaveDialog`，不让用户改目录或文件名。同名则在扩展名之前的 stem 后加 `-1`、`-2`…，直到不覆盖已有文件。成功返回的 `path` 是实际绝对路径（发生改名时用带后缀的那条）。
   3. 落盘成功：剪贴板**只**写入一行 `会话过长，全文已保存到：{绝对路径}`。这一行不是 `T` 的节选，不含元信息、不含正文、不含 `已截断，原长 N，保留前 M`。路径用主进程返回值。Toast：`内容过长，已保存全文到 {绝对路径}`（`tone: 'success'`）。这一行写不进剪贴板时，Toast 仍用这条成功文案，剪贴板保持点击前的内容。
   4. 落盘失败：Toast error「保存全文失败：{简短原因}」。再尝试把一行 `会话过长，全文保存失败` 写入剪贴板。这一行没有绝对路径，也没有截断长文。这一行也失败则剪贴板保持点击前的内容。不再弹出第二条 O6（落盘原因已经在 Toast 里）。不降级成「保留前 200000 字」。
3. 时间线界面仍显示全文。落盘和剪贴板都不写回 `agentTimeline`。
4. 用户取消另存为不适用。本期没有对话框，因此没有 `canceled`。

| 脱敏后 | 下载目录 | 剪贴板 | Toast |
|--------|----------|--------|-------|
| `N = 250400`，落盘成功。例：实际路径 `D:\Users\me\Downloads\ftcs-session-20261101-153045.txt` | 该文件存在。内容等于 `T`，长度 250400，UTF-8 纯文本。无截断行、无路径行 | 恰好一行：`会话过长，全文已保存到：D:\Users\me\Downloads\ftcs-session-20261101-153045.txt` | `内容过长，已保存全文到 D:\Users\me\Downloads\ftcs-session-20261101-153045.txt`，`tone: 'success'` |
| `N = 200000` | 不新增文件 | 全文 `T`。无截断行、无路径行 | 「已复制会话」 |
| `N = 200001`，落盘成功 | 全文文件，长度 200001 | 一行路径提示。不是长度 200000 的截断稿 | 成功文案含该文件绝对路径 |
| 同名文件已存在 | stem 后为 `-1`、`-2`…，不覆盖原文件。例：`ftcs-session-20261101-153045-1.txt` | 行内路径与实际文件一致 | 文案中的路径与实际文件一致 |
| 下载目录写入失败 | 不把失败结果当成已保存。本次新建的半截文件删掉 | 一行 `会话过长，全文保存失败`；该行也失败则保持点击前 | `保存全文失败：{简短原因}`，`tone: 'error'` |

路径样例只说明绝对路径要原样出现。验收以本机 `app.getPath('downloads')` 拼出的实际路径为准。用户可见的上限写成十进制 `200000`，不用下划线。

### 2.5 O4 与 O5 样例

折叠：一条 `user` 的 `body` 为 200 个 `A` 再加 `ENDMARK`，界面处于收起。界面预览是前 160 字加 `…`。未超限时，剪贴板里的该条目含有 `ENDMARK`，并且不使用预览函数追加的那个省略号。超限时，`ENDMARK` 在下载文件的 `T` 里，剪贴板只有路径一行。子代理步骤用 100 字以上的 `step.body` 加另一个 `ENDMARK`，卡片处于收起，`T` 仍含该 `ENDMARK`。

等待卡片（写在 `T` 里；未超限时 `T` 就是剪贴板，超限时 `T` 是下载文件）：

| 卡片 | `T` 中的等待段 |
|------|----------------|
| `renderable === true` | 每题一段：`### {header}`、题干、每个选项一行。有 `description` 时写成 `- {label}：{description}`，否则 `- {label}`。`custom` 不为 `false` 时追加一行 `- 输入自己的答案`。不写用户尚未提交的点选和自填 |
| `renderable === false` | 段标题仍是「等待用户回复」，正文只有「这项操作需要你处理，当前无法代为回答。」 |
| `awaitingUserReply === null` | 没有「等待用户回复」这一段 |
| 时间线长度为 0 | 即使异常地还有等待卡片，也不写剪贴板、不落盘，走空态 Toast |

空态占位句「点击「生成画像」后，此处按时间顺序展示过程」和「任务启动中…」不进入 `T`，因此不会出现在剪贴板或下载文件里。输入框里的 `agentPrompt` 不出现。

### 2.6 O6 与空会话样例

| 步骤 | 剪贴板 | 界面 | Toast |
|------|--------|------|-------|
| 未超限，`writeText` 成功 | 全文 `T` | 时间线与折叠与点击前一致 | 「已复制会话」，`tone: 'success'` |
| 未超限，`writeText` 抛错，隐藏文本框 `execCommand('copy')` 返回 `true` | 全文 `T` | 同上。临时 `textarea` 已从文档移除 | 「已复制会话」，`tone: 'success'` |
| 未超限，两段都失败 | 保持失败前的内容 | 时间线条目、正文、折叠与点击前一致 | 「复制失败，剪贴板不可用，请再试一次」，`tone: 'error'` |
| 超限，落盘成功 | 一行 `会话过长，全文已保存到：{绝对路径}` | 同上。下载目录多一个全文 `.txt` | `内容过长，已保存全文到 {绝对路径}`，`tone: 'success'` |
| 超限，落盘失败 | 一行 `会话过长，全文保存失败`，或保持点击前 | 时间线不变。不出现截断长文 | `保存全文失败：{简短原因}`，`tone: 'error'` |
| `agentTimeline.length === 0` | 不调用写入，内容保持点击前。不写下载目录 | 占位句仍在面板上 | 「当前没有可复制的会话」（默认 `info`） |

空会话不写一份只有元信息的文本。

### 2.7 确认状态

O1、O3 已锁定。O3 待本详设小补丁合入后，由开发按第 3 点跟改 #122。O2、O4、O5、O6 与第 8 点仍是详设默认方案。

1. **O1 已按 2026-10-31 反馈改定**：标题行最右侧弱样式 `btn-ghost`「复制会话」，一次点击，不进菜单；空会话仍可点，只提示、不写剪贴板。不用 `btn-primary`。
2. 默认只脱敏 §2.2 的密钥类，占位 `[REDACTED]`；公司名、邮箱、路径原样。`token=` 本刀不纳入。
3. **O3 已按马丰顺 2026-11-01 锁定**：上限写死 `200_000` 字符。`N ≤ 200_000` 时脱敏全文只进剪贴板，Toast「已复制会话」。`N > 200_000` 时全文自动写入系统下载目录（不弹另存为），Toast 给出绝对路径 `内容过长，已保存全文到 {绝对路径}`；剪贴板只留一行 `会话过长，全文已保存到：{绝对路径}`。不把截断长文写入剪贴板，不写「已截断，原长 N，保留前 M」。落盘失败 Toast error「保存全文失败：{简短原因}」，剪贴板至多一行 `会话过长，全文保存失败`。
4. 复制内存全文，折叠与 160/80 字预览不缩小范围。
5. 纳入 `system`、`reasoning`、`error`、子代理步骤；有时间线条目时把等待卡片的可见问题文案单独成段；空态句与输入框草稿不写入。
6. 未超限时，剪贴板失败沿用诊断详情的隐藏文本框回退；仍失败则 Toast「复制失败，剪贴板不可用，请再试一次」，且不改时间线。超限落盘失败的 Toast 以 §2.4 为准，不用这条文案覆盖落盘原因。
7. 除 §5.2 这条落盘通道外不新增 IPC。父会话号只从 `sys-session` 条目读取，没有这条就省略「会话」行。
8. 复制时间用点击瞬间的本地时间 `YYYY-MM-DD HH:mm:ss ±HH:mm`。下载文件名用同一时刻的 `YYYYMMDD-HHmmss`。

---

## 3. 复制文本格式

未超限时，下面这一整份就是剪贴板内容。超限时，下面这一整份（脱敏后、不截断、不含路径行）写入下载目录的 `.txt`；剪贴板不是这一整份，而是 §2.4 的一行。

整份是纯文本，用 Markdown 标题分节，方便贴到聊天或 Issue。不用代码围栏包裹正文，避免正文里的反引号把围栏截断。顺序固定为：

1. 一级标题 `# FTCS 智能体会话`
2. `## 元信息` 与 §4 的列表
3. `## 会话正文` 与按时间线顺序编号的条目
4. 有等待卡片时才有 `## 等待用户回复`

条目之间空一行。正文内部换行原样保留。

非子代理条目：

```
### {n}. {种类} · {标题} · {时间}
状态：{进行中|完成|失败}
{body 全文}
```

种类与界面徽章一致：`user`→你，`system`→系统，`assistant`→回复，`reasoning`→思考，`tool`→工具，`error`→错误。标题或时间为空则省掉对应的 ` · ` 段。`status` 缺省则不写「状态」行。`running` / `done` / `error` 写成进行中 / 完成 / 失败。

带 `subagent` 的条目用「子代理」，不用原 `kind` 当徽章（与界面一致）。标题用 `subagent.description`，空则用 `item.title`。摘要两行与界面函数 `subagentStatus`、`subagentCurrent` 相同，然后是子会话、条目状态、全部步骤、以及非空的 `item.body`：

```
### {n}. 子代理 · {描述} · {时间}
{subagentStatus}
{subagentCurrent}
子会话：{subagent.sessionId}
状态：{进行中|完成|失败}

#### 步骤 {i}. {种类} · {步骤标题}
状态：{进行中|完成|失败}
{step.body 全文}

#### 结果
{item.body 全文}
```

`sessionId` 为空则不写「子会话」行。`item.body` 为空则不写「结果」。步骤种类同样是工具 / 思考 / 错误。步骤即使界面收起也全部写出。

等待段见 §2.5。多题按 `questions` 数组顺序各写一块。

### 3.1 完整样例

下面是未超限时一次点击之后的剪贴板全文，也是超限时写入下载目录的文件正文（文件里同样没有路径行，没有「已截断」行）。工具正文在点击前含有 `Bearer sk-test-FAKEKEY123456`、`api_key=sk-live-abcdef123456` 和 `sk-ant-api03-FAKEKEY1234567890`，样例中已经替换。版本号 `0.6.1` 只是举例，验收时等于当时 `getAppVersion()` 的返回值。

```
# FTCS 智能体会话

## 元信息
- 应用版本：0.6.1
- 复制时间：2026-10-31 09:41:05 +08:00
- 技能：关键词扩展（expand-keywords）
- 运行状态：任务在等你回复
- 产品标识：prod_20261031_greenwood
- 会话：ses_demo_expand_001
- 栏上状态：状态=扩展中；产品=prod_20261031_gree；耗时=01:02；来源=画像
- 错误条数：1
- 最近错误：错误 · 搜索超时

## 会话正文

### 1. 系统 · 系统 · 09:40:01
准备为 prod_20261031_greenwood（绿森塑木）扩展关键词 · 按标准档 R1 目标 20

### 2. 你 · 你的指令 · 新建探索任务 · 09:40:02
请为绿森塑木扩展户外地板关键词。联系邮箱 sales@example.com。资料在 D:\FTCS_WORKSPACE\products。

### 3. 系统 · 会话 · 09:40:03
已创建 OpenCode session
ses_demo_expand_001

### 4. 思考 · 思考 · 09:40:10
先看画像里的户外地板，再扩展英文检索词。

### 5. 工具 · search_web · 09:40:12
状态：完成
请求头 Authorization: Bearer [REDACTED]
api_key=[REDACTED]
另外一行裸密钥 [REDACTED]
公司：绿森塑木
邮箱：sales@example.com
路径：D:\FTCS_WORKSPACE\products
keyword=wpc decking

### 6. 错误 · 搜索超时 · 09:40:13
search_web 在 30 秒内没有返回。

### 7. 回复 · 回复 · 09:40:20
关键词扩展做到一半，需要你确认要不要把「围栏」算进去。

### 8. 子代理 · 检索英文站 · 09:40:30
Research · 进行中
↳ 正在看官网
子会话：ses_demo_child_001
状态：进行中

#### 步骤 1. 工具 · fetch_page
状态：完成
页面提到 sales@example.com，密钥字段是 api_key=[REDACTED]。

#### 步骤 2. 思考 · 归纳
围栏和地板可以分成两组词。

## 等待用户回复

### 确认范围
这次扩展要不要包含围栏？
- 只要地板
- 地板和围栏：围栏套件一并出词
- 输入自己的答案
```

样例里「产品标识」是完整 id，`栏上状态` 的产品值是界面卡片上的前 18 字 `prod_20261031_gree`。两者同时存在是预期结果。`运行状态` 取等待文案，因为 `awaitingUserReply` 有值；卡片上的「状态=扩展中」仍按界面原文写入。

---

## 4. 元信息字段清单（US-CS-02）

只在时间线至少有一条、并且即将生成 `T` 时生成。列表顺序固定。未超限时 `T` 进入剪贴板。超限时 `T` 进入下载目录的文件，剪贴板不再带这份列表。

| 行 | 来源 | 取不到时 |
|----|------|----------|
| 应用版本 | `await window.ftcs.getAppVersion()`。主进程即 `app.getVersion()`。返回的 `0.0.0` 是现网在 `getVersion()` 抛错时的回退，照实写入 | 调用抛错、函数不存在或返回空串：写 `应用版本：未能读取`。不改用 `package.json` 里的号码，不中断本次复制 |
| 复制时间 | 点击瞬间的本地时间，格式 `YYYY-MM-DD HH:mm:ss ±HH:mm`（24 小时，偏移来自 `Date.getTimezoneOffset()`，东八区写作 `+08:00`） | 渲染进程总能构造。不改用 UTC 的 `toISOString()` |
| 技能 | `AgentPanel` 的 `SKILL_LABELS` 与当前 `agentSkill`。写成 `关键词扩展（expand-keywords）` 这种「中文名（id）」 | id 不在表内时中文名用现网兜底「任务」，括号里仍是原始 id。该行始终写 |
| 运行状态 | 与输入区状态句同一优先级：有 `awaitingUserReply` 则为「任务在等你回复」；否则 `running`→运行中，`done`→完成，`error`→异常，`idle`→空闲 | 该行始终写 |
| 产品标识 | `useWorkspace` 的 `activeProductId` 全文 | 空串则整行省略 |
| 会话 | 快照里 `id === 'sys-session'` 的条目。正文第一行去空白后等于 `已创建 OpenCode session`，第二行去空白后非空，则第二行是会话号。多条时用时间线上的最后一条 | 没有符合条件的条目则整行省略。不从其它正文里猜测 session，不新增 IPC |
| 栏上状态 | `agentMeta` 按数组顺序，`标签=值`，用中文分号 `；` 连成一行 | `agentMeta` 为空则整行省略。值用卡片上已有的字符串（含截断后的产品 id），不把截断值补全 |
| 错误条数 | 见下方计数。包含 `0` | 该行始终写，以便和「忘记统计」区分 |
| 最近错误 | 计数大于 0 时，按下方行走顺序的最后一条，写成 `{种类} · {标题}`。标题为空则写 `{种类} · （无标题）` | 计数为 0 则整行省略。不把错误正文再贴进元信息 |
| 截断说明 | **本期不写** | 元信息和落盘全文都没有「已截断，原长 N，保留前 M」。超限不再砍 `T` 的尾部 |
| 全文已保存 | **不写入 `T`，也不作为元信息行**。仅 `N > 200_000` 且落盘成功时，剪贴板整份改为一行 `会话过长，全文已保存到：{绝对路径}`，Toast 为 `内容过长，已保存全文到 {绝对路径}`。路径取主进程返回的实际绝对路径 | 未超限：剪贴板是 `T`，没有这一行。落盘失败：没有「全文已保存」；剪贴板至多一行 `会话过长，全文保存失败` |

当前 `SKILL_LABELS`（复制须与 `AgentPanel.vue` 同一张表）：画像生成 `extract-product-profile`、关键词扩展 `expand-keywords`、全网搜索 `discover-leads`、社媒发现 `discover-leads-r2`、地图发现 `discover-leads-r3`、评分去重 `score-and-dedupe`、补全联系人 `enrich-lead-contacts`、起草开发信 `draft-outreach-email`、翻译对照 `translate-outreach-email`、空闲 `idle`。

错误计数与「最近一条」的行走顺序：按 `agentTimeline` 从头到尾；每个条目先看条目自身，再按 `subagent.steps` 数组顺序看步骤。条目或步骤在 `kind === 'error'` 或 `status === 'error'` 时计 1。因此一张 `status === 'error'` 的工具卡和它里面的错误步骤会分别计数。样例 §3.1 只有第 6 条是错误，条数为 1，最近错误指向它。

脱敏在整份文本拼好之后进行，所以元信息里的值若含密钥，同样变成 `[REDACTED]`。会话号先按上表从原文取出，再随整份文本过同一套替换。

---

## 5. 界面与调用链

```mermaid
sequenceDiagram
  participant User as 用户
  participant Panel as AgentPanel
  participant Build as buildCopySessionText
  participant Main as 主进程落盘
  participant Clip as 剪贴板
  participant Toast as showToast

  User->>Panel: 点击「复制会话」
  Panel->>Panel: 同步深拷贝时间线与元信息
  alt 时间线没有条目
    Panel->>Toast: 当前没有可复制的会话
  else 有条目
    Panel->>Panel: 已有 getAppVersion
    Panel->>Build: 元信息在前，再拼正文
    Build->>Build: 脱敏得到 T，N 等于 T.length
    alt N 不超过 200000
      Panel->>Clip: writeText 全文 T，失败则隐藏 textarea
      alt 写入成功
        Panel->>Toast: 已复制会话
      else 两段都失败
        Panel->>Toast: 复制失败，剪贴板不可用，请再试一次
      end
    else N 超过 200000
      Panel->>Main: saveTextToDownloads 全文 T
      alt 落盘成功
        Main-->>Panel: 绝对路径
        Panel->>Clip: 只写一行路径提示
        Panel->>Toast: 内容过长，已保存全文到绝对路径
      else 落盘失败
        Panel->>Clip: 一行「会话过长，全文保存失败」
        Panel->>Toast: 保存全文失败，附简短原因
      end
    end
  end
```

### 5.1 挂在哪个组件

按钮加在 `desktop/src/components/layout/AgentPanel.vue` 的 `.agent-panel__head`，`class="btn-ghost"`，规则见 §2.1。样式加在 `desktop/src/styles/main.css` 的 Agent panel 一节：右侧容器横向排列、间距 8、按钮不收缩。

纯函数已在 `desktop/src/components/layout/copy-agent-session.ts`（#122 合入的是截断写剪贴板）。跟改时 `buildCopySessionText` 不再调用 `applyCopyLimit`：脱敏后的 `T` 原样返回，去掉 `truncated` 与 `COPY_TRUNCATED`。单测 `copy-agent-session.test.ts` 改为覆盖 §2 的脱敏表、`ENDMARK` 全文、空数组不产出占位句、`N = 200001` 时全文不被 `slice` 且不含「已截断」，以及 `sys-session` 省略。超限的文件名、同名后缀和「剪贴板只有一行」放在点击处理或主进程落盘的测试里。纯函数不调用 `fs` 或 `navigator`。本文不改这些文件。

`AgentPanel` 负责快照、空态、版本、Toast、剪贴板，以及超限时调用落盘。`CopySessionRuntime` 增加 `saveTextToDownloads`，由 `AgentPanel` 接到 `window.ftcs.saveTextToDownloads`。序列化函数不调用 `navigator`，不读 DOM，也不写磁盘。

### 5.2 主进程

**除本条落盘通道外不新增 IPC。** 不为父会话号、版本或复制时间新增通道。不复用线索导出的 `exportLeadsCsv` / `saveCsvWithDialog`（那条会 `dialog.showSaveDialog`，用户可以取消或自选路径）。本期没有对话框，也没有 `canceled`。

| 通道 | 本期用法 |
|------|----------|
| `app:get-version`（`window.ftcs.getAppVersion`） | 元信息「应用版本」。已有，不改语义 |
| `app:save-text-to-downloads`（`window.ftcs.saveTextToDownloads`） | **新增。** 仅 `N > 200_000` 时调用。把脱敏全文写入系统下载目录 |

渲染进程：

```ts
saveTextToDownloads(input: {
  suggestedName: string
  content: string
}): Promise<{ ok: true; path: string } | { ok: false; error: string }>
```

主进程 `ipcMain.handle`：

1. `suggestedName` 必须是单个文件名：非空；`path.basename(suggestedName) === suggestedName`；不含 `/`、`\`；不是 `.` 或 `..`；不含 `..`；以字面量 `.txt` 结尾。否则 `{ ok: false, error: '文件名无效' }`。不接受调用方传入的目录或绝对路径。主进程不把名字放宽成用户选的路径。
2. `content` 必须是字符串。超限分支传入完整 `T`。主进程不再按 `200_000` 截断，也不分片。
3. `dir = app.getPath('downloads')`。候选路径 `path.join(dir, suggestedName)`。若该路径已存在，在 stem 后追加 `-1`、`-2`…（`ftcs-session-20261101-153045-1.txt`）直到 `wx` 可以独占创建。不覆盖已有文件。
4. `fs.promises.writeFile(target, content, { encoding: 'utf8', flag: 'wx' })`，无 BOM。成功返回 `{ ok: true, path: target }`，`path` 为绝对路径。
5. `wx` 因已存在而失败时换下一个后缀再试，不删除那个已存在的文件。其它 IO 异常：若本次 `wx` 已经创建出目标文件，删掉这次的文件再返回 `{ ok: false, error }`。`error` 取 `Error.message` 的第一行，超过 120 个字符则保留前 120 个。不要栈。不弹对话框。

登记（仓内惯例：通道常量进 `IPC`，入参与结果类型跟在 `ipc/types.ts` 里导出，preload 与 `electron.d.ts` 同时声明）：

- `desktop/electron/ipc/types.ts`：`IPC.APP_SAVE_TEXT_TO_DOWNLOADS = 'app:save-text-to-downloads'`，并导出 `SaveTextToDownloadsInput`、`SaveTextToDownloadsResult`。结果用上面的判别联合，成功带 `path`，失败带 `error`。
- `desktop/electron/preload.ts`：在暴露给 `window.ftcs` 的对象上增加 `saveTextToDownloads`，内部 `ipcRenderer.invoke(IPC.APP_SAVE_TEXT_TO_DOWNLOADS, input)`。
- `desktop/src/types/electron.d.ts`：`ftcs.saveTextToDownloads` 与该签名一致。
- `desktop/electron/main.ts`：`ipcMain.handle(IPC.APP_SAVE_TEXT_TO_DOWNLOADS, …)`。

时间线、技能、状态、栏上卡片、等待卡片、产品 id 都已经在渲染进程。父会话号从快照里的 `sys-session` 正文读取。复制时间用渲染进程的 `Date`。文件名时钟与该 `copiedAt` 相同。

### 5.3 点击处理

#122 现网在 `createCopySessionController` 里对 `buildCopySessionText` 的结果直接 `writeClipboard`，超限走 `COPY_TRUNCATED`（「已复制（内容过长已截断）」）和 `applyCopyLimit`。跟改时删掉这条超限路径。

```ts
const COPY_EMPTY = '当前没有可复制的会话'
const COPY_OK = '已复制会话'
const COPY_FAIL = '复制失败，剪贴板不可用，请再试一次'
const COPY_SESSION_CHAR_LIMIT = 200_000
const CLIP_SAVE_FAIL = '会话过长，全文保存失败'

function copySavedToast(absPath: string): string {
  return `内容过长，已保存全文到 ${absPath}`
}

function copySaveFailToast(reason: string): string {
  return `保存全文失败：${reason}`
}

function clipSavedLine(absPath: string): string {
  return `会话过长，全文已保存到：${absPath}`
}

function formatSessionDownloadName(copiedAt: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  const y = copiedAt.getFullYear()
  const m = pad(copiedAt.getMonth() + 1)
  const d = pad(copiedAt.getDate())
  const hh = pad(copiedAt.getHours())
  const mm = pad(copiedAt.getMinutes())
  const ss = pad(copiedAt.getSeconds())
  return `ftcs-session-${y}${m}${d}-${hh}${mm}${ss}.txt`
}
```

1. `copying` 为真则返回。
2. 同步深拷贝 §0 所列字段，`copiedAt = new Date()`。
3. `items.length === 0`：`showToast(COPY_EMPTY)`，返回。不取版本，不写剪贴板，不落盘。
4. `copying = true`。
5. `try` 取版本：成功则用返回字符串；抛错或空串则交给 §4 写成「未能读取」。
6. `buildCopySessionText`：拼文本 → `redactSecrets`，得到 `T`。不截断。`N = T.length`。
7. `N ≤ COPY_SESSION_CHAR_LIMIT`：`writeClipboard(T)`。成功：`showToast(COPY_OK, { tone: 'success' })`。失败：`showToast(COPY_FAIL, { tone: 'error' })`。不调用落盘。
8. `N > COPY_SESSION_CHAR_LIMIT`：先 `await saveTextToDownloads({ suggestedName: formatSessionDownloadName(copiedAt), content: T })`。
   - `ok: true`：再 `writeClipboard(clipSavedLine(path))`，只这一行。无论这一行是否写上，`showToast(copySavedToast(path), { tone: 'success' })`。不写入 `T`，不 `slice(0, 200_000)`。
   - `ok: false`：`showToast(copySaveFailToast(error), { tone: 'error' })`。再尝试 `writeClipboard(CLIP_SAVE_FAIL)`。该行失败则停止。不写截断长文，不用 `COPY_FAIL` 盖住落盘原因。
9. `writeClipboard` 仍是两段式：先 `navigator.clipboard.writeText(text)`。捕获到异常后创建 `textarea`，`readonly`，`position: fixed; left: -9999px`，`select()`，再 `document.execCommand('copy')`。`finally` 移除节点。返回布尔。超限时传入的 `text` 是上面那一行，不是 `T`。
10. Toast 停留时间用 `TOAST_DEFAULT_MS`（现网 5000）。`finally` 把 `copying` 置回假。

不把全文打到 `console`。不调用任何上传或上报接口。

---

## 6. 验收清单

### 6.1 US-CS-01

- [ ] 智能体栏标题行右侧、技能名之后有「复制会话」，`class` 为 `btn-ghost`（透明底、无边框、次要文字色），`aria-label` 为「复制当前会话」。没有 `btn-primary`。不在菜单里。栏仍在主区域右侧。空会话时该按钮仍可见、可点。
- [ ] 时间线含用户消息、回复、工具及结果时，`T` 中的对应内容顺序与 `agentTimeline` 一致，且含 `system`、`reasoning`、`error`。未超限时 `T` 在剪贴板；超限落盘成功时 `T` 在下载文件。
- [ ] 收起的用户消息在 `T` 中仍含 `ENDMARK` 全文；收起的子代理步骤仍含步骤全文。复制前后折叠状态相同。
- [ ] 任务进行中点击：`T` 是点击瞬间的快照；之后新到的条目不进入这一份文本。任务继续运行。
- [ ] §2.3 的假密钥在 `T` 中不可见，公司名、邮箱、路径、`keyword=` 仍在。超限时剪贴板那一行也不含这些密钥。
- [ ] 未超限（`N ≤ 200000`）时 Toast「已复制会话」，剪贴板为脱敏全文，下载目录不因这次点击新增文件。
- [ ] `N > 200000` 时：系统下载目录有全文文件，内容等于脱敏后的 `T`（UTF-8、无 BOM，长度等于 `N`，无「已截断」行，无路径行）；文件名形如 `ftcs-session-YYYYMMDD-HHmmss.txt`，同名加 `-1` / `-2` 且不覆盖。Toast 为 `内容过长，已保存全文到 {绝对路径}`（`tone: 'success'`），其中的路径就是该文件。剪贴板恰好一行 `会话过长，全文已保存到：{同一绝对路径}`，不是截断到 200000 的长文。界面时间线仍是全文。不出现系统另存为。
- [ ] 下载目录写入失败时 Toast「保存全文失败：{简短原因}」（`tone: 'error'`）。剪贴板没有截断长文；至多一行 `会话过长，全文保存失败`。时间线不变。
- [ ] 有等待卡片且时间线非空时，`T` 文末有「等待用户回复」和当时可见的题头、题干、选项。未提交的自填不在其中。没有卡片时没有这一段。
- [ ] 时间线为空时 Toast「当前没有可复制的会话」，剪贴板保持点击前的内容，不写下载目录，占位句不在剪贴板中。按钮仍然可见。
- [ ] 未超限、两段写入都失败时 Toast「复制失败，剪贴板不可用，请再试一次」，时间线不变。回退成功时与直接成功同一文案。超限落盘失败不用这条文案覆盖「保存全文失败」。
- [ ] 输入框草稿未被复制。「发送」仍只提示暂不支持自由发送。
- [ ] 没有自动上报或上传。

### 6.2 US-CS-02

- [ ] 未超限时，同一次成功复制的剪贴板文首有「应用版本」和「复制时间」。超限落盘成功时，这两行在下载文件的 `T` 文首，不在剪贴板那一行里。版本等于当时 `getAppVersion()` 的返回值（含现网回退 `0.0.0`）。时间形如 `2026-10-31 09:41:05 +08:00`，是点击瞬间的本地时区。
- [ ] `T` 有技能行、运行状态行、错误条数。`agentMeta` 非空时有一条「栏上状态」，顺序与卡片一致。
- [ ] `activeProductId` 非空时，`T` 有完整「产品标识」。与卡片上截断的产品值可以不同。
- [ ] 存在符合 §4 的 `sys-session` 时，`T` 有「会话」行，值是该条目第二行。会话尚未写出这条时，没有「会话」行，也不出现自造的 id。
- [ ] 错误条数大于 0 时，`T` 有「最近错误」，指向行走顺序的最后一条。为 0 时没有该行，条数行仍是 `0`。
- [ ] `T` 里元信息在「会话正文」之前。空会话不写入只有元信息的文本，也不写下载文件。超限成功时剪贴板没有这份元信息列表。
- [ ] 未超限时，这次点击参与的 IPC 仍只有既有的 `app:get-version`。超限时除此以外只多 `app:save-text-to-downloads`。没有新的会话读取通道。没有另存为对话框。
- [ ] 变更落在 `dev-0.6.1` 系分支。不关 #117。

---

## 7. 不做

| 项 | 说明 |
|----|------|
| 自动上报或上传服务器 | CS6 |
| 改变会话存储、时间线种类、顺序、折叠、推送 | CS7。复制失败也不改这些 |
| 历史会话列表，或重启后找回已清空的时间线 | 现网只在进程内存中 |
| 开放自由对话、改变「发送」 | [#118](https://github.com/Pedro-MAFS/ftcs/issues/118) |
| 搬动智能体栏或改栏宽 | CS1 |
| 为父会话号、版本或复制时间新增 IPC | 除 §5.2 落盘通道外不新增 |
| 弹系统另存为，或让用户自选保存路径 | **本刀定案。** 超限只写 `app.getPath('downloads')`。固定目录以外的路径选择 Out。不复用 `exportLeadsCsv` 的另存为 |
| 超限时把截断到 `200_000` 的长文写入剪贴板，或写入「已截断，原长 N，保留前 M」 | 马丰顺 2026-11-01 已否。剪贴板只留一行路径提示，或落盘失败时一行「会话过长，全文保存失败」 |
| 落盘失败时降级成截断长文 | 同上。失败 Toast 说明原因，不改写成长文截断 |
| 脱敏公司名、邮箱、本机路径；纳入 `token=` | §2.2。若要扩大脱敏，另开一刀 |
| 复制输入框未发送草稿，或等待卡片上未提交的点选 | §2.5 |
| 把空态占位句写入剪贴板 | CS3 |
| 合入 `main`、打 tag、发版、关闭 #117 | CS8。PR 关联写法为 Related #117 |

---

## 8. 修订记录

| 日期 | 说明 |
|------|------|
| 2026-10-31 | 初稿。拍板 docs/38 §7 O1～O6 的详设默认方案：标题行主按钮「复制会话」；密钥类替换为 `[REDACTED]`，公司名、邮箱、路径原样；上限 `200_000` 字符，超限写明文首说明并改成功提示；复制内存全文；纳入 system、reasoning、error、子代理步骤和等待卡片。元信息含运行中版本与本地复制时间。沿用诊断详情的剪贴板回退，失败 Toast，不新增 IPC。待马丰顺确认后放行开发。覆盖 US-CS-01、US-CS-02。Related #117。 |
| 2026-10-31 | 按马丰顺反馈改 O1：复制入口不用 `btn-primary`，改为弱样式 `btn-ghost`（透明底、无边框、次要文字色）。位置仍在标题行右侧、技能名之后；空会话仍可见可点。一次点击，不收进菜单。O2～O6 不变。 |
| 2026-11-01 | 马丰顺锁定 O3，替换 10-31 详设里的「超限截断进剪贴板」。`N ≤ 200000` 仍是脱敏全文只进剪贴板，Toast「已复制会话」。`N > 200000`：脱敏全文自动写入 `app.getPath('downloads')`，文件名 `ftcs-session-YYYYMMDD-HHmmss.txt`（本地时间，UTF-8，无 BOM，同名 stem 加 `-1`/`-2`，不覆盖），不弹另存为。Toast：`内容过长，已保存全文到 {绝对路径}`。剪贴板只留一行 `会话过长，全文已保存到：{绝对路径}`，不再写入截断到 20 万的长文，也不再写「已截断，原长 N，保留前 M」。落盘失败 Toast「保存全文失败：{简短原因}」，剪贴板至多一行 `会话过长，全文保存失败`，不降级截断长文。为此新增窄 IPC `saveTextToDownloads`（`app:save-text-to-downloads`）；除此之外不新增 IPC。#122 已合入的 `applyCopyLimit` / `COPY_TRUNCATED` 待本小补丁合入后由开发跟改。Related #117。 |
