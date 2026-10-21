# US-EC-01 探测与引导去掉系统 Chrome 依赖

> **用户故事**：[../34-需求-Electron自带Chromium替代系统Chrome.md](../34-需求-Electron自带Chromium替代系统Chrome.md) · US-EC-01 · Related #78  
> **状态**：**待评审**（本文件只定设计；业务代码尚未按本文改动）  
> **范围**：环境探测与首次引导 / 设置里的同一引导，改为「内置浏览器就绪」；并落地专用浏览窗与回环调试地址，供探测和 [US-EC-02](US-EC-02-画像与探索浏览器改走内置Chromium.md) 使用  
> **依赖**：现网 `probeChrome` / `probeEnvironment`；`OnboardingOverlay.vue` 环境步；设置页「打开环境与配置引导」  
> **不做**：本故事不验收画像抓站和 R1 / R2 / R3 已经能打开网页（那是 US-EC-02）；不安装系统 Chrome；不关 #78  
> **文档位置**：`docs/design/`

需求依据只有已合入的 `docs/34-需求-Electron自带Chromium替代系统Chrome.md`（EC1～EC8、US-EC-01 验收、§7）。本文不改该需求正文。马丰顺已锁定 O1～O3，写入 §2，不再开放，也没有新的未决产品项。

探测必须看内置浏览器是否真的活着。只改引导文案、回调仍去找 `chrome.exe`，不算完成。只删下载按钮、失败仍被标成 `ok`，也不算完成。

自动化改接这个浏览窗、预检和技能文案归 [US-EC-02](US-EC-02-画像与探索浏览器改走内置Chromium.md)。两条可以分头验收。本故事把窗口和调试地址做出来，并导出 US-EC-02 要调用的函数。

---

## 0. 相对现网

对照 `dev-0.5.9`（`3b49463`，2026-10-21 读码）。

| 现网 | **本期（US-EC-01）** |
|------|----------------------|
| `probeChrome()`（`desktop/electron/onboarding/env-probe.ts`）依次查 Windows 的 `Program Files`、`Program Files (x86)`、`%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe`、注册表 `HKLM\...\App Paths\chrome.exe`、PATH 上的 `chrome`。命中则 `id: 'chrome'`、`label: 'Google Chrome'`、`status: 'ok'`，`detail` 是 exe 路径。未命中则 `missing`，`detail` 为「未检测到 Google Chrome。画像抓站与探索打开网页需要本机 Chrome。」，`installUrl` 为 `https://www.google.com/chrome/`。该项不是 `optional` | 删除这条查找。新函数 `probeBuiltinBrowser()`：`id: 'builtin-browser'`，`label: '内置浏览器'`。就绪与否只看 §4.2 的两条。不读 `chrome.exe`、注册表、PATH。不设置 `installUrl`。失败是 `error`，主说明要求重新检测或重启应用 |
| `CHROME_INSTALL_URL` 常量；`OnboardingOverlay.vue` 在 `item.id === 'chrome'` 时把外链按钮写成「打开 Chrome 下载」 | 去掉该常量和这个分支。没有 `installUrl` 时，现网 `v-if="item.installUrl"` 本来就不会画出下载按钮。类型里的 id 从 `'chrome'` 改成 `'builtin-browser'`，避免旧分支还能配上 |
| `probeEnvironment()` 用 `Promise.all` 跑 Node、OpenCode、Chrome、OfficeCLI。`ok` 为所有非 `optional` 项都是 `ok` | 第三项改为 `probeBuiltinBrowser()`。`ok` 的算法不变：内置浏览器不是 `optional`，失败则整次 `ok === false`。Node、OpenCode、OfficeCLI 的函数体不改 |
| 引导环境步可以「继续（仍有缺失）」离开；变绿看 `probe.ok`。设置页没有第二套依赖清单，`打开环境与配置引导` 调用 `reopenOnboarding('env')`，回到同一 `OnboardingOverlay` | 仍是同一步、同一 `probeEnvironment()`。设置页不新做一套浏览器清单 |
| `statusLabel`：`ok` → 就绪，`outdated` → 过旧，`error` → 异常，其余 → 缺失 | 内置浏览器失败必须走 `error`，徽章是「异常」。禁止用 `missing`，否则徽章会变成「缺失」，读起来像还要去安装 |
| 业务引导 `TOUR_STEPS` 探索详情：「在「探索」页开始找客户。需要可用的搜索和 Chrome。」（`desktop/src/types/onboarding.ts`） | 改为「在「探索」页开始找客户。需要可用的搜索。打开网页使用内置浏览器。」 |
| 主进程没有专用浏览窗。`extraResources` 只有工作区模板和图标。自动化不附着主窗。仓库无 Playwright | 新增 `desktop/electron/browser-runtime/`。一个 `BrowserWindow`，`parent` 挂主窗，三态切换，回环 CDP 网关。不往 `extraResources` 加浏览器可执行文件，不引入 Playwright |
| `desktop/src/config/links.ts` 的 `PRODUCT_LINKS.chrome` 指向 `https://www.google.com/chrome/`。引导按钮实际走的是探测结果里的 `installUrl`，这个常量目前没有第二处调用 | 删除 `PRODUCT_LINKS.chrome`。不保留一条还能接回下载页的产品链接 |
| `desktop/README.md`、官网安装页 / FAQ / 快速开始 / 下载页仍写必须安装 Google Chrome，且写明 Electron 内置不能替代 | 这些句子改成内置浏览器随应用提供。口径与 EC1 一致。docs/34 §4 没有把它们列进验收草案；本文既然改到这些句子，就按 EC1 改完 |

现网接缝（实现时按本节）：

1. **探测会把窗口拉起来。** 现网 `probeChrome()` 只做文件和注册表检查，不启动进程。本期 `probeBuiltinBrowser()` 调用 `ensureBuiltinBrowser()`。引导里的「重新检测」因此可以再试一次创建窗口和网关。这是有意的副作用。Node / OpenCode / OfficeCLI 仍是只读探测，不在这次检测里下载或安装。
2. **调试开关来不及在 `app.whenReady` 之后再开。** Electron 34 的 `remote-debugging-port`、`remote-debugging-address`、`remote-allow-origins` 必须在 `app.whenReady()` 之前 `appendSwitch`。写在 `desktop/electron/main.ts` 顶层，由 `browser-runtime/cdp-gateway.ts` 导出函数。写在 `whenReady` 回调里等于没开。
3. **给 MCP 的地址和 Electron 自己的调试端口不是同一个。** Electron 的 `--remote-debugging-port` 会列出进程里全部 webContents，包括主界面。US-EC-02 的 `chrome-devtools` 只准连接网关地址。探测的 HTTP 检查也打网关，不打内部端口。
4. **主界面那扇窗的 webContents 不是浏览页。** 浏览页是专用窗里的 `WebContentsView`。网关的 `/json/list` 只返回这一页。
5. **设置和首次引导共用 `useOnboarding().runProbe` → `probeEnvironment`。** 不要在 `SettingsView.vue` 再写一套 Chrome 文案。
6. **时间线和引导主说明会给用户看。** 探测 `detail`、引导按钮、业务引导详情、标题栏入口、官网这几处，不写 MCP、`scored`、`chrome-devtools`、Google Chrome 下载链。诊断信息（`diagnostic`，现网 `DiagnosticDetails`）可以写端口、HTTP 状态和异常原文，供排障。

---

## 1. 与 US-EC-02 的分工

| 内容 | 归谁 |
|------|------|
| 专用窗、三态、跟主窗显隐、回环网关、`getBrowserUrl()`、探测与引导文案、标题栏入口、安装说明里的 Chrome 句子 | **本故事** |
| `opencode.json` 去掉 `--isolated`、运行时把启动参数改成 `--browserUrl`、`runAgentPreflight`、技能和 `agent-runner` 提示、未装系统 Chrome 时画像与 R1 / R2 / R3 仍能开网页 | **US-EC-02** |

本故事不要求 `chrome-devtools` 已经连上，也不要求画像或探索已经打开过网页。窗口和网关按 §4 导出，US-EC-02 只调用，不另做一扇窗。

---

## 2. 已确认选型

EC1～EC8 与 O1～O3 按需求锁定，实现按下表，不再选择策略。O1～O3 与 US-EC-02 是同一组决定。

| 项 | 决定 |
|----|------|
| **EC1** | 未安装系统 Google Chrome，不得再让本故事的探测失败。不查 `chrome.exe`、注册表 App Paths、PATH 上的 `chrome` |
| **EC2** | 浏览器是 Electron 自带 Chromium 上的专用窗。用户不必另装系统 Chrome |
| **EC3** | 标签、说明、就绪判定是内置浏览器。失败有明确错误，并写明可以「重新检测」或重启应用。失败不得是 `ok` |
| **EC5** | 不做一键安装系统 Chrome。不新增下载、静默安装或引导安装 |
| **EC6** | 不读写、不迁移系统 Chrome 的扩展、多 Profile、书签。不改系统默认浏览器。登录、充值、帮助外链仍走现网 `shell.openExternal` / `openProductLink` |
| **EC7** | 不改 Node、OpenCode、OfficeCLI 的探测、一键安装、`userData` 私有目录和 prefs |
| **EC8** | 实现落在 `dev-0.5.9` 系分支。平台验收以 Windows 为准。不关 Issue #78 |
| **O1 形态** | 专用 `BrowserWindow`。不附着主界面业务窗的 webContents，不嵌进 Vue DOM，不做主界面内嵌 WebView 侧栏。`parent` 挂主窗。开 remote debugging / CDP。仓库不引入 Playwright |
| **O1 窗口** | 三态同一扇 `BrowserWindow`：缩略（默认，约 360×240，贴主窗右上角）、状态卡片（同一扇缩到 360×40 的条，标题 · URL · 展开，不断开 CDP）、放大（接近当前工作区全屏，只有用户手动进入）。默认 `showInactive`，不抢焦点。禁止默认落在主窗右下角。主窗最小化、隐藏、恢复时浏览窗同步显隐；主窗销毁或应用退出时浏览窗关掉并停下网关。用户可拖、可在三态间切换。收起后由标题栏按钮唤起 |
| **O1 状态卡片** | 不是一套 Vue 组件。条上的标题、URL 和按钮是这扇窗里的本地静态页 `caption.html`，与主界面的 Vue 树无关 |
| **O2** | 模块目录写死为 `desktop/electron/browser-runtime/`。本故事负责把网关 URL 从 `getBrowserUrl()` 交出去。MCP 名仍是 `chrome-devtools`，启动参数改接由 US-EC-02 完成。探测本身不调用 MCP |
| **O3** | 不把独立 Chromium 打进 `extraResources`。复用 Electron 自带 Chromium（现网 `desktop/package.json` 的 `electron` ^34）。更新跟着现有应用更新通道，不新开浏览器更新清单，不改 `latest.json` 的结构。本故事不单独升级 Electron |
| **探测 id** | `builtin-browser`。废弃 `chrome` |
| **版本** | 不关 #78。本文 PR 只加详设 |

### 2.1 三态（同一扇窗）

| 态 | 何时 | 外框 | 页面 | CDP |
|----|------|------|------|-----|
| **缩略** `thumbnail` | 默认。创建成功后的第一态。标题栏「打开浏览窗」也回到这一态 | 360×240。贴主窗右上角，边距 12。算法见本节下文 | 可见。标题条高 40，页面视口 360×200 | 连接保持 |
| **状态卡片** `card` | 用户点「收起」，或在非退出路径上试图关掉这扇窗 | 360×40。同一锚点。40 与标题条同高，页面被裁在条外 | `WebContentsView` 保持创建。不 `destroy`、不导航到空白、不拆调试会话。条上只显示标题、URL、「展开」「放大」 | 连接保持。进入此态前对页面做 `Emulation.setDeviceMetricsOverride`（宽 360、高 200），并 `setBackgroundThrottling(false)`，避免缩成条之后快照变成一条缝 |
| **放大** `expanded` | 只有用户点「放大」或在缩略态双击标题条 | 当前显示器工作区各边内收 48，居中。不是操作系统的 `setFullScreen(true)`，也不走系统最大化 | 可见。标题条仍高 40，页面视口为外框减去这 40 | 连接保持。设备度量改成这一视口 |

三态都 `resizable: false`。拖的是位置，不拖出第四种尺寸。从放大回到缩略用标题条上的「还原」。双击标题条：卡片 → 缩略，缩略 → 放大，放大 → 缩略。

默认位置算法写死：

```ts
const THUMB = { width: 360, height: 240 }
const CARD = { width: 360, height: 40 }
const MARGIN = 12

function anchorTopRight(
  main: { x: number; y: number; width: number; height: number },
  size: { width: number; height: number },
  workArea: { x: number; y: number; width: number; height: number },
) {
  let x = main.x + main.width - size.width - MARGIN
  let y = main.y + MARGIN
  x = Math.max(workArea.x, Math.min(x, workArea.x + workArea.width - size.width))
  y = Math.max(workArea.y, Math.min(y, workArea.y + workArea.height - size.height))
  return { x, y, width: size.width, height: size.height }
}
```

`y` 取主窗顶边加边距。禁止把默认 `y` 写成 `main.y + main.height - size.height`（那是右下角，会挡住右侧 Agent 输出）。主窗贴着屏幕右缘时，夹紧到工作区内，只为了整扇窗还看得见；夹紧之后仍然从右上角往左让，不改到主窗下沿。

用户拖动过后记 `detached = true`，主窗再移动或改变大小时不再抢回右上角。切换三态时重新按上式锚住（放大态除外，放大态永远按工作区居中，并清掉 `detached`）。显隐跟主窗，跟 `detached` 无关。

### 2.2 不抢焦点、跟主窗、收起入口

- 创建参数：`show: false`、`parent: mainWindow`、`modal: false`、`skipTaskbar: true`、`frame: false`、`focusable: true`（用户要点标题条上的按钮）、`backgroundColor` 用实色，避免缩小时闪白。
- 第一次显示和之后的程序显示都调用 `showInactive()`。这条路径上不调用 `focus()`、`show()`。
- 用户自己点到这扇窗时，系统可以把它变成焦点。那是用户动作。
- 主窗 `minimize`：浏览窗 `hide()`，记下隐藏前是可见的。
- 主窗 `restore`：若隐藏前可见，按当前态 `showInactive()`。
- 主窗 `hide`（关闭进托盘）：同样隐藏并记下。
- 主窗 `show`：主窗未最小化且记下的是可见，则 `showInactive()`。
- 主窗 `move` / `resize`：未 `detached` 且不是放大态时，重新 `anchorTopRight`。
- 主窗 `closed` 或应用 `before-quit`：允许浏览窗真正关闭，停网关。`parent` 会随主窗销毁而关子窗；退出路径上仍显式 `destroy` 并停网关，避免托盘隐藏和真正退出搞混。
- 非退出时用户触发浏览窗 `close`（例如 Alt+F4）：`preventDefault`，切到状态卡片，不销毁 webContents。
- 标题栏入口写死在 `desktop/src/components/layout/TitleBar.vue`，放在现有 `RuntimePopover` 左侧。引导层和探索页都不是常驻入口：引导会关掉，探索页在录入页生成画像时看不见。不新建「状态卡片」Vue 组件。

| 浏览窗 | 按钮文字 | 点击 |
|--------|----------|------|
| 未显示 | 打开浏览窗 | 切到缩略并 `showInactive()` |
| 状态卡片 | 浏览中 | 切到缩略并 `showInactive()` |
| 缩略或放大，且可见 | 浏览中 | `moveTop()` 后 `showInactive()`，不改尺寸 |

按钮不写 MCP、不写 Google Chrome。

---

## 3. 流程

### 3.1 启动与探测

```mermaid
sequenceDiagram
  participant Main as main.ts
  participant RT as browser-runtime
  participant Gate as 回环网关
  participant UI as 引导环境步

  Main->>Main: ready 之前绑定 127.0.0.1 空闲端口并 appendSwitch
  Main->>Main: createWindow
  Main->>RT: ensureBuiltinBrowser
  RT->>Gate: 监听 127.0.0.1 网关端口
  RT->>RT: 创建专用窗，页面打开令牌地址
  RT->>Gate: /json/list 只认这一页
  UI->>RT: probeBuiltinBrowser
  alt 窗未销毁且网关 /json/version 200
    RT-->>UI: status ok，内置浏览器已就绪
  else 失败
    RT-->>UI: status error，带重新检测或重启说明
  end
```

顺序固定：

1. `main.ts` 在 `app.whenReady()` 之前：`reserveLoopbackPort()` 得到内部端口，然后 `installRemoteDebuggingSwitch(port)`。三个开关：`remote-debugging-port`、`remote-debugging-address=127.0.0.1`、`remote-allow-origins=http://127.0.0.1:<内部端口>`。端口只绑 `127.0.0.1`。
2. `await createWindow()` 之后、`bootstrapOpenCode()` 之前：`await ensureBuiltinBrowser()`。探测若发生在这一步之前（渲染进程已经能调 IPC），`probeBuiltinBrowser()` 自己会再调 `ensureBuiltinBrowser()`。
3. 网关先听 `127.0.0.1:0`，记下实际端口。这就是 `getBrowserUrl()`，形如 `http://127.0.0.1:43123`，无末尾斜杠。主机写 `127.0.0.1`，不写 `localhost`。
4. 创建专用窗。页面 `WebContentsView` 的 partition 为内存分区 `ftcs-builtin-browser`（不要 `persist:` 前缀，退出即丢）。不要指向系统 Chrome 的 User Data。
5. 页面首先打开 `http://127.0.0.1:<网关端口>/__ftcs_builtin_page__`。网关返回一份空 HTML。在内部调试端口的目标列表里用这个 URL 认走目标 id，然后 `/json/list` 只留它。3 秒内认不到，本次不就绪。
6. 窗创建成功后以缩略态 `showInactive()`。

内部端口在 `ready` 之后不能改。内部 `/json/version` 起不来时，重新检测再试一次（间隔 200ms）。仍失败则 `detail` 要求重启应用。窗口创建失败或网关没听上，重新检测再走一遍 `ensureBuiltinBrowser()`。

### 3.2 跟窗

实现放在 `follow-main-window.ts`，监听 §2.2 的主窗事件。托盘「显示主窗口」走现网 `showMainWindow`（`restore` + `show` + `focus` 主窗）。浏览窗只在对应的 `show` / `restore` 里 `showInactive()`，不把焦点从主窗再抢走。

### 3.3 探测项

`EnvProbeItem.id` 的联合类型在这三处一起改：`desktop/electron/onboarding/env-probe.ts`、`desktop/electron/ipc/types.ts`、`desktop/src/types/onboarding.ts`。删掉 `'chrome'`，加上 `'builtin-browser'`。

| 字段 | 就绪 | 窗不在 | 窗在但网关不通 |
|------|------|--------|----------------|
| `id` | `builtin-browser` | 同左 | 同左 |
| `label` | 内置浏览器 | 同左 | 同左 |
| `status` | `ok` | `error` | `error` |
| `detail` | 内置浏览器已就绪 | 内置浏览器没有打开。请点「重新检测」。 | 内置浏览器暂时连不上。请点「重新检测」。若仍失败，请重启应用。 |
| `installUrl` | 不设置 | 不设置 | 不设置 |
| `optional` | 不设置 | 不设置 | 不设置 |
| `diagnostic` | 可空 | 异常原文 | 网关 URL、HTTP 状态或超时毫秒、异常原文 |

判定函数写死在 `readiness.ts`，探测只把事实喂给它：

```ts
export function judgeBuiltinBrowserReady(input: {
  windowAlive: boolean
  versionHttpStatus: number | null
  webSocketDebuggerUrl: string | null
}): { status: 'ok' | 'error'; detail: string }
```

两条同时成立才是 `ok`：

1. `windowAlive === true`（专用 `BrowserWindow` 已创建且 `isDestroyed() === false`）。看不见也算活着，例如主窗最小化时被同步隐藏。
2. 对 `getBrowserUrl() + '/json/version'` 的 GET，在 1500ms 内 HTTP 200，且 JSON 里的 `webSocketDebuggerUrl` 是非空字符串。

缺一条就是 `error`。窗还在但端口不通，不得因为「窗存活」而标 `ok`。端口通但窗已销毁，也不得标 `ok`。可见性、三态、系统里有没有 `chrome.exe`，都不参与。

`probeEnvironment().ok` 仍是「每个非 optional 项的 `status === 'ok'`」。本项失败则用户可以点现网已有的「继续（仍有缺失）」，也可以点「重新检测」。不得把按钮改成下载。

### 3.4 失败与重试

| 现象 | 用户看见的 | 再试 |
|------|------------|------|
| 主窗还没有 | `detail` 用「内置浏览器没有打开。请点「重新检测」。」 | 主窗出现后重新检测会创建 |
| 创建窗口抛错 | 同上，徽章「异常」 | 「重新检测」再调用 `ensureBuiltinBrowser()` |
| 网关或内部调试端口不通 | 「内置浏览器暂时连不上。请点「重新检测」。若仍失败，请重启应用。」 | 先再试一次；内部开关已错过 `ready` 的，只能重启应用 |
| 两条都成立 | 「内置浏览器已就绪」，徽章「就绪」 | 不出现下载按钮 |

「重新检测」就是环境步已有的 `runProbe` → `probeEnvironment`。不新增第二个按钮，不打开外部链接。

失败时 `probe.ok` 为 false。环境步主按钮保持现网「继续（仍有缺失）」。不得在失败时把 `status` 写成 `ok` 来放行。

### 3.5 引导和设置上的句子

| 位置 | 现网 | 改成 |
|------|------|------|
| 环境步浏览器行标题 | Google Chrome | 内置浏览器（来自 `label`） |
| 行说明 | 未检测到 Google Chrome。画像抓站与探索打开网页需要本机 Chrome。或 exe 路径 | §3.3 的 `detail` |
| 行按钮 | 打开 Chrome 下载 | 不渲染该按钮 |
| 徽章 | 缺失 | 异常（`error`）或 就绪 |
| `TOUR_STEPS` 探索 `detail` | 在「探索」页开始找客户。需要可用的搜索和 Chrome。 | 在「探索」页开始找客户。需要可用的搜索。打开网页使用内置浏览器。 |
| 步骤 1 副标题 | 安装以下组件后即可使用。 | 保持。Node 与智能体服务仍要安装。浏览器这一行自己说明是内置的 |
| 设置「打开环境与配置引导」 | 打开同一引导 | 不改按钮文字，不另做清单 |

[US-COPY-03](US-COPY-03-首次设置引导文案.md) 写过「Chrome 行保持 Google Chrome。安装逻辑不改。」以及探索详情里的「需要可用的搜索和 Chrome」。那两句被本故事替代。本文不修改 US-COPY-03 文件。

### 3.6 安装说明句子

用户会看到的安装前提改成下面的字。不要留「Electron 内置浏览器不能替代」。

| 文件 | 现网要点 | 改成 |
|------|----------|------|
| `desktop/README.md` 前置条件第 2 条 | Google Chrome（Electron 内置浏览器不能替代） | **内置浏览器**（随应用自带，用于画像抓站与探索打开网页。不需要另装 Google Chrome） |
| 同文件「安装包使用方前置」第 1 条 | Node.js 22+、Google Chrome 已安装 | **Node.js 22+** 已安装。打开网页使用应用内置浏览器 |
| `website/content/docs/install.md` 依赖表 Chrome 行，以及「并从开始菜单能正常打开 Google Chrome」 | 必须安装并可启动；内置不能替代 | 删掉表里的 Google Chrome 行。检查命令那段只保留 `node -v`。另起一节「内置浏览器」：画像抓站和探索打开网页使用应用自带的浏览器，不必另装 Google Chrome。删掉整节「Google Chrome」和 `https://www.google.com/chrome/` |
| `website/content/docs/getting-started.md` 第 2 步 | 并安装 Google Chrome | 按首次引导一键安装 Node.js 与智能体服务。打开网页使用内置浏览器，见安装与前置 |
| `website/content/docs/faq.md` 标题「画像 / 探索时报浏览器或 chrome-devtools 相关错误」及下面三条 | 确认已安装 Google Chrome；内置不能代替；更新 Chrome | 标题改为「画像 / 探索时内置浏览器报错」。三条改为：在环境检测里看「内置浏览器」是否就绪，未就绪则点「重新检测」；仍失败则重启应用；人机验证或登录墙仍停下，不要绕过。社媒发现不打开社媒真页这句保留 |
| `website/src/views/DownloadView.vue` | 使用前请在本机准备 Node.js 22+、Google Chrome 与 OpenCode CLI | 使用前请在本机准备 Node.js 22+ 与 OpenCode CLI。打开网页使用应用内置浏览器，不必另装 Google Chrome |
| `website/src/content/docs-index.ts` 安装页 `seoTitle` / `description` | Node、Chrome 与 OpenCode；列举 Google Chrome | `seoTitle` 改为「外贸获客系统安装 \| Node 与 OpenCode」。`description` 去掉 Google Chrome，改为写内置浏览器随应用提供 |

`docs/09-Node.js一键安装方案.md` 里「不安装 Google Chrome」与 EC1 一致，不改。

---

## 4. 模块与接口

### 4.1 目录

写死为 `desktop/electron/browser-runtime/`。

| 文件 | 职责 |
|------|------|
| `index.ts` | 对外：`ensureBuiltinBrowser`、`getBuiltinBrowserStatus`、`getBrowserUrl`、`setBuiltinBrowserMode`、`showBuiltinBrowserInactive` |
| `cdp-gateway.ts` | `reserveLoopbackPort`、`installRemoteDebuggingSwitch`、网关 HTTP/WebSocket |
| `builtin-browser-window.ts` | 创建窗、标题条、三态尺寸、页面 view |
| `follow-main-window.ts` | §2.2 的显隐和锚点 |
| `readiness.ts` | `judgeBuiltinBrowserReady` |
| `types.ts` | 状态和三态枚举 |
| `caption.html` | 静态标题条。无 Vue |
| `caption-preload.ts` | 只暴露切态。页面 view 不装这段 preload |

页面 view：`nodeIntegration: false`、`contextIsolation: true`、`sandbox: true`、`webviewTag: false`。`setWindowOpenHandler` 拒绝新窗，把 http(s) 地址交给同一页面 `loadURL`。`app.on('web-contents-created')` 里，既不是主窗、也不是标题条、也不是这一页的 webContents，直接关掉。这是网关漏拦时的第二道。

标题条通过 preload 调主进程切态。页面里不注入标题条 DOM，避免快照把按钮读进画像。

### 4.2 网关

网关是过滤代理，不是另一份浏览器。

- 上游是本进程内部调试端口（只给网关用，不写进配置文件，不出现在引导 `detail` 里）。
- `GET /json/version`：转发上游字段，把 `webSocketDebuggerUrl` 改写成 `ws://127.0.0.1:<网关端口>/devtools/browser/<id>`。
- `GET /json/list` 与 `GET /json`：数组里只有浏览页那一个目标。主窗、标题条、其它目标都不在里面。
- 浏览器级 WebSocket 原样转发，但改写这几类消息：
  - `Target.getTargets`、`Target.targetCreated`、`Target.targetInfoChanged`、`Target.targetDestroyed`：丢掉浏览页以外的页面目标。
  - `Target.createTarget`：不转发成新窗。对已记住的 targetId 发 `Page.navigate`（参数里的 `url`），响应仍返回这个已有 `targetId`。
  - `Target.closeTarget`：不销毁窗，不拆调试会话。导航到空白令牌页，返回 `{ success: true }`。
- 页面级 WebSocket 只在 id 等于浏览页时转发。
- 绑定 `127.0.0.1`。不要绑 `0.0.0.0`。

`new_page` 与 `navigate_page` 都落在这一页上。同时开两页不在本故事里。后一次打开覆盖这一页。

### 4.3 状态

```ts
export type BuiltinBrowserMode = 'thumbnail' | 'card' | 'expanded'

export interface BuiltinBrowserStatus {
  ok: boolean
  windowAlive: boolean
  mode: BuiltinBrowserMode
  browserUrl: string | null
  detail: string
  diagnostic?: string
}

export function getBrowserUrl(): string | null
export function ensureBuiltinBrowser(): Promise<BuiltinBrowserStatus>
export function getBuiltinBrowserStatus(): BuiltinBrowserStatus
```

`getBrowserUrl()` 在网关尚未听上时返回 `null`。US-EC-02 用它拼 `--browserUrl`。本故事的探测不读 MCP 状态。

### 4.4 渲染进程入口

IPC（名字写进 `desktop/electron/ipc/types.ts`）：

| 通道 | 方向 | 作用 |
|------|------|------|
| `builtin-browser:get-state` | 渲染进程拉取 | `{ alive, visible, mode, title, url }` |
| `builtin-browser:show` | 渲染进程调用 | §2.2 表格的点击 |
| `builtin-browser:set-mode` | 标题条调用 | `'thumbnail' \| 'card' \| 'expanded'` |
| `builtin-browser:state` | 主进程推送 | 态或可见性变化时刷新标题栏按钮 |

`url` 给标题栏按钮不必展示。标题条上的 URL 来自页面 `did-navigate` / `page-title-updated`，经主进程推到 `caption.html`。尚无业务导航时，标题为「内置浏览器」，URL 位置写「尚未打开页面」。

### 4.5 用户可见文案集中表

下面这些字符串是定稿。实现时原样使用。

| 场景 | 字符串 |
|------|--------|
| 探测就绪 | 内置浏览器已就绪 |
| 窗不在 | 内置浏览器没有打开。请点「重新检测」。 |
| 连不上 | 内置浏览器暂时连不上。请点「重新检测」。若仍失败，请重启应用。 |
| 行标题 | 内置浏览器 |
| 标题栏，窗未显示 | 打开浏览窗 |
| 标题栏，卡片或已显示 | 浏览中 |
| 标题条按钮 | 收起、展开、放大、还原 |
| 业务引导探索详情 | 在「探索」页开始找客户。需要可用的搜索。打开网页使用内置浏览器。 |

这些字符串里不出现：MCP、scored、chrome-devtools、Google Chrome、`https://www.google.com/chrome/`。

---

## 5. 文件清单

下表是**开发时预期会动**的现网文件。**本详设不改这些文件，交开发。**

| 文件 | 预期动作 |
|------|----------|
| `desktop/electron/browser-runtime/*` | 按 §4 新建 |
| `desktop/electron/main.ts` | `ready` 前安装调试开关；`createWindow` 之后、`bootstrapOpenCode` 之前 `ensureBuiltinBrowser`；注册 §4.4 的 IPC；退出时关浏览窗 |
| `desktop/electron/onboarding/env-probe.ts` | `probeChrome` 换成 `probeBuiltinBrowser`。删除 `chromeCandidates`、`CHROME_INSTALL_URL` 及注册表 / PATH 查找 |
| `desktop/electron/ipc/types.ts` | id 联合类型；新 IPC 名 |
| `desktop/src/types/onboarding.ts` | 同上 id；`TOUR_STEPS` 探索详情 |
| `desktop/src/components/onboarding/OnboardingOverlay.vue` | 删除 `item.id === 'chrome'` 的「打开 Chrome 下载」分支 |
| `desktop/src/components/layout/TitleBar.vue` | §2.2 的文字按钮 |
| `desktop/src/config/links.ts` | 删除 `PRODUCT_LINKS.chrome` |
| `desktop/README.md` | §3.6 |
| `website/content/docs/install.md` | §3.6 |
| `website/content/docs/getting-started.md` | §3.6 |
| `website/content/docs/faq.md` | §3.6 |
| `website/src/views/DownloadView.vue` | §3.6 |
| `website/src/content/docs-index.ts` | §3.6 |

建议单测放在 `desktop/electron/browser-runtime/readiness.test.ts`（及网关过滤的纯函数测试）。测试文件不在本详设里修改。

**明确不改**：

- `docs/34-需求-Electron自带Chromium替代系统Chrome.md`
- `docs/design/US-COPY-03-首次设置引导文案.md`（被替代的两句以本文为准，不回头改那份文案稿）
- `docs/19` 正文、`docs/09`
- Node / OpenCode / OfficeCLI 的探测函数和一键安装
- `runAgentPreflight`、技能、`opencode.json`、`agent-runner.ts`（US-EC-02）
- `desktop/package.json` 的 `extraResources` 与 `electron` 版本
- 登录、充值、帮助的系统浏览器打开方式

开发若同时改了 `workspace/config` 或 `workspace/skills`，那是 US-EC-02 的文件清单，并要按仓库约定升 `WORKSPACE_TEMPLATE_VERSION`。本故事单独落地时不碰那些目录，不必为了本故事升版本。

---

## 6. 验收对照

对照 `docs/34` 的 US-EC-01 验收句。下列步骤是实现之后的单测或手工验收。**本 PR 不写代码，这里不声称已通过。**

### 6.1 建议单测

| # | 用例 | 期望 | 需求 |
|---|------|------|------|
| T1 | `windowAlive true`，HTTP 200，`webSocketDebuggerUrl` 非空 | `status ok`，`detail` 为「内置浏览器已就绪」 | §3.3 |
| T2 | `windowAlive false`，HTTP 200 | `error`，「内置浏览器没有打开。请点「重新检测」。」 | 两条同时成立 |
| T3 | 窗活着，HTTP 500 或超时（`versionHttpStatus null`） | `error`，连不上那句 | EC3 |
| T4 | 窗活着，HTTP 200，`webSocketDebuggerUrl` 空串 | `error` | §3.3 |
| T5 | 源码审查 `env-probe.ts` | 无 `chrome.exe`、无 `App Paths`、无 `CHROME_INSTALL_URL`、无 `findOnPath('chrome')` | EC1 |
| T6 | 过滤函数输入含主窗 URL 与令牌页 URL | 输出只有令牌页那一条 | O1 |
| T7 | `Target.createTarget` 的处理 | 返回已有 targetId，不新增 BrowserWindow 计数 | §4.2 |
| T8 | 锚点：主窗在工作区右下仍有空间 | `y === main.y + 12`，不是贴主窗底边 | O1 禁止右下角 |

### 6.2 手工

| # | 需求句 | 步骤 | 期望 |
|---|--------|------|------|
| M1 | 未装系统 Chrome 时，探测不再因找不到 chrome.exe 而 missing | Windows 上卸载或改名系统 Chrome，打开引导环境步 | 浏览器行标题「内置浏览器」。没有「未检测到 Google Chrome」，没有「打开 Chrome 下载」，没有谷歌下载链接。徽章不是「缺失」 |
| M2 | 就绪 | 窗已创建且网关可访问 | 徽章「就绪」，说明「内置浏览器已就绪」。`probe.ok` 在 Node 与智能体服务也就绪时为 true |
| M3 | 失败有明确错误，可重试，不把失败显示成就绪 | 关掉网关或在调试开关失败的构建上打开引导 | 徽章「异常」，说明含「重新检测」或「重启应用」。整次探测不是 ok。点「重新检测」会再跑一遍；能恢复的情况变成就绪 |
| M4 | 设置与首次引导同一结果 | 设置里点「打开环境与配置引导」 | 仍是环境步，同一行文案，没有第二套「请安装 Google Chrome」 |
| M5 | 三态同一扇窗，默认右上、不抢焦点 | 冷启动后看浏览窗 | 约 360×240，在主窗右上角，不在右下角。主窗标题栏仍是焦点。点「收起」变成条，标题和 URL 还在，点「展开」回到缩略。点「放大」接近全屏且不是盖住整个系统的独占全屏。收起和放大时用调试端口看到的仍是同一 target |
| M6 | 跟主窗 | 最小化主窗、从托盘恢复；关闭进托盘再打开；退出应用 | 浏览窗一起消失、一起以原态回来。退出后进程里不再留着这扇窗。恢复时焦点在主窗 |
| M7 | 入口 | 收起后看标题栏 | 有「浏览中」。点击后回到缩略。引导里没有另一套卡片组件 |
| M8 | Node / OpenCode / OfficeCLI 不变 | 对照改前的一键安装和探测文案 | 按钮仍是「一键安装 / 重新准备 / 重新安装」。OfficeCLI 仍是 optional。不出现安装系统 Chrome |
| M9 | 外链仍走系统浏览器 | 设置里打开充值或帮助 | 仍是系统默认浏览器，不是这扇专用窗 |
| M10 | 安装说明不再把系统 Chrome 写成硬前置 | 看 README、官网安装、FAQ、快速开始、下载页 | 无「内置不能替代」，无 Chrome 下载按钮。FAQ 标题里没有 chrome-devtools |
| M11 | 本故事不要求画像已经能开网页 | 代码审查 | `opencode.json` 可以仍由 US-EC-02 去改。本故事的验收不跑探索。若 US-EC-02 未合入，MCP 仍可能去拉系统 Chrome，不作为 M1～M10 的失败 |
| M12 | 不关 #78 | 本变更说明 | 关联写法是 Related #78 |

§6 的第 1 条（干净环境走完画像和探索）要等 US-EC-02 一起才算需求级通过。本故事对应第 2 条里的引导与探测，以及失败可重试。

---

## 7. 不做什么

| 项 | 说明 |
|----|------|
| 用本故事验收画像抓站、R1 / R2 / R3 | US-EC-02 |
| 改 `runAgentPreflight`、技能、`agent-runner.ts`、`opencode.json` | US-EC-02 |
| 一键安装、下载、静默安装系统 Google Chrome | EC5 |
| 读写系统 Chrome 的扩展、Profile、书签，或改默认浏览器 | EC6 |
| 把登录、充值、帮助改到专用窗里 | EC6 |
| 把 Node / OpenCode 打进主安装包，或改 OfficeCLI 安装 | EC7 |
| 往 `extraResources` 再放一份 Chromium，或新开浏览器更新通道 | O3 |
| 引入 Playwright，或让 MCP 附着主界面 webContents | O1 |
| 主界面内嵌 WebView 侧栏，或一套 Vue 状态卡片组件 | O1 |
| 默认把窗放在主窗右下角 | O1 |
| 缩成条或隐藏时拆掉 CDP、销毁页面 view | O1 |
| 探测失败仍返回 `ok` 或 `missing` | EC3 |
| 单独升级 Electron | 沿用现网 ^34，除非另有发版故事 |
| 改 R2 不打开社媒真页、R3 不打开地图真页 | 本故事不改技能 |
| 关闭 #78、合 `main`、打 tag | EC8 |
| 在本详设 PR 里改业务代码或 `docs/34` | 文件清单交开发 |

---

## 8. 风险

| 风险 | 缓解 |
|------|------|
| 只改了按钮文案，探测仍查 `chrome.exe` | M1、T5。函数换成 `probeBuiltinBrowser`，判定只走 `judgeBuiltinBrowserReady` |
| 用「窗在」或「端口通」单独一条就标就绪 | T2、T3。两条同时成立 |
| `remote-debugging-port` 写出主界面，MCP 将来连到这个内部端口 | 内部端口不进 `getBrowserUrl()`。网关列表只有浏览页。US-EC-02 只许使用网关 URL |
| `Target.createTarget` 在 Electron 里弹出第二扇窗 | 网关改写成在同一页导航。`web-contents-created` 关掉名单外的 webContents。T7 |
| 缩成条后快照只有一条缝，自动化在收起时抓不到正文 | 进入卡片前固定设备度量 360×200，并关掉背景节流。不销毁 view |
| 子窗 `show()` 抢走引导或主界面焦点 | 程序路径只用 `showInactive()`。M5、M6 |
| 默认锚点被写成右下角，挡住 Agent 输出 | `anchorTopRight` 的 `y` 锁在主窗顶边。T8、M5 |
| 托盘隐藏主窗后子窗还留在桌面上 | `hide` 上显式隐藏。M6 |
| Alt+F4 把页毁了，调试会话断开 | 非退出的 `close` 改成切到卡片 |
| 引导徽章把 `error` 显示成「缺失」，用户以为要安装 | 失败状态只用 `error`。现网 `statusLabel` 对 `error` 已是「异常」 |
| `PRODUCT_LINKS.chrome` 留着，下次又被接上按钮 | 删除常量。M1 |
| 官网和 README 仍写必须安装 Chrome | §3.6、M10 |
| 内部调试端口被本机其它进程连上，从而看见主界面 | 只绑 `127.0.0.1`，不写进用户主说明。这是本机回环暴露，不在引导里提供该端口 |
| 端口在「先占用再交给 Electron」的空档被抢走 | 探测失败并要求重启应用，不回退去启动系统 Chrome |
| Windows 防火墙因监听端口弹出提示 | 监听地址是回环，不改为 `0.0.0.0` 来“消提示” |
| 内存分区里留下登录态 | 分区名 `ftcs-builtin-browser` 不带 `persist:`，退出进程即丢。不使用系统 Chrome 目录 |

---

## 9. 修订记录

| 日期 | 说明 |
|------|------|
| 2026-10-21 | 初稿。对齐 docs/34 的 EC1～EC8 与已锁 O1～O3。基线 `dev-0.5.9`（`3b49463`）。核对 `probeChrome`、`OnboardingOverlay.vue` 环境步、`PRODUCT_LINKS.chrome`、README 与官网安装说明。专用窗与回环网关目录 `desktop/electron/browser-runtime/`。探测 id `builtin-browser`。状态：待评审。不关 #78。 |
