# US-LY-03 详细设计：内置浏览器变为多枚主视图标签

> **用户故事**：[../39-需求-主视图多标签与布局可调.md](../39-需求-主视图多标签与布局可调.md) · **US-LY-03** · Related [#119](https://github.com/Pedro-MAFS/ftcs/issues/119)  
> **状态**：**O4、O5、O6、O7 已确认（2026-11-01）。** O5 的口径是「按新稿，悬浮窗退出用户路径」。O4、O6、O7 是「按详设推荐」。实现由马丰顺本人完成。不关 #119  
> **范围**：浏览器占主视图标签；地址栏在内容区；短标题；10 / 5 不合并计数；EC9 退出用户路径；任务开页不抢当前标签  
> **依赖**：[US-LY-02](US-LY-02-主视图标签与首页.md) 的标签条和 O2 关闭规则。现网 `builtin-browser-window.ts`、`tab-lifecycle.ts`、`cdp-gateway.ts`。docs/37 的 US-TC-01、US-TC-02  
> **不做**：改 `BUILTIN_TAB_CAP` / `BUILTIN_TAB_RECLAIM_AT` 的数值；改 `docs/37` 或 US-TC 正文（实现阶段再改 US-TC 手测句，见 §5）；把「找到悬浮窗」写成通过  
> **界面稿**：[`main-view-tabs.pen`](main-view-tabs.pen) 的 02 屏  
> **索引**：[US-LY-主视图多标签与布局可调.md](US-LY-主视图多标签与布局可调.md)

本文件的「同一次选型」是 LY11 的唯一结论。[US-LY-02](US-LY-02-主视图标签与首页.md) 使用同一份 `MainTab`，不另定模型。

---

## 1. 同一次选型（LY11 / O7）

> **O7 已确认（2026-11-01）：按详设推荐。** 推荐是备选 A。

### 1.1 备选

**备选 A，已采用：一条标签列表，每枚带 `kind`。**

```ts
type PageKey = 'home' | 'input' | 'profile' | 'explore' | 'leads' | 'email'

type MainTab =
  | { id: `page:${PageKey}`; kind: 'page'; page: PageKey; title: string }
  | {
      id: string
      kind: 'browser'
      browserKey: string
      title: string
      url: string
      origin: 'user' | 'task'
      taskId: string | null
    }
```

`id` 与顺序在渲染进程 `useMainViewTabs.ts`。`kind: 'browser'` 的 `id` 直接用主进程已有的 `BrowserTab.key`（`tab-1` 这种）。

**备选 B，不采用：** 业务标签条里再嵌一条只属于网页的标签。

**备选 C，不采用：** 业务页用 Vue 标签，网页继续用专用窗里的 `captionTabs()`。

| 标准 | A | B | C |
|------|---|---|---|
| 稿面：`acme.com` 与「线索库」同一条 | 符合 | 网页缩进第二层 | 网页不在主视图条上 |
| LY7：再开一页再挂一枚主视图标签 | 符合 | 不符合 | 不符合 |
| LY11：禁止先做业务页再平行做一套 | 类型里两种都在 | 内层容易后补成第二套 | 就是平行模型 |
| 10 / 5 只数网页 | 主进程数组不收 `kind: 'page'` | 多一层同步 | 过不了五屏 |

### 1.2 状态放哪

| 状态 | 持有者 |
|------|--------|
| 标签顺序、选中、`settingsCover` | 渲染进程 `useMainViewTabs` |
| 布局比例、收起、占满 | 渲染进程 `useWorkspaceLayout`，落盘见 US-LY-04。主进程不靠它排 `WebContents` |
| `WebContentsView`、CDP `targetId`、`origin`、`taskId`、10 / 5 | 主进程 `builtin-browser-window.ts` + `tab-lifecycle.ts` |
| 种子页 `origin: 'seed'` | 主进程数组里，不出现在发给渲染进程的列表中 |

`WebContents` 只由主进程创建和销毁。挂载点从专用 `BrowserWindow.contentView` 改为**主窗口** `contentView`。`ensureBuiltinBrowser()` 的调用点（`env-probe.ts`、`runtime.ts`、`agent-preflight.ts`、`main.ts`）仍表示：启动时准备好网关、种子页和 `tabHost`。函数内部可以改名为 `ensureBuiltinBrowserViews(main)`，不再 `new BrowserWindow` 当作用户可见的浏览窗。

活动的浏览器标签：渲染进程量占位 `getBoundingClientRect()`，用 `builtin-browser:set-slot` 送 `{ x, y, width, height, visible, browserKey }`。主进程对这一枚 `setBounds` 并 `setVisible(true)`。其余网页 view 仍挂在主窗口上，`setVisible(false)`，但 `setBounds` 保持最近一次槽位的非零尺寸。种子页 `setVisible(false)`。`settingsCover`、当前不是这枚浏览器页、智能体占满、主窗口最小化时，`visible: false`。

分区仍是 `ftcs-builtin-browser`。`backgroundThrottling: false` 保持。`startCdpGateway`、`registerBrowserPage`、`setBuiltinBrowserTabHost({ openTab, closeTab, activateTab })` 保持。`openTab` 仍指向回收之后的创建函数。

同步：主进程在创建、`dropTab`、导航提交之后 `publishMainTabs()`。通道 `builtin-browser:tabs`。渲染进程按 `browserKey` 合并：主进程有而列表没有的追加到末尾；列表有而主进程没有的 `kind: 'browser'` 删掉；`kind: 'page'` 不动。被删的若是 `activeId`，按 US-LY-02 的 O2 激活邻居。

| 对象 | 创建 | 销毁 |
|------|------|------|
| 业务页 / 首页 | `openPageTab`（US-LY-02） | 只删列表项和 `KeepAlive`。不调用 `closeBrowserTab` |
| 用户网页 | 首页「浏览器」、地址栏要新开的动作、当前可见页的 `window.open` | 标签关闭 → `builtin-browser:close` → `closeBrowserTab` → `dropTab`。不把种子页传进去 |
| 任务网页 | CDP `create-tab`，或页内 `window.open` 且当时有 `getCurrentBrowserTaskId()`。`taskId` 为 `browser-<skill>-<序号>` | `endBrowserTask` → `closeTabsForTask`。渲染进程只删投影里消失的枚 |
| 种子页 | `createBrowserTab('seed', null)`，加载 `tokenPageUrl()` | 只在应用退出时拆。用户关闭和任务清理都不 drop |

`openUserBrowserTab()`：已有 `origin === 'user'` 且 URL 仍是 `about:blank` 或空，则聚焦，不再创建。否则 `openBrowserTabNow('about:blank')`，`taskId` 为空，创建成功后聚焦。命中上限时 Toast「内置浏览器标签已达上限，这一页没有打开。」不追加标签。

地址栏回车：当前这枚 `loadURL`（无协议时补 `https://`）。同一枚导航，不新开。

当前可见网页里的 `window.open`：仍走 `setWindowOpenHandler` → `openBrowserTab`，并聚焦新枚。

任务 / CDP 的 `openTab`：创建并登记，**不**改 `activeId`。见 §6。

标题不由 `page-title-updated` 决定。现网 `tabLabel()` 优先文档标题，那是悬浮窗标题条的规则。主视图用 §3 的短标题。

O7 样例：标签条可以是 `page:home`、`page:leads`、`page:explore`、`tab-3`。切到 `tab-3` 时主区是地址栏加网页，切回 `page:leads` 时图标轨高亮线索，`tab-3` 的 `WebContents` 仍在，只是 `setVisible(false)`。没有第二套只在悬浮窗里的页列表。

---

## 2. 现网接缝

1. 一枚浏览器页是一枚 `WebContentsView`。悬浮窗标题条和缩略蒙层不算进 10。种子页算进 10，但不画进标签条。
2. `closeBrowserTab` 在 `tabs.length <= 1` 时返回 false。这保护种子页。
3. `openBrowserTabNow` 在 `createBrowserTab` 之前调用 `reclaimBeforeOpen`。拒绝时抛 `BUILTIN_TAB_CAP_MESSAGE`，不进 `waitForNewTarget` 的 4 秒。
4. `applyPageUrl` 今天会 `setBuiltinBrowserMode(navigationMode(...))`，把隐藏悬浮窗变成缩略。用户路径上删掉这条调用。
5. 清理点仍是主进程 `finally` 里的 `endBrowserTask`，不搬到 Vue 的 `type === 'done'`。

---

## 3. O4　短标题

> **已确认（2026-11-01）：按详设推荐**

| | |
|--|--|
| **推荐** | 地址栏永远是完整 URL。标签短标题：尚无 http(s) 时为「浏览器」。有主机名时取主机名并去掉前缀 `www.`。该主机名只有一枚时，标题就是主机名。有两枚及以上时，每枚改成「主机名/第一段路径」；第一段也相同则按从左到右在后者上加 ` ·2`、` ·3` |
| **备选** | 标签用网页文档标题；重名时加 `(2)` |
| **理由** | 稿面标签是 `acme.com` 量级，地址栏才是完整 URL。文档标题常常重名 |
| **样例** | 只有 `https://acme-industrial.com/products/valves`：标签 `acme-industrial.com`，地址栏是这整条 URL。再开 `https://acme-industrial.com/about`：两枚分别是 `acme-industrial.com/products` 与 `acme-industrial.com/about`。两条都是 `/products/...`：`acme-industrial.com/products` 与 `acme-industrial.com/products ·2`。`https://www.acme.com/` 单独一枚时标题是 `acme.com` |

`BrowserPane.vue`：后退、前进、刷新、地址。锁图标只在 `https:` 时画出，不另做证书面板。

---

## 4. O6　10 / 5 作用层

> **已确认（2026-11-01）：按详设推荐。** 推荐：不合并计数。网页页数仍是主进程 `tabs.length`，含种子页，上限 10，回收线 5。业务标签不进入这个数组。任务清理只 drop 本次 `taskId`。可见网站最多 9 枚，因为种子页占 1。不把 10 改成 9，也不把种子页移出计数。

`reclaimBeforeOpen` 的入参仍是主进程 `{ id: tab.key, origin, taskId }`，含种子、`user`、`task`。`kind: 'page'` 不传入 `reclaimBeforeOpen`，也不传入 `closeTaskTabs`。设置页不计数。

| 动作 | 作用层 | 对象 |
|------|--------|------|
| 计数 | `tabs.length` | 种子 + 用户网页 + 任务网页 |
| 回收 | `openBrowserTabNow` 里、`createBrowserTab` 之前 | 仅当前 `taskId` 的 `task` 页，从旧到新，直到 `length < 5` 或没有这种页。不关种子、`user`、别的任务、业务标签 |
| 拒绝再开 | 回收之后 `length >= 10` | 不创建 view，抛 `BUILTIN_TAB_CAP_MESSAGE`。不等 4 秒 |
| 任务结束 / 失败 / 取消 | `AgentRunner` 的 `finally` → `endTrackedBrowserTask` → `endBrowserTask` → `closeTabsForTask` | 只 drop 本次 `taskId`。种子和 `user` 留下。渲染进程只删对应 `kind: 'browser'` |
| 用户关一枚浏览器标签 | `closeBrowserTab` | 这一枚 `user` 或 `task`。种子页不在标签条上 |
| 用户关一枚业务标签 | 渲染进程 | 只删 `kind: 'page'` |

不改这些符号：`BUILTIN_TAB_CAP`、`BUILTIN_TAB_RECLAIM_AT`、`BUILTIN_TAB_CAP_MESSAGE`、`beginBrowserTask`、`endBrowserTask`、`reclaimBeforeOpen`、`closeTaskTabs`、`getCurrentBrowserTaskId`（都在 `tab-lifecycle.ts`）、`closeTabsForTask`（`builtin-browser-window.ts`）、`beginTrackedBrowserTask` / `endTrackedBrowserTask`（`agent-runner.ts`）。有网站的画像看 `bootstrap.websiteUrls.length > 0`。探索在发现路径上登记。关键词扩展、评分、起草、补全不登记。

| | |
|--|--|
| **备选** | 把首页、五个业务页和网页合成一个长度去比 10 和 5 |
| **理由** | 合并后「首页 + 五个业务页 + 种子」在还没开网站时就是 7，US-TC-02「到 5 仍能再开」会先被拒绝。`tab-lifecycle.test.ts` 仍只喂页数组 |
| **样例** | 标签条上有首页、线索库、获客探索，主进程有 1 枚种子。此时 `tabs.length === 1`。任务连续开站：开到第 5 枚页（含种子）时回收本任务最旧的站，线索库和首页仍在。用户已打开 9 枚网站（加种子共 10）后，任务再开一页：立即得到「内置浏览器标签已达上限，这一页没有打开。」业务标签不少。任务 `finally` 之后，这次的任务页为 0，用户自己的网站和线索库还在 |

清理前后：布局的比例、收起、占满不变；业务标签 id 列表不变；被清掉的只有本次 `taskId` 的网页标签。不调用 `setBuiltinBrowserMode`，不 `show` 专用窗。用户正在看的那枚若被清掉，按 US-LY-02 的 O2 落到邻居。

---

## 5. O5　悬浮窗退出用户路径

> **已确认（2026-11-01）：按新稿，悬浮窗退出用户路径**

用户验收只留主视图浏览器标签和内容区地址栏。悬浮窗、顶栏「打开浏览窗 / 浏览中」、「关闭 ≡ 收起」、EC9 三态（收起 / 缩略 / 放大）都退出验收。不得要求「找到悬浮窗」。CDP 与种子页留在主进程。

| 现网 | 本期用户路径 |
|------|----------------|
| `TitleBar.vue` 的 `openBrowser()` → `showBuiltinBrowser` | 删除该按钮。首页卡片走 `openUserBrowserTab` |
| `showBuiltinBrowserFromTitleBar`、`setBuiltinBrowserMode('thumbnail' \| 'expanded')` | 用户操作不调用。`builtinBrowserEntryLabel` 可以留着供旧单测编译；界面不读它 |
| `navigationMode` 把 `hidden` 变成 `thumbnail` | 删除这条调用。导航只更新 `url` 并 `publishMainTabs` |
| 专用窗 `close` 再收起 | 不再创建这扇用户可见的窗 |
| `follow-main-window.ts` | 用户路径不附着。位置只跟占位矩形 |
| `caption.html` / `overlay.html` | 不加载 |

曾考虑、已不采用：主视图标签只是入口，点下去仍弹出 EC9 缩略窗，或保留顶栏按钮当第二入口。

### 5.1 与 US-TC 的衔接

#119 的通过画面以五屏为准。`docs/design/US-TC-任务后清理内置浏览器标签.md` 里仍按悬浮窗写的手测句，在**实现本故事时**改成与主视图标签一致。本详设不改那份文件，也不改 `docs/37`。

| US-TC 位置 | 现在写的 | 实现阶段改成 |
|------------|----------|----------------|
| 文首「不做」 | 改浏览窗三态和标题栏控件 | 用户路径不再有这套控件。不做的是把 10 / 5 或清理策略改掉 |
| 开篇 | 「关闭 ≡ 收起」仍以 EC9 为准 | 用户验收以五屏和本节为准。EC9 只作旧悬浮窗的历史定义 |
| §1.1 第 4 点、§1.2 | 三态控件含义不变；不改标题栏「打开浏览窗 / 浏览中」 | 这些控件退出用户路径。非目标改为：不改 10 / 5，不改「只关本次任务页」 |
| §7 | `hidden` 时标题栏仍是「打开浏览窗」；清理前后 `getBuiltinBrowserMode()` 相同 | 不要求 mode，不要求标题栏出现「打开浏览窗」。开页不得弹出缩略窗。通过条件改为 §4：布局不变，业务标签 id 不变 |
| §8 | 不改 `overlay.html` / `caption.html`，不改三态 | 用户路径不加载这两份页面。断言三态文案的单测随挂载一起改 |
| §10.1 | 打开浏览窗看着种子页；放大态最后一页关不掉；控件与 EC9 一致 | 用户自己的网站留在主视图标签上。可见浏览器标签可以关光。种子页仍在主进程，只剩种子页时 `closeBrowserTab` 仍返回 false。不验收三态 |
| §10.2 | 防护不改 EC9 三态和标题栏控件 | 防护仍是 10 / 5 与立即拒绝 |

保持不变：两个常数、拒绝句、回收再开、只关本次 `taskId`、种子和 `user` 留下、不关业务标签。

`US-EC-01`、`US-EC-02` 若被手测拿来要求找到悬浮窗，以本节为准。本详设不改那两份正文。

---

## 6. 任务自动开页

> **已确认（2026-11-01）：按详设推荐**

画像（有网站）和探索 R1 / R2 / R3 仍在主进程 `beginTrackedBrowserTask`。新建 `WebContents` 的仍是 `cdp-gateway.ts` 里 `create-tab` 调用的 `tabHost.openTab`，以及页内 `window.open`。

**任务路径新开的页追加到标签条末尾，不把 `activeId` 改过去。** 用户停在线索库或某一枚浏览器标签，都继续停在那里。网页在不可见的 view 里加载，CDP 仍打到该 `targetId`。

| 来源 | 是否新枚 | 是否抢走当前页 |
|------|----------|----------------|
| CDP `create-tab` / 任务内 `openBrowserTab` | 是，受 10 / 5 约束 | 否 |
| 用户正在看的那一页里 `window.open` | 是 | 是 |
| 首页「浏览器」、地址栏回车 | 见 §1.2 | 是 |
| 回收或任务结束丢掉用户正在看的那枚 | 不新开 | 按 US-LY-02 的 O2 落到邻居 |

不在渲染进程监听 Agent 的 `done` 去关标签。

风险：不可见的 view 可能不排版，探索抓到白页。已确认的行为仍是不抢焦点。隐藏 view 保持非零 `setBounds`，`backgroundThrottling: false`。实现时在 Windows 上用一轮真实探索验收：人停在线索库，任务仍能读到页面。验证失败也不把「开页就切走当前标签」写成已确认行为。

`WebContentsView` 合成在主窗口页面之上。切回业务页时必须在同一轮把 `visible` 设为 false，否则会挡住点击。智能体占满时同样隐藏。

`window-policy.test.ts`、`anchor.test.ts`、`browser-background.test.ts` 若仍断言三态文案，改挂载时同步断言。`tab-lifecycle.test.ts` 不改 10 和 5。

---

## 7. 手测（Windows）

不把「找到悬浮小窗」或顶栏出现「浏览中」当成通过。

| 步骤 | 通过 |
|------|------|
| 首页点「浏览器」 | 主视图多一枚标签。内容区有后退、前进、刷新、地址。没有第二扇小窗，没有收起 / 缩略 / 放大 |
| 地址栏打开两个不同 URL | 两条都在。短标题按 O4 |
| 切回线索库 | 图标轨高亮线索。网页标签还在条上 |
| 任务连续开多家公司站，人停在线索库 | 条上增加标签，当前页仍是线索库。到回收线后旧任务页消失，任务不中断 |
| 主进程数组已经 10 | 再开一页立刻失败，句子是「内置浏览器标签已达上限，这一页没有打开。」没有约 4 秒无响应 |
| 任务成功、失败、点停止 | 这一次的任务页消失。首页、线索库和用户自己打开的网站还在 |
| 纯文件画像、关键词扩展、评分、起草 | 浏览器标签与运行前一致 |
| 冷启动后看顶栏 | 运行状态、主题、登录、设置。没有「打开浏览窗」 |

单测继续用 `tab-lifecycle.test.ts` 的内存页数组。不把业务标签塞进去凑 10。

---

## 8. 落地

| 文件 | 改动 |
|------|------|
| `desktop/src/components/layout/BrowserPane.vue` | 新建。地址栏和占位 |
| `desktop/src/router/index.ts` | `browse` |
| `desktop/electron/browser-runtime/builtin-browser-window.ts` | view 挂主窗口；`publishMainTabs`；`applyPageUrl` 不再 `setBuiltinBrowserMode` |
| `desktop/electron/browser-runtime/index.ts` | 打开、关闭、导航、`set-slot`、`builtin-browser:tabs` |
| `desktop/electron/preload.ts`、`desktop/src/types/electron.d.ts` | 上述通道 |
| `desktop/src/components/layout/TitleBar.vue` | 删除浏览入口 |

`tab-lifecycle.ts` 的常数和 `agent-runner.ts` 的 `begin` / `end` 调用点保持。实现本故事时按 §5.1 改 US-TC 手测句，不在本详设 PR 里改那个文件。

---

## 9. 修订记录

| 日期 | 说明 |
|------|------|
| 2026-11-01 | 按马丰顺要求从长文拆出。O4、O5、O6、O7 与任务开页不抢焦点的口径不变。LY11 选型只在本文件。不关 #119。 |
