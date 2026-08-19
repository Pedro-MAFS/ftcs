# US-I-10 生成时 Office 安装或跳过设计

> **用户故事**：[../17-需求-业务效率工具.md](../17-需求-业务效率工具.md) · US-I-10  
> **状态**：编码已落地  
> **范围**：录入页点「生成画像」时，若展开结果含 docx/xlsx/pptx 且 OfficeCLI 未就绪 → 专用弹框：**一键安装 / 跳过 Office / 取消**；复用 I-09 安装 IPC  
> **依赖**：US-I-09（`installOfficeCli`、`resolveConfiguredOfficeCli`）；US-I-07/08 生成展开与确认流  
> **联调**：装完后「含 Office 真正进画像」依赖 **US-I-11**；本故事先保证门禁与路径裁剪正确  
> **不做**：侧车抽文本（I-11）；引导依赖行安装 UI（I-09 已有）；pdf / `.doc`；静默下载  
> **文档位置**：`docs/design/`

---

## 0. 相对现网（I-09 之后）

| 现网 | **本期** |
|------|----------|
| 点生成 →（可能）合并确认 → `runGenerate` | 展开后若含 Office 且 CLI 未就绪 → **先过 Office 门禁弹框**，再进合并确认 / 生成 |
| Office 文件在 bootstrap 被标「不支持该格式」skipped | 未装时：**不再默默进生成**；用户先选装或跳过 |
| OfficeCLI 只能在引导里装 | 生成路径可直接一键安装（同一 IPC） |
| 无「本次去掉 Office 再生成」 | 跳过：从本次 `filePaths` 剔除 Office 扩展名后再走现网流 |

本故事**不改**主进程 `copyLibrarySourcesToInputs` / Skill；I-11 未上线时，装完仍生成 → Office 仍可能 skipped（见 §7）。门禁与跳过行为本故事可独立验收。

---

## 1. 已确认选型

| 项 | 决定 |
|----|------|
| **Q1 何时弹** | 展开后 `filePaths` 中存在 ≥1 个 **门禁目标扩展名**，且 `isOfficeCliReady() === false` |
| **Q2 门禁扩展名** | **仅** `.docx` / `.xlsx` / `.pptx`（小写比较）。不含 pdf、`.doc` / `.xls` / `.ppt` |
| **Q3 与合并确认顺序** | **Office 门禁在前，合并确认在后**。跳过会改 `filePaths`，须先裁剪再决定是否弹合并框 / 重算文案 |
| **Q4 弹框形态** | **新建** `OfficeCliGenerateGateDialog.vue`（三按钮 + 进度）。**不**硬扩现有两按钮 `ConfirmDialog` |
| **Q5 装成功后** | **自动继续**：关门禁 → 用**含 Office** 的路径进入「合并确认或直接 `runGenerate`」。不要求再点「继续生成」 |
| **Q6 跳过** | 从本次 `filePaths` 去掉门禁扩展名文件；`websitePaths` 不动。若去掉后 `websites + files` 皆空 → 关弹框、页面错误提示，不建 `prod_*` |
| **Q7 取消 / Esc / 点遮罩** | 不生成；清空 pending |
| **Q8 就绪探测** | 新增轻量 IPC `runtime:officecli-ready`：封装 `resolveConfiguredOfficeCli() !== null`（文件存在即可）。**不**每次跑完整 `probeEnvironment` |
| **Q9 安装** | 复用 `window.ftcs.installOfficeCli` + `onOfficeCliInstallProgress`；安装中禁用三按钮中的安装/跳过（取消是否可点：见 Q10） |
| **Q10 安装中取消** | **安装进行中禁止取消/关遮罩**（`busy`），避免半截状态难解释；失败后再可取消或跳过 |
| **Q11 非 Win x64** | 仍弹框（用户勾了 Office）；**一键安装禁用**，文案说明仅 Win64 支持；可「跳过 Office」或取消 |
| **Q12 已就绪或无 Office** | **不弹**本框，行为与现网一致 |

### 1.1 主流程（伪代码）

```text
generateProfile():
  expand = expandGenerateSelection(...)
  截断 / empty → 现网错误，return

  pending = { websitePaths, filePaths }  // 完整展开结果

  if hasOfficeGateFiles(pending.filePaths) && !(await officeCliReady()):
    open OfficeGate(pending)
    return

  proceedAfterOfficeGate(pending)   // 见下

proceedAfterOfficeGate(pending):
  if expandNeedsConfirm(pending):   // 用当前 pending 路径重算或沿用缓存的 needsConfirm
    合并确认框 → 确认后 runGenerate
  else
    runGenerate(pending)

OfficeGate:
  安装成功 → close → proceedAfterOfficeGate(原 pending，含 Office)
  跳过 → pending.filePaths = stripOffice(pending.filePaths)
         if empty(websites+files) → error「跳过 Office 后没有可生成的资料」; close; return
         close → proceedAfterOfficeGate(pending)
  取消 → close; clear pending
```

**合并确认文案**：若用户先跳过 Office，应用**裁剪后**的 paths 重新调用 `expandGenerateSelection` 不现实（勾选未变）；应在门禁前已有 expand 的 `needsConfirm` / `confirmMessage`。

更稳做法：

1. 门禁前保存完整 `ExpandGenerateResult`（含 `needsConfirm`、`confirmMessage`）。  
2. **跳过**后：若裁剪掉的 Office 文件导致「文件数变化」，合并确认文案可简化为通用一句，或对 `confirmMessage` 追加「（已跳过 N 个 Office 文件）」。  
3. **不**为跳过再跑一遍 expand（勾选集合未变，文件夹列表仍在）。

选型：**跳过时保留原 `needsConfirm`；若原需确认，确认文案末尾追加「已跳过 N 个 Word/Excel/PPT 文件。」；若跳过后变空则不进确认。**

装成功：用原始 expand 的 confirm 文案，不追加。

---

## 2. 目标与非目标

### 2.1 目标

1. 未装 OfficeCLI 却勾了 Office → 明确三选一，不静默丢文件。  
2. 可在生成路径完成安装并继续（含 Office 路径进入后续流）。  
3. 可跳过 Office，用剩余官网/文本生成。  
4. 已装好或无 Office → 零打扰。

### 2.2 非目标

| 不做 | 归属 |
|------|------|
| `view text` 侧车、改 Prompt / Skill | US-I-11 |
| 引导清单里的安装行 | US-I-09（已落地） |
| pdf 门禁或抽取 | 另故事 |
| 安装失败自动改走跳过 | 用户自己点跳过 |
| 把 Office 门禁与合并确认合成一个巨型对话框 | 两步更清晰 |

---

## 3. 界面

### 3.1 `OfficeCliGenerateGateDialog`

| 元素 | 内容 |
|------|------|
| 标题 | `需要 OfficeCLI` |
| 正文 | `勾选资料中有 N 个 Word/Excel/PPT 文件。生成画像前需安装 OfficeCLI（约 32MB，装到本应用目录）。也可跳过这些文件，仅用其余资料生成。` |
| 主按钮 | `一键安装`（busy 时显示进度短句，如「正在下载… 45%」） |
| 次按钮 | `跳过 Office 文件` |
| 第三 | `取消` |
| 错误 | 安装失败时在面板内显示 `result.message`（可点「查看安装说明」打开 `manualUrl`） |

样式对齐 `ConfirmDialog`（遮罩 + panel + 现有 btn 类），避免新视觉体系。

### 3.2 与合并确认共存

同一时刻只开一个对话框：门禁关闭后才开合并确认。

### 3.3 非目标平台文案（安装按钮 disabled）

> 当前系统不支持一键安装 OfficeCLI（需 Windows 64 位）。可跳过这些 Office 文件继续，或取消。

---

## 4. 行为细则

### 4.1 纯函数（渲染进程，建议 `library-office.ts`）

```ts
export const OFFICE_GATE_EXTENSIONS = ['.docx', '.xlsx', '.pptx'] as const

export function isOfficeGateFile(relativePath: string): boolean
export function listOfficeGateFiles(filePaths: string[]): string[]
export function stripOfficeGateFiles(filePaths: string[]): string[]
export function hasOfficeGateFiles(filePaths: string[]): boolean
```

单测：大小写扩展名、中文路径、混合列表 strip 后剩余。

### 4.2 IPC `runtime:officecli-ready`

```ts
// 返回
{ ready: boolean }
// ready === resolveConfiguredOfficeCli() !== null
```

preload：`window.ftcs.isOfficeCliReady(): Promise<boolean>`（或返回对象，设计实现取简洁）。

可选：同时返回 `supported: boolean`（`isOfficeCliInstallSupported()`），供禁用安装按钮；也可用 `platform === 'win32'` 近似，**推荐 IPC 带 `installSupported`**，与主进程一致（含 arch）。

```ts
{ ready: boolean; installSupported: boolean }
```

### 4.3 InputView 状态

```ts
officeGateOpen: boolean
officeGateBusy: boolean
officeGateProgress: string
officeGateError: string
pendingAfterExpand: {
  websitePaths: string[]
  filePaths: string[]
  needsConfirm: boolean
  confirmMessage: string
  officeCount: number
} | null
```

`generateProfile` 改为 async（或内部 void IIFE）以便 await ready。

### 4.4 跳过空集

文案：`跳过 Office 文件后没有可生成的资料，请安装 OfficeCLI 或勾选其它资料。`

### 4.5 Agent 预检

仍在 `runGenerate` 内 `ensureAgentReady`——门禁与合并确认都在预检之前，避免装完才发现 Agent 不行时已浪费下载（可接受；不把预检提前到门禁前，以免未装用户点生成先被 Agent 打断）。

---

## 5. 文件清单

| 文件 | 动作 |
|------|------|
| `src/components/library/library-office.ts` | 新增扩展名工具 + 单测 |
| `src/components/library/OfficeCliGenerateGateDialog.vue` | 新增三按钮门禁 |
| `src/views/InputView.vue` | 接入流程 |
| `electron/runtime/officecli-paths.ts` | 已有 resolve；可导出给 ready IPC |
| `electron/main.ts` / `preload` / `ipc/types` / `electron.d.ts` | `RUNTIME_OFFICECLI_READY` |
| `docs/17` US-I-10 状态 | 详细设计已写 |

**不改**：`profile-inputs.ts`（I-11）、引导 Overlay（除非发现必须共享组件——本故事复制进度订阅即可）。

---

## 6. 验收对照（手工）

| # | 步骤 | 期望 |
|---|------|------|
| B1 | 未装 CLI，只勾 txt/网站 | **不**弹 Office 门禁；现网生成 |
| B2 | 未装 CLI，勾含 docx（可夹内） | 弹门禁；取消 → 不生成 |
| B3 | 门禁点跳过，同夹还有 md/网站 | 进入合并确认或直接生成；Office 不进本次 filePaths |
| B4 | 只勾 docx，点跳过 | 错误「跳过 Office 后没有可生成的资料」；无新 prod |
| B5 | 门禁一键安装成功 | 进度可见 → 关闭 → 含 Office 路径继续（合并确认或生成） |
| B6 | 安装失败（断网） | 面板错误；可再试 / 跳过 /（失败后）取消 |
| B7 | 已装 CLI，勾 docx | **不**弹门禁 |
| B8 | 需合并确认 + 未装 + 跳过 | 先门禁跳过，再合并确认，文案含跳过提示 |
| B9 | 非 Win64（若可测） | 安装禁用；可跳过 |

**与 I-11 联调（I-11 落地后）**

| # | 步骤 | 期望 |
|---|------|------|
| B10 | 未装 → 门禁安装 → 继续生成含 docx | 画像纳入 Office 侧车文本，而非「不支持该格式」 |

I-11 未上线时 B5 只需验证「继续时 filePaths 仍含 Office」；skipped 文案可暂时存在。

---

## 7. 与 I-11 的边界

| 本故事（I-10） | I-11 |
|----------------|------|
| 决定**是否带着 Office 路径去调用** `generateProfile` | 决定 bootstrap **如何处理**这些路径 |
| 跳过 = 渲染进程剔除路径 | 未装且误进生成 = 仍 special skipped（防呆） |
| 安装复用 I-09 | spawn `view text`、侧车、Prompt |

建议 I-11：若 `resolveConfiguredOfficeCli()` 为空且遇到门禁扩展名，skipped 文案改为「未安装 OfficeCLI」（与 I-10 互补）；本故事不改。

---

## 8. 实现顺序建议

1. `library-office.ts` + 单测  
2. IPC `officecli-ready`  
3. `OfficeCliGenerateGateDialog.vue`  
4. 改 `InputView.generateProfile` 流水线  
5. 手工 B1–B9；I-11 后再 B10  

**编码门禁**：本设计评审通过后再动代码。
