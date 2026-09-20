# US-N-01 详细设计：任务完成通知服务与设置

> **用户故事**：作为外贸业务员，我希望在设置里开关任务完成通知，并在系统允许时收到 Windows 通知，以便按自己的习惯决定是否被提醒。  
> **范围**：主进程通知模块（展示 / 未聚焦判定 / 编排抑制闸门）；`ftcs-prefs` 开关；Settings IPC + 设置页「通知」分类 UI；点击通知聚焦主窗口。  
> **依赖**：[22-需求-任务完成Windows通知.md](../22-需求-任务完成Windows通知.md) N1、N3～N5、N7；US-N-01 验收要点。  
> **不在本期**：单步 Agent `done` 挂钩（**US-N-02**）；编排整段结束发通知的调用点（**US-N-03**，仅预留抑制闸门 API）。  
> **文档位置**：`docs/design/`

---

## 0. 相对现网

| 现网 | **本期（N-01）** |
|------|------------------|
| 无系统通知；`app.setAppUserModelId('com.ftcs.desktop')` 已设 | 主进程 `Notification` 封装；点击 focus 主窗口 |
| prefs 有行文风格等，无通知开关 | `taskDoneNotificationEnabled`（默认 true） |
| 设置无「通知」分类 | 新增侧栏分类与开关区块 |
| Agent `done` 只推渲染进程 | **本期不改** `done` 路径；模块供 N-02/N-03 调用 |

---

## 1. 目标与非目标

### 1.1 目标

1. 可测的主进程 API：按开关 + 未聚焦（+ 可选编排抑制）决定是否弹 Windows 通知。  
2. 设置可开关，默认开启，重启仍有效。  
3. 点击通知 → 主窗口 `show` + `focus`。  
4. 通知不可用或展示失败 → **静默**，不抛到任务流。

### 1.2 非目标

| 不做 | 归属 |
|------|------|
| 在 `emitAgentEvent` / `type:'done'` 处自动弹 | **US-N-02** |
| `executePlan` 开始/结束调用通知 | **US-N-03**（本详设只预留 `setWorkflowNotifySuppressed`） |
| 点击后路由到业务页 | 明确不做（N4） |
| 托盘常驻、定时唤醒、macOS 专项 | docs/22 非范围 |
| 应用内 Toast 替代系统通知 | 不做 |

---

## 2. 已确认选型（Q 表）

| 项 | 决定 |
|----|------|
| **Q1 存储** | **`userData/ftcs-prefs.json`** 字段 `taskDoneNotificationEnabled?: boolean`。缺省 / 非法 → **视为 `true`（默认开）**。**不**进工作区 `.env`（与行文风格相同：本机 UI 偏好，非 Agent 密钥） |
| **Q2 IPC 字段名** | `taskDoneNotificationEnabled: boolean`（Snapshot 必有；SaveInput 可选，省略则不改） |
| **Q3 发通知进程** | **仅主进程** `electron.Notification` |
| **Q4 未聚焦判定** | 主窗口不存在或已销毁 → **不弹**（无处可 focus，也避免幽灵通知）。否则：`!win.isFocused() \|\| win.isMinimized()` 为 true 才允许弹（N1） |
| **Q5 服务内再判** | `showTaskDoneNotification` **内部**再次检查：开关、抑制闸门、N1、`Notification.isSupported()`；调用方不必重复（可重复无害） |
| **Q6 编排抑制** | 模块级内存 flag `workflowNotifySuppressed`（默认 false）。`setWorkflowNotifySuppressed(true/false)` 供 N-03；**抑制为 true 时 `show*` 直接 no-op**。进程重启清零 |
| **Q7 文案** | 标题固定 **`FTCS·外贸获客智能体`**；正文由调用方传入 `body`（≤约 200 字，模块内截断到 180 码位 + `…`）。成败由 `ok: boolean` 区分时，可在正文前由调用方自行写「已完成」/「失败」；模块 **不**强制改写 body，可选在 Windows toast 无额外图标区分 |
| **Q8 UI 位置** | 设置侧栏新增分类 **「通知」**（`id: notifications`），置于「开发信」与「工作区」之间；单区块一个开关 |
| **Q9 保存交互** | 与现网一致：改开关后点页头「保存设置」落盘 |
| **Q10 AppUserModelId** | 沿用现网 `com.ftcs.desktop`（`main.ts` 已设）；详设不新增 |
| **Q11 隐私** | N-01 不解析业务数据；调用方（N-02/N-03）勿把完整客户邮箱塞进 `body`（docs/22 §8） |
| **Q12 多通知叠压** | 不维护队列；连续调用以系统行为为准。编排抑制保证串跑中不连弹 |

---

## 3. 数据模型

### 3.1 `ftcs-prefs.json`（增量）

```json
{
  "workspaceRoot": "...",
  "taskDoneNotificationEnabled": true
}
```

| 字段 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `taskDoneNotificationEnabled` | `boolean` | 缺省 = **开启** | `false` 显式关闭；其它非 boolean 当缺省处理 |

### 3.2 解析

```ts
export function resolveTaskDoneNotificationEnabled(raw: unknown): boolean {
  if (raw === false) return false
  return true // true / undefined / 其它
}
```

### 3.3 Settings IPC

**`SettingsSnapshot` 增加：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `taskDoneNotificationEnabled` | `boolean` | 解析后的当前值（永不缺省） |

**`SettingsSaveInput` 增加：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `taskDoneNotificationEnabled` | `boolean \| undefined` | **省略**不修改；传入则写入 prefs |

对齐 `emailDraftStylePrompt`：显式字段更新，避免旧客户端漏传清掉。

---

## 4. 主进程模块

### 4.1 文件

| 路径 | 职责 |
|------|------|
| `desktop/electron/notify/task-done-notify.ts` | 闸门、展示、focus、抑制 flag |
| `desktop/electron/notify/task-done-notify.test.ts` | 解析默认、shouldShow 真值表、截断、抑制（mock Notification / window） |
| `desktop/electron/main.ts` | `registerMainWindowAccessor(() => mainWindow)`（或等价注入）；**不**在 N-01 改 agent done |
| `desktop/electron/config/user-prefs.ts` | `UserPrefs` 增字段 |
| `desktop/electron/settings/settings-service.ts` | snapshot / save |
| `desktop/electron/ipc/types.ts`、preload、`src/types/settings.ts`、`electron.d.ts` | 类型透传 |

### 4.2 窗口访问

`main.ts` 已有模块级 `mainWindow`。N-01 要求：

```ts
// task-done-notify.ts
type MainWindowGetter = () => BrowserWindow | null

let getMainWindow: MainWindowGetter = () => null

export function setTaskDoneNotifyMainWindowGetter(getter: MainWindowGetter): void {
  getMainWindow = getter
}
```

在 `createWindow` 成功赋值 `mainWindow` 后调用：

`setTaskDoneNotifyMainWindowGetter(() => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null))`

避免 notify 模块直接 `import { mainWindow }` 造成循环依赖。

### 4.3 公开 API

```ts
export type TaskDoneNotifyInput = {
  /** 通知正文（已由调用方写好摘要） */
  body: string
  /** 成功 / 失败，供日后扩展；本期可只影响可选前缀，默认不改 body */
  ok: boolean
}

/** 读 prefs：默认 true */
export function isTaskDoneNotificationEnabled(): boolean

/** 编排抑制：true 时 show 一律跳过 */
export function setWorkflowNotifySuppressed(suppressed: boolean): void
export function isWorkflowNotifySuppressed(): boolean

/**
 * 是否「允许展示」的纯判定（便于单测）：
 * enabled && !suppressed && supported && windowExists && (!focused || minimized)
 */
export function shouldShowTaskDoneNotification(opts: {
  enabled: boolean
  suppressed: boolean
  supported: boolean
  window: { isFocused: boolean; isMinimized: boolean } | null
}): boolean

/**
 * 尝试弹出系统通知。任何失败吞掉。
 * @returns true 表示已调用 Notification.show；false 表示被闸门跳过或失败
 */
export function showTaskDoneNotification(input: TaskDoneNotifyInput): boolean

export function focusMainWindowFromNotification(): void
```

### 4.4 `showTaskDoneNotification` 流程

```text
1. body = truncate(input.body.trim())；空 body → return false
2. if !shouldShow...(读 prefs、抑制、isSupported、主窗口状态) → return false
3. try:
     const n = new Notification({ title: 'FTCS·外贸获客智能体', body, silent: false })
     n.on('click', () => focusMainWindowFromNotification())
     n.show()
     return true
   catch → return false
```

`focusMainWindowFromNotification`：

```text
win = getMainWindow()
if !win → return
if win.isMinimized() → win.restore()
win.show()
win.focus()
```

### 4.5 `shouldShowTaskDoneNotification` 真值表（核心）

| enabled | suppressed | supported | window | focused | minimized | 结果 |
|---------|------------|-----------|--------|---------|-----------|------|
| false | * | * | * | * | * | 否 |
| true | true | * | * | * | * | 否 |
| true | false | false | * | * | * | 否 |
| true | false | true | null | * | * | 否 |
| true | false | true | ok | true | false | **否**（盯着界面） |
| true | false | true | ok | true | true | **是**（少见：聚焦但最小化） |
| true | false | true | ok | false | * | **是** |

---

## 5. 设置页 UI

### 5.1 分类

在 [`SettingsView.vue`](../../desktop/src/views/SettingsView.vue) `categories` 中插入：

```ts
{ id: 'notifications', label: '通知' },
```

顺序：… → `outreach` → **`notifications`** → `workspace` → …

### 5.2 区块文案

- 标题：任务完成通知  
- 说明：长任务结束且窗口不在前台时，弹出 Windows 系统通知。可在系统「通知和操作」中管理权限。  
- 控件：checkbox「启用任务完成通知」（绑定 `form.taskDoneNotificationEnabled`）  
- mono 标注可选：`taskDoneNotificationEnabled`

### 5.3 加载 / 保存

- `loadSettings`：`form.taskDoneNotificationEnabled = data.taskDoneNotificationEnabled !== false`（与 snapshot 一致，snapshot 已 resolve）  
- `saveSettings`：始终传入 `taskDoneNotificationEnabled: form.taskDoneNotificationEnabled`

---

## 6. 与 US-N-02 / US-N-03 的接口

| 故事 | 使用本详设 |
|------|------------|
| **US-N-02** | 在单步 Agent `done`（且非编排抑制）调用 `showTaskDoneNotification({ ok, body })`；body 用 skill/任务摘要，避免邮箱全文 |
| **US-N-03** | `executePlan` 开始 `setWorkflowNotifySuppressed(true)`；`finally` 里先 `setWorkflowNotifySuppressed(false)`，再按方案结果调用一次 `showTaskDoneNotification`（若仍需 N1，由 show 内部判定） |

**注意（N-03）**：若在 `finally` 里先解除抑制再 `show`，单步挂钩若仍同步触发需保证编排路径不再走单步 show，或解除抑制前先发整段通知再解除。推荐顺序写进 N-03 详设：

1. 方案结束（已有结果）  
2. `setWorkflowNotifySuppressed(false)`  
3. `showTaskDoneNotification(整段文案)`  
4. 期间单步 `done` 应已全部结束，无并发 show  

或：整段通知走 `showTaskDoneNotification` 的强制参数 `forceIgnoreSuppress?: never` —— **本期不增加 force**；严格用「先解除抑制再 show、且单步已结束」即可。

---

## 7. 实现清单（编码阶段）

| 层 | 改动 |
|----|------|
| prefs | `taskDoneNotificationEnabled?` |
| notify 模块 | §4 API + 单测 |
| main | 注册 `setTaskDoneNotifyMainWindowGetter` |
| settings | snapshot / save |
| IPC / 类型 | Snapshot + SaveInput |
| UI | 通知分类 + checkbox |
| package.json test 脚本 | 纳入 `task-done-notify.test.ts`（若桌面 test:library 需显式列出） |

**不改**：agent-runner `done` 发射；`useWorkflowExecute`（留给 N-02/N-03）。

---

## 8. 验收

| # | 步骤 | 期望 |
|---|------|------|
| A1 | 设置 → 通知，确认默认勾选；保存重启 | 仍为开启 |
| A2 | 取消勾选并保存 | snapshot 为 false；之后调用 `show*`（可用临时调试或单测）不弹 |
| A3 | 开启；主窗口前台聚焦；直接调 `showTaskDoneNotification` | 不弹 |
| A4 | 开启；切换到其它应用或最小化；调 `show*` | 弹出「FTCS·外贸获客智能体」+ body |
| A5 | 点击通知 | 主窗口恢复并聚焦 |
| A6 | `setWorkflowNotifySuppressed(true)` 后 `show*` | 不弹 |
| A7 | `Notification` 不可用（单测 mock） | `show*` 返回 false，无抛错 |
| A8 | N-01 单独合入 | 用户尚未因真实任务收到通知（属 N-02）；设置与模块可测 |

---

## 9. 风险与缓解

| 风险 | 缓解 |
|------|------|
| Windows 专注助手 / 用户关闭应用通知 | 产品无法绕过；设置说明指向系统通知设置 |
| 无 AppUserModelId 时 toast 异常 | 现网已 `setAppUserModelId`；验收前确认仍在 `app.whenReady` 路径 |
| mainWindow 未注入 | getter 默认 null → 不弹；createWindow 后必须注册 |
| 与 N-02 同迭代时误以为 N-01「没效果」 | A8 写明；发版说明可同迭代交付 N-01～03 |

---

## 10. 变更记录

| 日期 | 说明 |
|------|------|
| 2026-09-20 | 初稿：prefs 开关、notify 模块 API、未聚焦真值表、编排抑制闸门、设置「通知」分类；挂钩留给 N-02/N-03 |
| 2026-09-20 | 通知标题定为 `FTCS·外贸获客智能体` |
| 2026-09-20 | 编码落地；纯逻辑拆至 `task-done-notify-logic.ts` 便于单测 |
