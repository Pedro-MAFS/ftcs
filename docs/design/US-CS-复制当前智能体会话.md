# US-CS 详细设计：复制当前智能体会话

> **用户故事**：[../38-需求-复制当前智能体会话.md](../38-需求-复制当前智能体会话.md) · **US-CS-01**、**US-CS-02** · Related [#117](https://github.com/Pedro-MAFS/ftcs/issues/117)  
> **状态**：**待马丰顺确认后放行开发**（本文把 docs/38 §7 的 O1～O6 写成可验收的详设默认方案；确认前不进入 `desktop/` 实现）  
> **范围**：智能体栏一次把当前会话写入剪贴板；正文按界面顺序；同一份文本在正文前附带排查元信息  
> **依赖**：现网 `AgentPanel` 的 `agentTimeline`；已有 `window.ftcs.getAppVersion()`；系统剪贴板；`showToast`  
> **不做**：自动上报；改会话存储与展示；自由对话（[#118](https://github.com/Pedro-MAFS/ftcs/issues/118)）；搬动智能体栏；关闭 #117；合入 `main`  
> **文档位置**：`docs/design/`

需求依据是已合入 `dev-0.6.1` 的 `docs/38-需求-复制当前智能体会话.md`（规则 CS1～CS8、US-CS-01、US-CS-02、§7 O1～O6；基线提交 `75c219b`）。本文不改该需求正文。

**待马丰顺确认后放行开发。** O1～O6 的选择、文案、上限和样例以 §2 为准。确认之前，本文只作详设，不改 `desktop/` 业务代码。

US-CS-01 与 US-CS-02 分节验收，合在这一份详设里。两次点击仍是同一个按钮：US-CS-02 完成后，剪贴板里同时有元信息和正文。

---

## 0. 相对现网

对照 `dev-0.6.1`（`75c219b`）。

| 现网 | **本期** |
|------|----------|
| `WorkspaceLayout.vue` 从左到右是活动栏、产品与流水线侧栏、主区域、`AgentPanel`。智能体栏在主区域右侧（`border-left`，宽 `--agent-width: 340px`）。Issue 称「左侧智能体栏」 | 入口加在现网这面栏上。不搬到主区域左侧，不改栏宽 |
| `AgentPanel` 标题行：左侧脉冲 +「智能体」，右侧技能名（`SKILL_LABELS`）。其下是 `agentMeta` 卡片、时间线、等待回复卡片、输入框。没有复制会话 | 标题行右侧、技能名之后，放一枚主按钮「复制会话」。一次点击。不放进菜单 |
| `AgentTimelineItem.kind`：`user` / `system` / `assistant` / `reasoning` / `tool` / `error`。子代理在同一条目的 `subagent.steps`（`tool` / `reasoning` / `error`）。界面顺序即 `agentTimeline` 数组顺序 | 复制按这个数组顺序读内存里的条目。种类、顺序、折叠规则、推送方式都不改 |
| 用户消息、思考，以及 `collapsed` 的条目，界面默认 `preview(body, 160)` 再加省略号。子代理步骤默认收起，展开后长正文再 `preview(step.body, 80)` | 复制读 `item.body` 与 `step.body` 的全文。`agentExpanded` 不参与复制。界面折叠保持原样 |
| 时间线为空时，面板写占位句：生成中是「任务启动中…」，否则是「点击「生成画像」后，此处按时间顺序展示过程」 | 这两句只留在界面上。时间线长度为 0 时点击只提示，不写入剪贴板 |
| 等待回复由 `AgentAwaitingReplyCard` 画在时间线下方，数据在 `awaitingUserReply`。可渲染时展示题头、题干、选项；不可渲染时展示「这项操作需要你处理，当前无法代为回答。」 | 时间线至少有一条时，把当时可见的问题文案单独成段「等待用户回复」。没有这张卡片则整段不出现 |
| 时间线在 `useWorkspace` 的进程内 `agentTimeline`。新任务 `resetTimelineView()` 清空。无磁盘持久化。父会话号在主进程 `AgentRunController.sessionId`，渲染进程没有单独字段；创建成功后有一条 `id === 'sys-session'` 的系统条目，正文为 `已创建 OpenCode session` 换行再加该 id。子代理 id 在 `item.subagent.sessionId` | 父会话号只从这条已有系统条目读取。读不到就省略该行。不新增 IPC |
| 运行中的版本已有通道：`window.ftcs.getAppVersion()` → `app:get-version` → `getAppVersion()` → `app.getVersion()`。设置页与更新检查已在用。`app.getVersion()` 抛错时主进程现网返回 `0.0.0` | 元信息里的版本号调用这一条，不新开通道，也不把文档编写时的号码写死 |
| 诊断详情 `DiagnosticDetails.vue`：`navigator.clipboard.writeText`，失败再放隐藏 `textarea` 并 `document.execCommand('copy')`，按钮文案改成「已复制」约 1.5 秒。线索 JSON 只 `writeText`，失败被吃掉。分享下载链接失败时把链接放进返回文案 | 写入沿用诊断详情的两段式。结果用 `showToast`。按钮文字保持「复制会话」 |
| 输入框占位「自由对话暂未开放…」。点「发送」只把 `composerHint` 设为暂不支持，不产生用户消息 | 不复制输入框草稿，不改变发送行为 |

现网接缝（实现时按本节）：

1. **复制只读快照。** 点击处理函数在第一次 `await` 之前，把 `agentTimeline`、`agentMeta`、`agentSkill`、`agentStatus`、`awaitingUserReply`、`activeProductId` 深拷贝到本次局部变量，并记下 `copiedAt`。之后版本 IPC 和剪贴板等待期间，时间线可以继续增长，这一份文本仍是点击瞬间的快照。不调用 `resetTimelineView`，不写这些 ref，不改 `agentExpanded`。
2. **父会话号没有渲染进程字段。** 八处任务都在创建 OpenCode session 之后 `addPrefix` 一条 `id: 'sys-session'`，正文固定为两行：`已创建 OpenCode session` 与 session id。会话尚未创建时这条还不在。详设不为此增加 `getSessionId`。
3. **栏上「产品」卡片经常是截断值。** 主进程 `pushState` 里多见 `productId.slice(0, 18)`。渲染进程的 `activeProductId` 是完整 id。元信息里两处都写：卡片按界面原文，「产品标识」用完整 `activeProductId`。
4. **版本 IPC 已经通到渲染进程。** `preload.ts` 的 `getAppVersion` 与 `desktop/src/types/electron.d.ts` 已声明。本期不改 `ipc/types.ts`、不改 `main.ts`。
5. **空态句不在时间线数据里。** 它们是 `AgentPanel` 模板里 `v-if="!agentTimeline.length"` 的两句。序列化函数不接收 DOM 文本，因此不会把它们写进剪贴板。
6. **等待卡片的点选存在卡片内部。** `selected` / `customTexts` 没有进 `useWorkspace`。复制不读这些未提交的输入。

---

## 1. 两条故事的分工

| 内容 | 归谁 |
|------|------|
| 标题行按钮、一次点击、快照顺序、全文而非预览、空会话提示、成功与失败提示、脱敏、超长截断、等待段与未点名块、不改时间线 | **US-CS-01** |
| 同一份文本文首的元信息：应用版本、复制时间，以及 §4 清单里的其余字段和省略规则 | **US-CS-02** |
| 智能体栏放在主区域哪一侧 | 维持现网。本文不加入口以外的布局 |
| 自由发送 | [#118](https://github.com/Pedro-MAFS/ftcs/issues/118)。输入框与「发送」保持现网 |

US-CS-01 可以用一段不含版本断言的正文样例验收顺序、空态和脱敏。US-CS-02 验收文首字段。开发完成后，同一次点击同时满足两节。时间线长度为 0 时两节都不写剪贴板。

---

## 2. 详设拍板（docs/38 §7）

**待马丰顺确认后放行开发。** 下表是详设默认方案。马丰顺尚未最终锁；倾向来自产品侧讨论。确认后，验收按本表与样例执行。

| 项 | 详设默认方案 |
|----|----------------|
| **O1 入口** | 智能体栏**标题行右侧**一枚主按钮，可见文字「复制会话」，`aria-label` 为「复制当前会话」。`class` 用现成的 `btn-primary btn-sm`。一次点击，不放进菜单，不二次确认。时间线为空时按钮仍可见、仍可点，点击走空态提示。任务进行中也可点 |
| **O2 脱敏** | 写入前对**整份已序列化文本**（含元信息、正文、等待段）做密钥类替换，命中段换成固定占位 `[REDACTED]`。覆盖 API Key 标注、`Bearer`、`sk-` 前缀、`key=` 一类赋值，以及本仓库 Places 密钥的 `AIza` 前缀。公司名、邮箱、本机路径原样保留。`keyword=` 不误伤 |
| **O3 超长** | 按脱敏后的纯文本字符数截断，上限 **`200_000`**（JavaScript 字符串长度，一个 UTF-16 码元算 1，一个汉字算 1）。超限仍写入剪贴板：元信息区增加一行 `已截断，原长 N，保留前 M`，正文从尾部砍到整份长度等于 `200_000`。成功提示改为「已复制（内容过长已截断）」。不得静默截断 |
| **O4 折叠** | 复制该条目持有的全文（`item.body`、`step.body`）。界面上的 160 字 / 80 字预览和「展开全文」状态不影响复制范围。子代理卡片收起时，步骤全文仍进入剪贴板 |
| **O5 未点名块** | 除 `user` / `assistant` / `tool`（含 `tool` 的 `body` 结果）外，纳入 `system`、`reasoning`、`error` 和子代理步骤。时间线至少有一条且存在等待回复卡片时，正文之后单独成段「等待用户回复」，写入当时可见的问题文案。空态占位句永不写入。输入框草稿不写入 |
| **O6 写入失败** | 先 `navigator.clipboard.writeText`。失败则沿用诊断详情：隐藏只读 `textarea` + `document.execCommand('copy')`，并在 `finally` 移除该节点。两段都失败时 Toast「复制失败，剪贴板不可用，请再试一次」，不改时间线。回退成功则与一次成功同一套成功提示 |

常量写死为 `COPY_SESSION_CHAR_LIMIT = 200_000`。用户可见的数字写成十进制 `200000`，不用下划线。

### 2.1 O1 按钮

标题行结构改为：左侧仍是脉冲和「智能体」；右侧一个横排，先技能名，再按钮。按钮是该行最右的控件，`flex-shrink: 0`。技能名过长时省略号截断，按钮不换行、不收进菜单。

| 状态 | 按钮 | 点击 |
|------|------|------|
| 时间线至少一条，任务已结束或进行中 | 可见、可点 | 按 §5 写入剪贴板 |
| 时间线长度为 0（含「任务启动中…」） | 可见、可点，不加 `disabled` | 只 Toast，不调用剪贴板 |
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

### 2.4 O3 截断

1. 先得到脱敏后的完整文本 `T`，`N = T.length`。`T` 不含截断说明。
2. `N ≤ 200_000`：写入 `T`。不出现「已截断」。Toast：「已复制会话」。
3. `N > 200_000`：在元信息区最后追加一行 `- 已截断，原长 N，保留前 M`，得到 `T'`。`M` 取实际写入长度。实现上先按 `M = 200000` 插入该行，再 `T'.slice(0, 200_000)` 写入。说明行在文首，会完整留下。正文被砍的是尾部。Toast：「已复制（内容过长已截断）」。
4. 因此超限时写入长度是 `200000`，说明行里的 `M` 是 `200000`，`N` 是插入说明之前的长度。两个数字都用十进制，不加千分位。
5. 时间线界面仍显示全文。截断只影响这一次剪贴板字符串。

元信息远小于上限。若元信息本身已经不短于 `200_000`（正常路径不会发生），仍写入前 `200000` 字并使用截断 Toast，避免静默。

| 步骤 | 结果 |
|------|------|
| 脱敏后 `N = 250400` | 剪贴板长度 `200000`。其中有一行 `已截断，原长 250400，保留前 200000`。会话正文末尾缺失。Toast 为「已复制（内容过长已截断）」 |
| 脱敏后 `N = 200000` | 无截断行。Toast 为「已复制会话」 |
| 脱敏后 `N = 200001` | 有截断行，写入长度 `200000`，Toast 为截断文案 |

### 2.5 O4 与 O5 样例

折叠：一条 `user` 的 `body` 为 200 个 `A` 再加 `ENDMARK`，界面处于收起。界面预览是前 160 字加 `…`。剪贴板中的该条目含有 `ENDMARK`，并且不使用预览函数追加的那个省略号。子代理步骤用 100 字以上的 `step.body` 加另一个 `ENDMARK`，卡片处于收起，剪贴板仍含该 `ENDMARK`。

等待卡片：

| 卡片 | 剪贴板 |
|------|--------|
| `renderable === true` | 每题一段：`### {header}`、题干、每个选项一行。有 `description` 时写成 `- {label}：{description}`，否则 `- {label}`。`custom` 不为 `false` 时追加一行 `- 输入自己的答案`。不写用户尚未提交的点选和自填 |
| `renderable === false` | 段标题仍是「等待用户回复」，正文只有「这项操作需要你处理，当前无法代为回答。」 |
| `awaitingUserReply === null` | 没有「等待用户回复」这一段 |
| 时间线长度为 0 | 即使异常地还有等待卡片，也不写剪贴板，走空态 Toast |

空态占位句「点击「生成画像」后，此处按时间顺序展示过程」和「任务启动中…」在任何成功或失败的剪贴板结果里都不出现。输入框里的 `agentPrompt` 不出现。

### 2.6 O6 与空会话样例

| 步骤 | 剪贴板 | 界面 | Toast |
|------|--------|------|-------|
| `writeText` 成功 | 本次文本 | 时间线与折叠与点击前一致 | 成功文案（未截断或已截断） |
| `writeText` 抛错，隐藏文本框 `execCommand('copy')` 返回 `true` | 本次文本 | 同上。临时 `textarea` 已从文档移除 | 与上一行相同的成功文案 |
| 两段都失败 | 保持失败前的内容 | 时间线条目、正文、折叠与点击前一致 | 「复制失败，剪贴板不可用，请再试一次」，`tone: 'error'` |
| `agentTimeline.length === 0` | 不调用写入，内容保持点击前 | 占位句仍在面板上 | 「当前没有可复制的会话」（默认 `info`） |

空会话不写一份只有元信息的文本。

### 2.7 待马丰顺确认

确认下面每一项之后，才按本文改 `desktop/`：

1. 入口是标题行最右侧主按钮「复制会话」，一次点击；空会话按钮仍可点，只提示、不写剪贴板。
2. 默认只脱敏 §2.2 的密钥类，占位 `[REDACTED]`；公司名、邮箱、路径原样。`token=` 本刀不纳入。
3. 上限写死 `200_000` 字符；超限仍写入，文首说明 `已截断，原长 N，保留前 M`，Toast 改为「已复制（内容过长已截断）」。
4. 复制内存全文，折叠与 160/80 字预览不缩小范围。
5. 纳入 `system`、`reasoning`、`error`、子代理步骤；有时间线条目时把等待卡片的可见问题文案单独成段；空态句与输入框草稿不写入。
6. 剪贴板失败沿用诊断详情的隐藏文本框回退；仍失败则 Toast「复制失败，剪贴板不可用，请再试一次」，且不改时间线。
7. 不新增 IPC。父会话号只从 `sys-session` 条目读取，没有这条就省略「会话」行。
8. 复制时间用点击瞬间的本地时间 `YYYY-MM-DD HH:mm:ss ±HH:mm`。

---

## 3. 复制文本格式

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

下面是一次点击之后的剪贴板全文。工具正文在点击前含有 `Bearer sk-test-FAKEKEY123456`、`api_key=sk-live-abcdef123456` 和 `sk-ant-api03-FAKEKEY1234567890`，样例中已经替换。版本号 `0.6.1` 只是举例，验收时等于当时 `getAppVersion()` 的返回值。

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

只在时间线至少有一条、并且即将写入剪贴板时生成。列表顺序固定。

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
| 截断说明 | 仅 O3 超限 | 未超限则没有这一行 |

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
  participant Clip as 剪贴板
  participant Toast as showToast

  User->>Panel: 点击「复制会话」
  Panel->>Panel: 同步深拷贝时间线与元信息
  alt 时间线没有条目
    Panel->>Toast: 当前没有可复制的会话
  else 有条目
    Panel->>Panel: 已有 getAppVersion
    Panel->>Build: 元信息在前，再拼正文
    Build->>Build: 脱敏，再按 200_000 截断
    Build->>Clip: writeText，失败则隐藏 textarea
    alt 写入成功
      Panel->>Toast: 已复制会话，或已复制（内容过长已截断）
    else 两段都失败
      Panel->>Toast: 复制失败，剪贴板不可用，请再试一次
    end
  end
```

### 5.1 挂在哪个组件

按钮加在 `desktop/src/components/layout/AgentPanel.vue` 的 `.agent-panel__head`。样式加在 `desktop/src/styles/main.css` 的 Agent panel 一节：右侧容器横向排列、间距 8、按钮不收缩。

纯函数放在新文件 `desktop/src/components/layout/copy-agent-session.ts`，便于不挂面板做样例断言。建议单测 `copy-agent-session.test.ts` 覆盖 §2 的脱敏表、`ENDMARK` 全文、空数组不产出占位句、`N = 200001` 的截断行，以及 `sys-session` 省略。本文不添加这些文件。

`AgentPanel` 负责快照、空态、版本、Toast 和剪贴板。序列化函数不调用 `navigator`，也不读 DOM。

### 5.2 主进程

**不新增 IPC，不改主进程。**

| 已有通道 | 本期用法 |
|----------|----------|
| `app:get-version`（`window.ftcs.getAppVersion`） | 元信息「应用版本」 |

时间线、技能、状态、栏上卡片、等待卡片、产品 id 都已经在渲染进程。父会话号从快照里的 `sys-session` 正文读取。复制时间用渲染进程的 `Date`。

### 5.3 点击处理

```ts
const COPY_EMPTY = '当前没有可复制的会话'
const COPY_OK = '已复制会话'
const COPY_TRUNCATED = '已复制（内容过长已截断）'
const COPY_FAIL = '复制失败，剪贴板不可用，请再试一次'
```

1. `copying` 为真则返回。
2. 同步深拷贝 §0 所列字段，`copiedAt = new Date()`。
3. `items.length === 0`：`showToast(COPY_EMPTY)`，返回。不取版本，不写剪贴板。
4. `copying = true`。
5. `try` 取版本：成功则用返回字符串；抛错或空串则交给 §4 写成「未能读取」。
6. `buildCopySessionText`：拼文本 → `redactSecrets` → 按 §2.4 截断。
7. `writeClipboard`：先 `navigator.clipboard.writeText(text)`。捕获到异常后创建 `textarea`，`readonly`，`position: fixed; left: -9999px`，`select()`，再 `document.execCommand('copy')`。`finally` 移除节点。返回布尔。
8. 成功：`showToast(truncated ? COPY_TRUNCATED : COPY_OK, { tone: 'success' })`。失败：`showToast(COPY_FAIL, { tone: 'error' })`。停留时间用 `TOAST_DEFAULT_MS`（现网 5000）。
9. `finally` 把 `copying` 置回假。

不把全文打到 `console`。不调用任何上传或上报接口。

---

## 6. 验收清单

### 6.1 US-CS-01

- [ ] 智能体栏标题行右侧有主按钮「复制会话」，`aria-label` 为「复制当前会话」。不在菜单里。栏仍在主区域右侧。
- [ ] 时间线含用户消息、回复、工具及结果时，剪贴板中的对应内容顺序与 `agentTimeline` 一致，且含 `system`、`reasoning`、`error`。
- [ ] 收起的用户消息仍含 `ENDMARK` 全文；收起的子代理步骤仍含步骤全文。复制前后折叠状态相同。
- [ ] 任务进行中点击：剪贴板是点击瞬间的快照；之后新到的条目不进入这一份文本。任务继续运行。
- [ ] §2.3 的假密钥在剪贴板中不可见，公司名、邮箱、路径、`keyword=` 仍在。
- [ ] 未超限时 Toast「已复制会话」。`N > 200000` 时剪贴板含 `已截断，原长 N，保留前 200000`，Toast 为「已复制（内容过长已截断）」，界面时间线仍是全文。
- [ ] 有等待卡片且时间线非空时，文末有「等待用户回复」和当时可见的题头、题干、选项。未提交的自填不在其中。没有卡片时没有这一段。
- [ ] 时间线为空时 Toast「当前没有可复制的会话」，剪贴板保持点击前的内容，占位句不在剪贴板中。按钮仍然可见。
- [ ] 两段写入都失败时 Toast「复制失败，剪贴板不可用，请再试一次」，时间线不变。回退成功时与直接成功同一文案。
- [ ] 输入框草稿未被复制。「发送」仍只提示暂不支持自由发送。
- [ ] 没有自动上报或上传。

### 6.2 US-CS-02

- [ ] 同一次成功复制的文首有「应用版本」和「复制时间」。版本等于当时 `getAppVersion()` 的返回值（含现网回退 `0.0.0`）。时间形如 `2026-10-31 09:41:05 +08:00`，是点击瞬间的本地时区。
- [ ] 有技能行、运行状态行、错误条数。`agentMeta` 非空时有一条「栏上状态」，顺序与卡片一致。
- [ ] `activeProductId` 非空时有完整「产品标识」。与卡片上截断的产品值可以不同。
- [ ] 存在符合 §4 的 `sys-session` 时有「会话」行，值是该条目第二行。会话尚未写出这条时，没有「会话」行，也不出现自造的 id。
- [ ] 错误条数大于 0 时有「最近错误」，指向行走顺序的最后一条。为 0 时没有该行，条数行仍是 `0`。
- [ ] 元信息在「会话正文」之前。空会话不写入只有元信息的文本。
- [ ] IPC 通道仍只有既有的 `app:get-version`。没有新的会话读取通道。
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
| 为父会话号、版本或复制时间新增 IPC | §5.2 |
| 脱敏公司名、邮箱、本机路径；纳入 `token=` | §2.2。若要扩大脱敏，另开一刀 |
| 复制输入框未发送草稿，或等待卡片上未提交的点选 | §2.5 |
| 把空态占位句写入剪贴板 | CS3 |
| 合入 `main`、打 tag、发版、关闭 #117 | CS8。PR 关联写法为 Related #117 |

---

## 8. 修订记录

| 日期 | 说明 |
|------|------|
| 2026-10-31 | 初稿。拍板 docs/38 §7 O1～O6 的详设默认方案：标题行主按钮「复制会话」；密钥类替换为 `[REDACTED]`，公司名、邮箱、路径原样；上限 `200_000` 字符，超限写明文首说明并改成功提示；复制内存全文；纳入 system、reasoning、error、子代理步骤和等待卡片。元信息含运行中版本与本地复制时间。沿用诊断详情的剪贴板回退，失败 Toast，不新增 IPC。待马丰顺确认后放行开发。覆盖 US-CS-01、US-CS-02。Related #117。 |
