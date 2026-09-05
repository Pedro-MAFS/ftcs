# US-I-12 图片多模态录入设计

> **用户故事**：[../17-需求-业务效率工具.md](../17-需求-业务效率工具.md) · US-I-12  
> **状态**：编码已落地  
> **范围**：放开桌面端对图片的拦截；原图拷入 `inputs/`；OpenCode **原生 Read + 多模态模型** 提取产品信息；勾选含图时 **友好提示**（非探测）；与官网 / 文本 / Office 侧车可混合生成  
> **依赖**：US-I-08（拷贝 / skipped / `mergeSourceInputs` / 混合生成）；US-I-11（`InputFileKind`、async bootstrap 形态可复用）  
> **后续**：US-I-13 文字型 PDF 侧车（pdf 仍 `special` 直至 I-13）  
> **不做**：OCR 引擎；图片侧车 `.txt`；**Preflight 硬拦 vision**（已冻结：无通用探测手段，长期不做）；file-parser MCP；Agent 自行调外部识图 API  
> **文档位置**：`docs/design/`

---

## 0. 相对现网（I-11 之后）

| 现网 | **本期** |
|------|----------|
| `.jpg/.png/…` → `classify` 为 `special` → skipped「当前不支持该格式」 | 图片 → **`image`**：原样拷入 `inputs/`，进 `inputFiles` |
| Prompt「请用 Read 读取」= 文本语义 | 区分：**文本/Office 侧车** Read 文本；**图片** Read **多模态** |
| 只勾图片 → bootstrap 失败「没有可导入的资料」 | 只勾图片（≥1 张通过校验）→ **可启动**生成 |
| `lead-store.file_classify` 对图片返回 `special` +「需专用解析器」 | 图片返回 **`image`**，message 引导 Agent Read 多模态 |
| Skill 把 pdf/图片等列在 special，要求跳过 | Skill：**图片 Read 并合并**；pdf 仍跳过（待 I-13） |
| 无 vision 提示 | 勾选含图时录入页 **一行说明**（不阻断、不探测） |

无 Office 式可选安装、无新弹框门禁（与 I-10 不同）。

---

## 1. 已确认选型

| 项 | 决定 |
|----|------|
| **Q1 识图方式** | **不 OCR**；依赖 OpenCode Agent **原生 Read**，由当前会话模型多模态理解 |
| **Q2 侧车** | **无**。`inputFiles` / 画像 `path` 均指向 **原图** |
| **Q3 扩展名（v1）** | `.jpg` / `.jpeg` / `.png` / `.webp` / `.gif` / `.bmp`（大小写不敏感） |
| **Q4 pdf** | 仍 `special` →「当前不支持该格式」（**US-I-13** 另做） |
| **Q5 source_inputs.library_path** | 资料库相对 `files/` 的 **原图路径**（如 `绿森/地板/样品图.jpg`） |
| **Q6 profile.json path** | `data/products/{id}/inputs/…/样品图.jpg`（与 `manifest.files` 一致） |
| **Q7 Preflight** | **冻结**：**不**在 `gateAgentStart('extract-profile')` 因 vision 硬拦。行业无通用 API 可探测「模型是否多模态」，不做假检测 |
| **Q8 读图失败** | **Agent 运行时**：单张 Read 失败 → Skill 跳过该张并继续；摘要说明。桌面 bootstrap **不因 Agent 失败**回滚 |
| **Q9 单文件上限** | **不设上限**；原图原样拷贝；读图失败 / Token / 超时由 Agent / Skill 运行时处理 |
| **Q10 单次张数上限** | **不设上限**；勾选多少张就拷贝多少张 |
| **Q11 并发** | 拷贝仍同步/轻量；无抽取耗时 |
| **Q12 勾选含图时的 UI 提示** | **固定一句**（§3.2），无白名单、无探测、不读 settings |
| **Q13 mergeSourceInputs** | 图片 **不**走 Office 侧车映射；`inputsPathFor` 直接匹配 `manifest.files` 中的原图路径 |
| **Q14 工作区模板** | 同步 `workspace/skills/extract-product-profile/SKILL.md` + bump `workspace-init` 模板版本 |

### 1.1 路径约定（验收对照）

设产品 `prod_X`，资料 `绿森/地板/样品图.jpg`：

| 位置 | 值 |
|------|-----|
| `inputs/` 磁盘 | `…/inputs/绿森/地板/样品图.jpg`（**仅原件**，无侧车） |
| `_sources.json.files` / Prompt | `data/products/prod_X/inputs/绿森/地板/样品图.jpg` |
| `_sources.json.source_inputs[]` | `{ type: 'file', library_path: '绿森/地板/样品图.jpg' }` |
| `profile.json.source_inputs[]`（补齐后） | `{ type: 'file', path: 'data/products/prod_X/inputs/绿森/地板/样品图.jpg', … }` |

---

## 2. 目标与非目标

### 2.1 目标

1. 产品实拍图、宣传图可勾选并参与 **同一份** 画像（可与官网、txt、Office 混勾）。  
2. 桌面端负责 **放行 + 拷贝 + 清单**；识图由 **多模态 Read** 完成。  
3. 勾选含图时展示 **固定一句说明**（不阻断、不探测、不分通道）。  
4. 拷贝失败 → skipped；其余资料仍可生成。  
5. `lead-store.file_classify` 与桌面 `classifyInputFile` **口径一致**。

### 2.2 非目标

| 不做 | 归属 |
|------|------|
| OCR / 图片转 txt 侧车 | 本故事明确不做 |
| PDF | US-I-13 |
| 压缩/转码图片 | 第一刀原样拷贝 |
| 录入页缩略图预览 | 可选后续 |
| Preflight 因 vision 硬拦 | **已冻结不做**（无通用探测手段） |
| 自动把 GIF 拆帧 | v1 整文件交给模型 |

---

## 3. 界面

### 3.1 无新弹框

不像 I-10 Office 门禁：**不**新增「安装 / 跳过」对话框；图片无额外运行时。

### 3.2 勾选含图时的说明（录入页）

**前提**：无通用手段探测模型是否多模态；**不做** Preflight 硬拦。

当 `filePaths` **含 ≥1 图片** 时，在「生成画像」按钮附近展示 **固定一句**（常量，全员相同）：

> 将交给智能体 Read 图片；请使用支持读图的模型，失败时可换模型或补充 txt/官网。

- **不**禁用「生成画像」按钮。  
- **不**读通道 / 模型配置，**不**维护白名单。  
- **不**在 `agent-preflight.ts` 增加任何 vision 相关项。  
- Office 门禁弹框逻辑不变。

### 3.3 生成结果

- 成功且 bootstrap 有 skipped → 现网 `（跳过：…）`  
- 仅图片且全部超限/超张数 → 与现网相同：`没有可导入的资料`  
- Agent 读图失败 → 时间线 / 助手摘要中可见；若最终仍写出画像（靠其它资料），桌面 **仍算成功**（与 I-08 一致）

---

## 4. 行为细则

### 4.1 分类（主进程 + lead-store）

**桌面** `profile-inputs.ts`：

```ts
export type InputFileKind = 'supported' | 'office' | 'image' | 'special' | 'unknown'

// .jpg .jpeg .png .webp .gif .bmp → 'image'
// .docx .xlsx .pptx → 'office'
// .pdf / .doc / .xls / .ppt 等 → 'special'（pdf 待 I-13）
```

**lead-store** `file-types.ts`：

```ts
export type FileSupportStatus = 'supported' | 'office' | 'image' | 'special' | 'unknown'
```

- 新增 **`IMAGE_EXTENSIONS`** 常量（与 `library-image.ts` 一致）。  
- `file_classify` 对 `image` 返回：`message: "图片文件，请用 Read 多模态读取并提取产品信息。"`（或 null，由 Skill 主述）。  
- **office** 可选在 lead-store 单独列出（现网 docx 仍在 special；I-12 可顺带把 lead-store 与桌面 **office 口径对齐**，但 **非本故事必验收**——若改动面大，I-12 只动 image 分支，office 仍 special 由桌面预处理侧车）。

> **编码建议**：I-12 至少保证 **image** 在 lead-store 与桌面一致；office 在 lead-store 仍为 special **可接受**（桌面已侧车，Agent 很少再 classify 原件）。

### 4.2 共享常量（渲染 + 主进程）

新建 **`desktop/electron/library/library-image.ts`**（或 `profile/profile-image.ts`）与 **`desktop/src/components/library/library-image.ts`**：

```ts
export const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'] as const

export function isImageFile(relativePath: string): boolean
export function listImageFiles(paths: readonly string[]): string[]
export function hasImageFiles(paths: readonly string[]): boolean
```

与 `library-office.ts` 相同：**两处各一份常量，注释互指**，不跨进程 import。

### 4.3 拷贝（`copyLibrarySourcesToInputs`）

对每个 `filePaths` 项，在 `supported` / `office` 分支之外增加 **`image`**：

```text
image →
  mkdir；copyFile 原件 → inputs/…/样品图.jpg
  inputFiles.push(storedInputPath)
  sourceInputs.push({ type:'file', library_path: 原件 stored 相对路径 })
```

- **不**调用 OCR / 不读像素。  
- 损坏/无权限 → skipped，文案与现网文件拷贝一致。  
- `special`（含 pdf）/ `unknown` → 仍 skipped「当前不支持该格式」。

网站书签、Office 分支 **不变**。

### 4.4 勾选含图提示（录入页）

**不新增** settings / IPC 模块。文案为 **常量**，建议：

- `desktop/src/config/copy.ts`（或 `InputView.vue` 内联常量）：

```ts
export const IMAGE_INPUT_HINT =
  '将交给智能体 Read 图片；请使用支持读图的模型，失败时可换模型或补充 txt/官网。'
```

`InputView.vue`：当 `hasImageFiles(expand.filePaths)` 为 true 时，在生成按钮区展示 `IMAGE_INPUT_HINT`（`hint-line` 样式即可）。

**明确不做**：Preflight vision 检查；模型白名单；按通道分支文案。

### 4.5 Prompt（`buildPrompt`）

调整「输入文件」段与执行要求：

```text
输入文件（已复制到 inputs/）：
- 文本 / Office 侧车：请 Read 读取文本内容
- 图片（jpg/png 等）：请 Read **多模态**识别画面中的产品、规格、卖点，并入画像
- 网站书签不要当说明书

执行要求增补：
6. 列表中的 .jpg/.png/.webp 等为图片，须用 Read 多模态理解，不要当纯文本打开。
7. 某张图片 Read 失败时跳过该文件并继续，勿停止整次生成；在汇报中说明。
（原 Office 第 5 点序号后移）
```

`inputFiles` 列表 **同时含** 文本路径、Office 侧车路径、**原图路径**。

### 4.6 `mergeSourceInputs` / `inputsPathFor`

- 图片：`inputsPathFor(manifest, library_path)` **不**追加 `.txt`；在 `manifest.files` 中找 endsWith 原图路径。  
- Office 侧车逻辑 **不变**。  
- 单测：图片 `library_path` → 原图 `path`；Office 仍 → 侧车。

### 4.7 Skill（`extract-product-profile`）

更新 **Step 1 / 输入分流**：

| 类型 | 行为 |
|------|------|
| `supported` | Read 文本 |
| `office`（若 classify 到原件） | 桌面已侧车；Read 侧车路径（现网） |
| **`image`** | **Read 多模态**，提取可见文字与产品信息，合并进画像 |
| `special`（pdf 等） | **跳过**，继续 |
| `unknown` | 跳过 |

- 删除或改写「特殊文件含图片」的整段旧文案。  
- **仅图片、无官网无文本**：允许执行；Read 全部图片后组装画像；若全部 Read 失败 → 提示用户补充 txt 或官网。  
- `source_inputs`：每个成功读取的图片一条 `type: file`，`path` 为 inputs 下 **原图** 路径。

同步 **`desktop/electron/config/workspace-init.ts`** 模板版本，使新 workspace 拿到新 Skill。

### 4.8 与 I-10 / I-11 关系

| 场景 | 期望 |
|------|------|
| 图片 + txt | 均进 `inputFiles`；Prompt 区分读法 |
| 图片 + Office（已装 CLI） | Office 侧车 + 原图 |
| I-10 跳过 Office 后只剩图片 | 允许生成（固定说明仍显示） |
| 图片 + pdf | pdf 仍 skipped；图片正常 |

---

## 5. 文件清单

| 文件 | 动作 |
|------|------|
| `electron/library/library-image.ts` | 新增扩展名工具 |
| `src/components/library/library-image.ts` | 渲染进程镜像 |
| `src/components/library/library-image.test.ts` | 单测 |
| `electron/profile/profile-inputs.ts` | `image` 分类；拷贝 + 限额 |
| `electron/profile/profile-inputs.test.ts` | 图片拷贝、超限、混勾 |
| `electron/profile/profile-sources.ts` | 确认图片不经侧车映射（通常无需改逻辑，补单测） |
| `src/views/InputView.vue` | 勾选含图时展示 `IMAGE_INPUT_HINT` |
| `src/config/copy.ts`（可选） | 常量 `IMAGE_INPUT_HINT` |
| `electron/opencode/agent-runner.ts` | `buildPrompt` 文案 |
| `workspace/mcp-servers/lead-store/src/file-types.ts` | `image` 状态 |
| `workspace/mcp-servers/lead-store/src/index.ts` | `file_classify` message |
| `workspace/skills/extract-product-profile/SKILL.md` | 图片分支 |
| `electron/config/workspace-init.ts` | bump 模板版本 |
| `docs/testdata/library-files/两家公司资料库测试用例.md` | T8 等更新 |
| `docs/17` US-I-12 状态 | 详细设计已写 |

**MCP**：改 lead-store 后需 `npm run build:mcp` + 模板同步（发版或 `prepare:template`）。

---

## 6. 验收对照

### 6.1 手工

| # | 步骤 | 期望 |
|---|------|------|
| C1 | 只勾 `样品图.jpg`（模型支持读图） | 生成成功；`inputs/` 有原图；Prompt 含该路径；画像有产品相关字段 |
| C2 | 图片 + 官网书签 + txt | `source_inputs` 含 website + file（原图 path） |
| C3 | 图片 + docx（CLI 已装） | 侧车 + 原图均在 `inputFiles` |
| C4 | 单张大图（如 >10MB） | 仍拷入 `inputs/`；Agent 读失败时可跳过 |
| C5 | 一次勾多张图（如 30+） | 全部拷入 `inputs/`；Agent 按 Skill 逐张 Read，失败可跳过 |
| C6 | 勾选含图片 | 生成按钮可点；显示固定说明：「将交给智能体 Read 图片；请使用支持读图的模型，失败时可换模型或补充 txt/官网。」 |
| C7 | 混勾 pdf + jpg | pdf skipped；jpg 正常 |
| C8 | 中文路径 `绿森/宣传图.png` | 拷贝与 path 正确 |

### 6.2 自动化

- `library-image`：扩展名识别  
- `profile-inputs`：image 原样拷贝、skipped 文案（仅格式/IO 失败）  
- `profile-sources`：图片 `inputsPathFor`  
- lead-store `classifyInputFile`：`image` vs `special(pdf)`

---

## 7. 实现顺序建议

1. 常量 + `classifyInputFile`（桌面 + lead-store）+ 单测  
2. `copyLibrarySourcesToInputs` 图片分支 + bootstrap 用例更新  
3. `buildPrompt` + Skill + workspace 模板 bump  
4. InputView 固定说明（`IMAGE_INPUT_HINT`；**不**改 agent-preflight）  
5. MCP build + 手工 C1–C8  

**编码门禁**：本设计评审通过后再动代码。

---

## 8. 风险与后续

| 风险 | 缓解 |
|------|------|
| 模型实际不支持 image part | 固定说明 + Skill 读失败可跳过；运行时 Agent 摘要可见 |
| 大图占 Token / 超时 | 桌面端不设大小/张数上限；读失败由 Skill 跳过；后续可压图 |
| GIF 多帧 | v1 整文件交给模型；效果差再拆故事 |

**后续故事**：US-I-13 PDF；录入页图片缩略图。
