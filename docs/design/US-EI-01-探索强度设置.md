# US-EI-01 详细设计：探索强度设置

> **用户故事**：作为外贸业务员，我希望在设置里选择低、中、高探索强度，以便以后的扩展和探索按同一档执行。  
> **范围**：本机偏好存档位；设置页「探索」分区三选一 UI；IPC 读写与解析默认值；供后续故事读取的档位表。  
> **依赖**：[24-需求-探索强度.md](../24-需求-探索强度.md) I1～I4、I9～I12 相关存储约定；US-EI-01 验收要点。  
> **不在本期**：去掉「最多词数」（**US-EI-02**）；Places 翻页（**US-EI-03**）；扩展关键词按档出词（**US-EI-04**）；搜索条数 / 补官网次数（**US-EI-05**）；R3 Places 条数与详情上限（**US-EI-06**）。  
> **文档位置**：`docs/design/`

---

## 0. 相对现网

| 现网 | **本期（EI-01）** |
|------|-------------------|
| 无探索强度偏好；数量写死在技能 | `ftcs-prefs.json` 存 `exploreIntensity`，默认 `medium` |
| 设置「探索」区只有 R2 站点与 Places Key | 同区内增加「探索强度」三选一，改完立即落盘 |
| Agent 启动不读强度 | **本期不改** Agent / 技能；只提供可读 API，EI-04～06 再接 |

---

## 1. 目标与非目标

### 1.1 目标

1. 设置里可选 **低 / 中 / 高**，无自定义数字。  
2. 未存过或非法值 → **中**。重启后仍是所选档。  
3. **全局一份**（本机 prefs），不按产品。  
4. 只改档不触发扩展、不改写已有 `expansion.json`。  
5. 主进程有稳定解析与档位常量表，后续故事只读、不另造一份数字。

### 1.2 非目标

| 不做 | 归属 |
|------|------|
| 探索页「最多词数」删除 | **US-EI-02** |
| places-api 翻页合并 | **US-EI-03** |
| `expand-keywords` 按档目标条数 | **US-EI-04** |
| `num_results` / 补官网次数随档 | **US-EI-05** |
| R3 `pageSize` / 详情 3/4 | **US-EI-06** |
| 按产品、按轮次各存一档 | 需求非范围 |
| 改档后自动重新扩展 | 需求非范围（I4） |

---

## 2. 已确认选型（Q 表）

| 项 | 决定 |
|----|------|
| **Q1 存储** | **`userData/ftcs-prefs.json`** 字段 `exploreIntensity?: 'low' \| 'medium' \| 'high'`。缺省 / 非法 → **`medium`**。**不**进工作区 `.env`，**不**进 `data/prefs/`（与主题、通知同属本机 UI/业务偏好；R2 站点仍在工作区是因为跟产品工作区配置绑定） |
| **Q2 落盘交互** | **改完立即生效**（对齐主题 / 开机自启 / R2 站点），**不必**点页头「保存配置」。独立 IPC，**不**进入「保存配置」dirty 指纹（避免误触 OpenCode 重启） |
| **Q3 UI 位置** | 现有设置分类 **「探索」**（`id: explore`）内，**放在 R2 站点列表上方**；不新增侧栏分类 |
| **Q4 文案** | 标题「探索强度」；说明：更高会多出词、每次多看结果，耗时和费用更高；改档后须**再次扩展关键词**才影响词表，已有词与进行中的任务不自动改写 |
| **Q5 控件** | 三段式 radio / 分段按钮（与外观主题同款 `is-active`），值 `low` / `medium` / `high`，展示「低」「中」「高」 |
| **Q6 常量表** | 本故事在主进程模块落地 **完整数字表**（关键词目标、搜索条数、Places 条数等），UI 本期可只展示档名 + 短说明；EI-04～06 **必须** `import` 该表，禁止再在 Skill 里写死另一套 |
| **Q7 Snapshot** | `getSettings` 始终带回解析后的 `exploreIntensity`（永不缺省） |
| **Q8 SaveInput** | `saveSettings` **可省略**该字段；若传入则写入 prefs（兼容整页保存路径）。主路径仍是专用 `setExploreIntensity` |
| **Q9 与 dirty** | `captureSaveableFingerprint` **不含** `exploreIntensity` |
| **Q10 Toast** | 切换成功轻提示「已设为低/中/高探索强度」；失败写入设置页 `error` |

---

## 3. 数据模型

### 3.1 prefs 增量

```json
{
  "exploreIntensity": "medium"
}
```

| 字段 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `exploreIntensity` | `'low' \| 'medium' \| 'high'` | 缺省 = **medium** | 其它字符串 / 非字符串 → medium |

### 3.2 解析

```ts
export type ExploreIntensity = 'low' | 'medium' | 'high'

export function resolveExploreIntensity(raw: unknown): ExploreIntensity {
  if (raw === 'low' || raw === 'medium' || raw === 'high') return raw
  return 'medium'
}
```

### 3.3 档位常量（单源）

模块导出只读表（数字与 [docs/24](../24-需求-探索强度.md) §4.1 / I7 / I12 / I13 对齐）：

| 键 | 低 | 中 | 高 | 用途故事 |
|----|----|----|-----|----------|
| `keywordTargetPerRound` | 10 | 20 | 40 | EI-04：R1 / 每启用社媒 / R3 目标 |
| `searchNumResults` | 3 | 5 | 10 | EI-05：四处 `num_results` |
| `placesResultLimit` | 10 | 20 | 40 | EI-06：Places 要多少条 |
| `detailsRatio` | 3/4 | 3/4 | 3/4 | EI-06：详情上限 = ⌊实际返回 × 3/4⌋ |
| `resolveWebsiteRatio` | 3/4 | 3/4 | 3/4 | EI-05：补官网次数 = ⌊主结果实际返回 × 3/4⌋ |

```ts
export type ExploreIntensityLimits = {
  keywordTargetPerRound: number
  searchNumResults: number
  placesResultLimit: number
  /** 详情 / 补官网共用比例，向下取整由调用方算 */
  threeQuartersRatio: 0.75
}

export function getExploreIntensityLimits(
  intensity: ExploreIntensity = getExploreIntensity(),
): ExploreIntensityLimits
```

辅助（供 EI-05/06，本期可实现并单测，**UI 不强制展示**）：

```ts
export function floorThreeQuarters(n: number): number {
  return Math.floor(Math.max(0, n) * 0.75)
}
```

满页对照（文档用，实现可用函数算）：

| 档 | 搜索返回 → 补搜上限 | Places 返回 → 详情上限 |
|----|---------------------|------------------------|
| 低 | 3 → 2 | 10 → 7 |
| 中 | 5 → 3 | 20 → 15 |
| 高 | 10 → 7 | 40 → 30 |

### 3.4 Settings IPC

**`SettingsSnapshot` 增加：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `exploreIntensity` | `ExploreIntensity` | 解析后当前值 |

**`SettingsSaveInput` 增加：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `exploreIntensity` | `ExploreIntensity \| undefined` | 省略不改；传入则 `writeUserPrefs` |

**新 IPC：**

| Channel | 入参 | 返回 |
|---------|------|------|
| `settings:set-explore-intensity` | `intensity: ExploreIntensity` | `{ ok: true, exploreIntensity }`；非法入参 → `{ ok: false, message }` 或规范化为 medium 后 ok（**选规范化**：与 resolve 一致，始终 ok + 解析值） |

**决定**：非法入参 **规范化为 medium** 并写入，返回 `{ ok: true, exploreIntensity: 'medium' }`，避免 UI 卡死。

---

## 4. 主进程模块

### 4.1 文件

| 路径 | 职责 |
|------|------|
| `desktop/electron/explore/explore-intensity-logic.ts` | resolve / limits / floorThreeQuarters（无 Electron 依赖，可单测） |
| `desktop/electron/explore/explore-intensity.ts` | get / apply（读 prefs）并再导出 logic |
| `desktop/electron/explore/explore-intensity.test.ts` | 默认 medium、非法回退、三档数字表、3/4 取整 |
| `desktop/electron/config/user-prefs.ts` | `UserPrefs` 增字段 |
| `desktop/electron/settings/settings-service.ts` | snapshot / save 读写 |
| `desktop/electron/main.ts` | 注册 `SETTINGS_SET_EXPLORE_INTENSITY` |
| `desktop/electron/ipc/types.ts`、`preload.ts`、`src/types/settings.ts`、`electron.d.ts` | 类型与 API 透传 |
| `desktop/src/views/SettingsView.vue`、`Sidebar` 分类已有 explore | UI |
| `desktop/src/components/layout/Sidebar.vue` | 若分类列表已有「探索」则不动 |

### 4.2 公开 API

```ts
export type ExploreIntensity = 'low' | 'medium' | 'high'

export function resolveExploreIntensity(raw: unknown): ExploreIntensity
export function getExploreIntensity(): ExploreIntensity
export function applyExploreIntensity(intensity: ExploreIntensity): ExploreIntensity
export function getExploreIntensityLimits(
  intensity?: ExploreIntensity,
): ExploreIntensityLimits
export function floorThreeQuarters(n: number): number
```

`applyExploreIntensity`：`writeUserPrefs({ exploreIntensity: resolveExploreIntensity(intensity) })`，返回解析后的值。

### 4.3 settings-service

- `getSettingsSnapshot()`：`exploreIntensity: resolveExploreIntensity(readUserPrefs().exploreIntensity)`  
- `saveSettings`：若 `input.exploreIntensity !== undefined` → `applyExploreIntensity(input.exploreIntensity)`

### 4.4 与后续故事的边界

| 故事 | 如何用本模块 |
|------|----------------|
| **EI-04** | 启动 `expand-keywords` 时读 `getExploreIntensityLimits().keywordTargetPerRound`，写入 Agent 指令 |
| **EI-05** | 指令写入 `searchNumResults`；补官网上限用 `floorThreeQuarters(实际返回)` |
| **EI-06** | 指令写入 `placesResultLimit`；详情上限 `floorThreeQuarters(实际返回)` |

**EI-01 编码完成时**：UI + prefs + IPC + 单测即可；**不**改 `agent-runner` / Skill。

---

## 5. 设置页 UI

### 5.1 区块结构（`#settings-explore`）

建议顺序：

1. **探索强度**（本故事）  
2. 原有 R2 社媒站点  
3. 原有 R3 Places Key  

### 5.2 文案

- 标题：探索强度  
- mono：`exploreIntensity`  
- hint：更高会多出关键词、每次搜索与地图结果更多，耗时和费用更高。改档后需再次「扩展关键词」才影响词表；不会改已经生成的词。勾选后立即生效，不必点上方「保存配置」。  
- 可选次要说明一行（中档数字摘要，降低心智负担）：例如「中：每轮目标约 20 词；搜索每次 5 条；地图每次最多 20 条。」不必随 radio 动态切换整表（避免噪音）；若做动态，仅一行随档变化即可。

### 5.3 交互

```text
用户点选 low|medium|high
  → form.exploreIntensity = 选中值
  → invoke setExploreIntensity(选中值)
  → 成功：form 与返回值对齐；Toast 成功
  → 失败：error 文案；可选 reload snapshot 回滚
```

加载：`form.exploreIntensity = data.exploreIntensity`（snapshot 已 resolve）。

### 5.4 dirty / 保存配置

- **不**加入 `SaveableSettingsFingerprint`。  
- `onSave` 可继续带上当前 `form.exploreIntensity`（冗余但无害），或省略；推荐 **省略**，专靠即时 IPC，避免与 dirty 语义混淆。

---

## 6. 实现清单（编码阶段）

| 层 | 改动 |
|----|------|
| prefs | `UserPrefs.exploreIntensity?` |
| explore-intensity.ts | resolve / get / apply / limits / floorThreeQuarters + 单测 |
| settings-service | snapshot + 可选 save |
| IPC | `SETTINGS_SET_EXPLORE_INTENSITY`；preload `setExploreIntensity` |
| 类型 | ipc/types、settings.ts、electron.d.ts |
| SettingsView | 探索区 UI + `onExploreIntensityChange`；排除 dirty |
| docs/24 | US-EI-01 状态改为详设已立 / 编码中 |

---

## 7. 验收对照（相对用户故事）

| 验收要点 | 详设落点 |
|----------|----------|
| 低/中/高三选一，无自定义数字 | §5 radio；无数字输入框 |
| 旁边说明更高更贵更久 | §5.2 hint |
| 未存过 = 中；重启仍在 | §3.2 resolve；prefs 落盘 |
| 全局一份，不按产品 | §2 Q1 |
| 只改档不改 expansion | §1.2；无文件写入 keywords |
| 不改扩展/搜索/Places/最多词数 | §1.2 非目标 |

---

## 8. 测试计划

| # | 场景 | 期望 |
|---|------|------|
| T1 | 无 prefs 字段 | `getExploreIntensity() === 'medium'`；设置页选中「中」 |
| T2 | prefs=`"high"` | 重启后仍为高；limits.placesResultLimit===40 |
| T3 | prefs=`"foo"` / `1` / `null` | 视为 medium |
| T4 | UI 切到低 → 立即读 prefs | 文件已是 `low`；未点「保存配置」 |
| T5 | 切档后查已有 expansion.json | 文件 mtime/内容不变 |
| T6 | dirty：只切强度 | 「保存配置」仍禁用 |
| T7 | `floorThreeQuarters(10/20/40/5/3/0)` | 7/15/30/3/2/0 |

---

## 9. 修订记录

| 日期 | 说明 |
|------|------|
| 2026-09-22 | 初稿：prefs + 即时 IPC + 探索区 UI + 档位常量表；明确非目标留给 EI-02～06 |
| 2026-09-22 | 编码落地 |
