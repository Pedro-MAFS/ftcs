# US-LY-02 详细设计：主视图标签、首页与图标轨

> **用户故事**：[../39-需求-主视图多标签与布局可调.md](../39-需求-主视图多标签与布局可调.md) · **US-LY-02** · Related [#119](https://github.com/Pedro-MAFS/ftcs/issues/119)  
> **状态**：**O2、O3、O8、O9 已确认（2026-11-01）：按详设推荐。** 实现由马丰顺本人完成。不关 #119  
> **范围**：标签条、加号开首页、六个首页入口、图标轨联动、设置不占标签、冷启动只开一枚阶段页、关闭后的激活与空态  
> **依赖**：现网五个业务页和图标轨。标签类型与 [US-LY-03](US-LY-03-浏览器进主视图标签.md) 的「同一次选型」是同一份 `MainTab`（LY11）。栏宽在 [US-LY-01](US-LY-01-三栏拖拽收起与占满.md)  
> **不做**：把设置做成首页卡片；顶栏中间恢复导航；标签排序和固定；记住上次标签清单；浏览器多页的挂载（那是 03）  
> **界面稿**：[`main-view-tabs.pen`](main-view-tabs.pen) 的 01 屏，以及 03 屏里图标轨与「线索库」高亮  
> **索引**：[US-LY-主视图多标签与布局可调.md](US-LY-主视图多标签与布局可调.md)

---

## 1. 同一次选型（只引用，不另定）

LY11：业务页和浏览器页同一次选型。结论只写在 US-LY-03 的「同一次选型」。本文件使用那里的类型，不改备选，不改已确认的 A。

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

`useMainViewTabs.ts` 持有 `tabs`、`activeId`、`settingsCover`。`kind: 'browser'` 的 `id` 用主进程 `BrowserTab.key`。谁创建 `WebContents`、10 / 5、短标题，全部见 US-LY-03。

实现本故事时，类型里必须已经有 `kind: 'browser'`。禁止先合入只含 `page` 的模型。浏览器挂载可以跟在 03，但类型不能分两次各选一套。

---

## 2. 现网落点

| 现网 | **本故事** |
|------|------------|
| `TitleBar.vue` 中间是流水线芯片。右侧有「打开浏览窗 / 浏览中」、主题、运行状态、登录、设置 | 去掉中间芯片。设置仍在顶栏。浏览按钮的删除属于 US-LY-03 的 O5，两处都改 `TitleBar.vue` 时不要加回芯片 |
| `ActivityRail.vue` 五个业务图标加底部设置，高亮等于路由名 | 高亮跟当前标签。首页和浏览器标签不高亮业务项。顺序不变，没有浏览器图标 |
| `Sidebar.vue` 点流水线走 `PIPELINE_TO_SECTION`。`email` 这一步的目标是 `leads`。新建成功后 `router.push({ name: 'profile' })` | 这些点击改走 `openPageTab`。第 5 步仍打开线索库。首页卡片「邮件」才是 `page:email` |
| `router/index.ts`：`boot` / `input` / `profile` / `explore` / `leads` / `email` / `settings` | 增加 `home`、`empty`。`browse` 由 US-LY-03 使用 |
| `useDefaultLanding` 在流水线就绪后 `router.replace` 到 `landingSectionFromSteps` | 改成 `openPageTab(name)`。不额外先摆首页。`peek` / `commit` 仍在主进程内存，不进 `ftcs-prefs.json` |
| `setAgentContext` 只在 `agentStatus !== 'running'` 时改技能名 | 只在当前是五个业务页之一、且没有被设置盖住时调用 |

---

## 3. 首页与标签标题

`MainTabBar.vue`：标签高 26，每一枚都有关闭，超出横向滚动。加号在标签列末尾，点击 `openPageTab('home')`。主视图占满钮在标签条右侧，行为见 US-LY-01。

首页 `HomeView.vue` 两列六张卡片。副文案用下表，不用 `SECTION_META.subtitle`。没有设置卡片。

| 卡片标题 | 副文案 | 点击 |
|----------|--------|------|
| 录入 | 公司与产品资料 | `openPageTab('input')` |
| 画像 | 确认后再去探索 | `openPageTab('profile')` |
| 探索 | 扩展关键词并找客户 | `openPageTab('explore')` |
| 线索 | 原始与已评分线索 | `openPageTab('leads')` |
| 邮件 | 审阅开发信草稿 | `openPageTab('email')` |
| 浏览器 | 打开客户网站 | `openUserBrowserTab()`，定义在 US-LY-03 |

| `page` | 标签标题 |
|--------|----------|
| `home` | 首页 |
| `input` | 产品录入 |
| `profile` | 产品画像 |
| `explore` | 获客探索 |
| `leads` | 线索库 |
| `email` | 邮件审核 |

`openPageTab(page)`：已有 `page:${page}` 则把它设为 `activeId`，`settingsCover = false`，`router.push` 到对应路由。没有则先追加再聚焦。五个业务视图和 `HomeView` 放在 `<KeepAlive>` 里。关掉标签时丢掉该页缓存。

图标轨、侧栏流水线、侧栏「新建」成功后的跳转，都走 `openPageTab`，不再直接 `router.push` 到业务页。

| 当前内容 | 路由 | 图标轨 |
|----------|------|--------|
| 首页 | `home` | 五个业务项都不高亮，设置也不高亮 |
| 五个业务页 | 现有名字 | 对应项 `is-active` |
| 浏览器标签 | `browse`（见 03） | 五个业务项都不高亮 |
| 设置盖住 | `settings` | 只有底部设置高亮。`activeId` 保留，标签都不画成选中 |
| 一张标签都没有 | `empty`，文案「没有打开的页面」 | 五个业务项都不高亮 |

`useDefaultLanding` 的 `TAKEOVER_ROUTES` 补上 `home`、`browse`、`empty`。占位路由 `boot` 保持。冷启动不读 `tabs`。

---

## 4. 已确认项

### 4.1 O2　关闭后的激活与空态

> **已确认（2026-11-01）：按详设推荐**

| | |
|--|--|
| **推荐** | 关掉的是当前枚：有右邻则激活右邻，否则激活左邻。关掉的不是当前枚：当前枚不变。关掉最后一枚：`activeId = null`，主区只显示「没有打开的页面」，加号仍在，不自动再开首页 |
| **备选** | 关掉当前枚总是激活左邻。关掉最后一枚时自动再开一枚首页 |
| **理由** | 右邻优先时，从左往右关掉当前枚，激活的是还没关掉的下一枚。自动首页会让「关掉最后一枚」和「点加号」变成同一结果。LY5 把新开首页放在加号上 |
| **样例** | 从左到右是首页、线索库、获客探索，当前是线索库。关线索库，当前变为获客探索，图标轨变为探索。再关获客探索，当前变为首页，图标轨没有业务项高亮。关首页，主区文字是「没有打开的页面」，标签条只剩加号。点加号，出现一枚「首页」。关线索库时若当前本就是首页，首页仍选中 |

浏览器标签被任务清掉时，若它正是当前枚，也用这张表。见 US-LY-03。

### 4.2 O3　同一业务页能否两枚

> **已确认（2026-11-01）：按详设推荐**

| | |
|--|--|
| **推荐** | 每个 `PageKey` 至多一枚。首页、图标轨、流水线、首页卡片再次进入已打开的页时，聚焦已有的那枚，不追加。浏览器标签可以多枚。首页「浏览器」在已经有一枚空白 `user` 页时聚焦它，否则新开一枚 |
| **备选** | 每次从首页进入都再开一枚，允许两枚「线索库」 |
| **理由** | 五屏里首页、线索库、获客探索、某一个网站各一枚。docs/39 写明未说明前不要出现两枚「线索库」。网页多枚是 LY7，规则在 US-LY-03 |
| **样例** | 打开线索库后再点图标轨「线索」或首页「线索」，标签条仍只有一枚「线索库」，且它被选中。再点首页「浏览器」两次，中间不导航：只有一枚标题为「浏览器」的空白页。在地址栏打开 `https://acme-industrial.com/products/valves` 之后再点首页「浏览器」：新增一枚空白页，原来的 acme 页还在 |

### 4.3 O8　设置不占标签

> **已确认（2026-11-01）：按详设推荐**

| | |
|--|--|
| **推荐** | 不占标签。顶栏和图标轨底部的设置仍 `router.push({ name: 'settings' })`，`settingsCover = true`。侧栏仍换成现网设置分类。首页六张卡片里没有设置 |
| **备选** | 设置独占一枚标签，标题「设置」 |
| **理由** | 稿面和 LY5 都把设置留在顶栏。五屏没有「设置」标签。`Sidebar.vue` 里 `section === 'settings'` 的分类列表不用搬进标签内容区 |
| **样例** | 当前是线索库，点顶栏设置。标签条上仍是原来的那些枚，没有一枚标题为「设置」，也没有一枚画成选中；图标轨底部设置高亮；左栏是「账号与授权」等分类。点「线索库」那枚标签，设置盖住消失，线索库恢复选中，左栏回到产品与流水线。首页上看不到设置卡片 |

`openSettings()`：`settingsCover = true`，不追加标签。在设置盖住时再点当前 `activeId` 那枚标签，或点图标轨的业务项：`settingsCover = false`。

侧栏在设置时不画产品字头像。收起状态位不因为进入设置而被改写成展开。进入设置的这一次显示里，左栏按展开宽度画出设置分类；离开后若 `pipelineCollapsed` 仍为 true，回到 44px 字头像（宽度见 US-LY-01）。设置分类标题行的收起钮仍可用：收起后只留展开钮，再展开仍是设置分类。

### 4.4 O9　冷启动

> **已确认（2026-11-01）：按详设推荐**

| | |
|--|--|
| **推荐** | `landingSectionFromSteps` 的返回值原样作为唯一自动打开的业务标签。不额外插入首页。不恢复退出前的标签。用户在占位期间已经点过页面，则沿用现网 `userTookOver`，不再 `replace` |
| **备选** | 每次冷启动先开一枚首页，再在旁边打开阶段页。或把上次 `tabs` 写进布局偏好 |
| **理由** | docs/39 O9：阶段对应不改，也不要求每次都先看见首页。LY10 不记标签清单。docs/36 / US-DL 的「每个主进程只自动选一次」保持 |
| **样例** | 无产品：占位「正在打开…」之后，只有「产品录入」。只有录入完成：只有「产品画像」。关键词扩展完成且更后未完成：只有「获客探索」。探索、评分或邮件草稿任一完成：只有「线索库」。以上都没有「首页」，除非用户再点加号。上次退出时停在主视图占满：再打开仍是占满，下面那一枚是按阶段算出的页，不是上次的标签清单 |

阶段表与 `desktop/src/composables/landing-section.ts` 一致，本故事不改公式：

| 条件 | 打开的标签 |
|------|------------|
| `explore`、`score`、`email` 至少一步 `done` | `page:leads` |
| 否则 `keywords` 为 `done` | `page:explore` |
| 否则 `input` 为 `done` | `page:profile` |
| 否则 | `page:input` |

---

## 5. 手测（Windows）

| 步骤 | 通过 |
|------|------|
| 点加号 | 新的一枚，标题「首页」。六张卡片的标题和副文案与 §3 的表一致。没有设置卡片 |
| 看顶栏 | 中间没有录入 / 画像 / 探索 / 线索 / 邮件。右侧能进设置 |
| 从首页打开线索，再打开探索 | 各一枚。标题「线索库」「获客探索」。再点一次首页的线索，仍是一枚 |
| 停在首页 | 图标轨五个业务项都没有高亮 |
| 停在线索库 | 只有线索高亮 |
| 流水线收起后点图标轨「邮件」 | 打开或聚焦「邮件审核」。图标轨仍可点 |
| 关掉当前枚、关掉最后一枚 | 与 O2 样例一致 |
| 点顶栏设置 | 与 O8 样例一致 |
| 冷启动四种阶段 | 与 O9 样例一致。不先出现首页 |

从浏览器标签点回线索库时图标轨回到线索，这条和 US-LY-03 一起测。

---

## 6. 落地

| 文件 | 改动 |
|------|------|
| `desktop/src/composables/useMainViewTabs.ts` | 新建。`MainTab` 含 `page` 与 `browser` |
| `desktop/src/components/layout/MainTabBar.vue` | 新建。加号、关闭、占满钮 |
| `desktop/src/views/HomeView.vue` | 新建 |
| `desktop/src/router/index.ts` | `home`、`empty` |
| `desktop/src/components/layout/ActivityRail.vue` | 高亮改读当前标签。业务项走 `openPageTab` |
| `desktop/src/components/layout/Sidebar.vue` | 流水线和新建走 `openPageTab`。设置分类分支保持 |
| `desktop/src/components/layout/TitleBar.vue` | 删除 `.title-bar__pipeline`。设置按钮改 `openSettings` |
| `desktop/src/composables/useDefaultLanding.ts` | `openPageTab` 替换 `router.replace` |

与 US-LY-03 同一批提交类型定义。不要把只有 `page` 的 `MainTab` 先合进 `dev-0.6.1`。

---

## 7. 修订记录

| 日期 | 说明 |
|------|------|
| 2026-11-01 | 按马丰顺要求从长文拆出。O2、O3、O8、O9 口径与已确认的推荐一致。选型指向 US-LY-03，不另定一套。不关 #119。 |
