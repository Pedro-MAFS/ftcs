# US-LY-04 详细设计：布局持久化

> **用户故事**：[../39-需求-主视图多标签与布局可调.md](../39-需求-主视图多标签与布局可调.md) · **US-LY-04** · Related [#119](https://github.com/Pedro-MAFS/ftcs/issues/119)  
> **状态**：**已确认（2026-11-01）：按详设推荐。** 实现由马丰顺本人完成。不关 #119  
> **范围**：记住宽度比例、收起、占满。退出占满回到进入前的快照。没有「恢复默认」。不记标签清单  
> **依赖**：[US-LY-01](US-LY-01-三栏拖拽收起与占满.md) 的 `MainViewLayout`、拖拽松手和收起占满。冷启动打开哪一页见 [US-LY-02](US-LY-02-主视图标签与首页.md) 的 O9  
> **不做**：恢复默认；把占满写成新的 100% 比例；把标签列表写入 `ftcs-prefs.json`  
> **索引**：[US-LY-主视图多标签与布局可调.md](US-LY-主视图多标签与布局可调.md)

比例怎么算、最小宽度、状态转移在 US-LY-01。本文件只定何时写入、通道形状、校验和重启验收。

---

## 1. 写入什么

字段与 US-LY-01 相同，这里重列，避免只看本文件时对不上盘。

```ts
interface LayoutRatios {
  pipeline: number
  main: number
  agent: number
}

interface LayoutSnapshot {
  ratios: LayoutRatios
  pipelineCollapsed: boolean
  agentCollapsed: boolean
}

interface MainViewLayout {
  ratios: LayoutRatios
  pipelineCollapsed: boolean
  agentCollapsed: boolean
  fill: 'none' | 'main' | 'agent'
  beforeFill: LayoutSnapshot | null
}
```

首次没有记录时的比例：流水线 `0.2107`、主视图 `0.4857`、智能体 `0.3036`（默认窗宽下约 236 / 其余 / 340）。`fill` 为 `'none'`，`beforeFill` 为 null。像素公式以 US-LY-01 为准。

只在这些时机写：分隔条 `pointerup`、收起、展开、进入占满、退出占满。拖拽过程中不写。窗口 `resize` 只重算像素，不把夹取值写回比例。

占满时盘上的 `ratios` 仍是进入前的意图，`beforeFill` 另存一份同样的比例和收起位。退出占满读 `beforeFill`，不把 `fill` 折成 `1, 0, 0`。

---

## 2. 通道

复用 `desktop/electron/config/user-prefs.ts` 的 `readUserPrefs` / `writeUserPrefs`。`UserPrefs` 增加可选字段 `mainViewLayout`。不放进 `getSettingsSnapshot()`，设置页不出现布局分类。

| IPC 名 | 通道字符串 | 方向 |
|--------|------------|------|
| `LAYOUT_GET` | `layout:get` | `invoke`，无参数，返回 `MainViewLayout \| null` |
| `LAYOUT_SET` | `layout:set` | `invoke`，参数 `MainViewLayout`，校验后写入并返回落盘结果 |

挂载：`desktop/electron/ipc/types.ts` 加常量，`desktop/electron/main.ts` 里 `ipcMain.handle`，`desktop/electron/preload.ts` 暴露 `getMainViewLayout` / `setMainViewLayout`，`desktop/src/types/electron.d.ts` 补类型。

校验失败则丢弃这一次写入，返回盘上当前值：比例不是有限正数、和与 1 相差超过 `0.001`、`fill` 不是三态之一、`fill === 'none'` 时 `beforeFill` 必须为 null、`fill !== 'none'` 时 `beforeFill` 必须是一份合法快照。

文件不存在或字段缺失时，`layout:get` 返回 null。渲染进程用 US-LY-01 的默认值，不立刻把默认值写回去。

`WorkspaceLayout` 身体区 `v-if="layoutReady"`。`onMounted` 里先 `await getMainViewLayout()`，再显示三栏，避免先画出 236 / 340 再跳。顶栏可以先画。

损坏的 `beforeFill` 配上占满：不当成占满打开，改用默认比例、两栏展开、`fill: 'none'`。这条只覆盖读坏的文件。正常退出再打开必须能停在占满上。

---

## 3. 重启验收

完全退出进程再打开。只关到托盘再点开时，布局本来就还在，不算本故事的重启。

| 退出前 | 再打开 |
|--------|--------|
| 把流水线拖离默认 | 同一组比例。窗口尺寸不同则按新的 D 重算，最小宽度仍夹取 |
| 收起智能体 | 仍是 44px 展开条 |
| 展开后再退出 | 智能体是展开的 |
| 停在主视图占满或智能体占满，且 `beforeFill` 在 | 仍是该占满。点退出后回到进入前，不是整窗 100% |
| 打开了首页和多枚网站 | 这些枚不恢复。出现的是 US-LY-02 O9 的那一枚阶段页 |

界面上搜不到「恢复默认布局」。

---

## 4. 落地

| 文件 | 改动 |
|------|------|
| `desktop/electron/config/user-prefs.ts` | `mainViewLayout?` |
| `desktop/electron/ipc/types.ts` | `LAYOUT_GET` / `LAYOUT_SET` |
| `desktop/electron/main.ts` | `ipcMain.handle` |
| `desktop/electron/preload.ts` | `getMainViewLayout` / `setMainViewLayout` |
| `desktop/src/types/electron.d.ts` | 类型 |
| `desktop/src/components/layout/WorkspaceLayout.vue` | `layoutReady` |

本故事紧接 US-LY-01 提交。不改标签模型。

---

## 5. 修订记录

| 日期 | 说明 |
|------|------|
| 2026-11-01 | 按马丰顺要求从长文拆出。落盘口径与已确认的推荐一致。不关 #119。 |
