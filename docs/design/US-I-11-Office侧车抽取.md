# US-I-11 Office 侧车抽取设计

> **用户故事**：[../17-需求-业务效率工具.md](../17-需求-业务效率工具.md) · US-I-11  
> **状态**：编码已落地  
> **范围**：OfficeCLI 已就绪时，对 `.docx` / `.xlsx` / `.pptx` 在拷贝到 `inputs/` 时抽出侧车 `.txt`，原件保留；Prompt 只列侧车与普通文本；`source_inputs` 可测；单文件失败不毁掉整次生成  
> **依赖**：US-I-08（拷贝 / skipped / `mergeSourceInputs`）；US-I-09（`resolveConfiguredOfficeCli`）；I-10 门禁保证「未装不带着 Office 路径乱进」——本故事仍做主进程防呆  
> **预研**：[../research/OfficeCLI抽取方案.md](../research/OfficeCLI抽取方案.md)  
> **不做**：pdf、`.doc` / `.xls` / `.ppt`、图片 OCR；引导安装 UI（I-09）；生成门禁弹框（I-10）；Agent 调 officecli / file-parser MCP  
> **文档位置**：`docs/design/`

---

## 0. 相对现网（I-08 / I-10 之后）

| 现网 | **本期** |
|------|----------|
| docx/xlsx/pptx → `classify` 为 special → skipped「不支持该格式」 | CLI 就绪时：**原件 + 侧车**；`inputFiles` 进侧车路径 |
| `bootstrapProductFromLibrary` 同步、纯拷贝 | 拷贝循环内对 Office **串行** `officecli view … text`（bootstrap 改为 **async**） |
| Prompt「输入文件」= 文本路径 | 增加侧车 `.docx.txt` 等；仍不含书签 md、不含未抽出的原件路径 |
| `mergeSourceInputs` 按 `library_path` 映射到 `inputs/…/同名` | Office：`library_path` 仍为**原件相对路径**；画像 `path` 映射到**侧车** |
| I-10 未装会拦在渲染进程 | 主进程若仍收到 Office 且无 CLI → skipped「未安装 OfficeCLI」（防呆） |

无新录入 UI。生成成功后的 skipped 提示沿用现网。

---

## 1. 已确认选型

| 项 | 决定 |
|----|------|
| **Q1 抽取引擎** | 仅 **OfficeCLI** `view <abs> text`；路径来自 `resolveConfiguredOfficeCli()`（I-09） |
| **Q2 扩展名** | **仅** `.docx` / `.xlsx` / `.pptx`（与 I-10 门禁一致）。`.doc` / `.xls` / `.ppt` / pdf 仍 special →「当前不支持该格式」 |
| **Q3 侧车命名** | 与原件同目录：`{原文件名}.txt`，例 `说明.docx` → `说明.docx.txt` |
| **Q4 原件** | **保留**拷贝到 `inputs/`；**不**进入 Prompt `inputFiles` |
| **Q5 Prompt / inputFiles** | 只列：**普通文本** + **侧车**。Agent Read 侧车即可 |
| **Q6 source_inputs.library_path** | **原件**相对 `files/` 的路径（如 `绿森/地板/说明.docx`），与勾选一致、便于对照资料库 |
| **Q7 profile.json path** | **侧车**的 `data/products/{id}/inputs/…/说明.docx.txt`（Agent 实际可读文本） |
| **Q8 无 CLI** | 该文件 skipped：`{rel}（未安装 OfficeCLI）`；不拷贝。有其它资料则继续 |
| **Q9 抽取失败 / 空文本** | skipped：`{rel}（Office 文本抽取失败）` 或 `（抽出文本为空）`；不留半截侧车；原件若已拷则删掉该次写入（保持 inputs 干净） |
| **Q10 超时** | 单文件 **60s**；超时当失败 skipped |
| **Q11 并发** | **串行**（第一刀） |
| **Q12 CLI 输出** | 按 **UTF-8** 写入侧车；**不做**标记剥离（如 `[/body/p[N]]`）——有噪音可后续故事再洗 |
| **Q13 bootstrap** | `bootstrapProductFromLibrary` / `copyLibrarySourcesToInputs` 改为 **`async`**；`main` 里 `generateProfile` await |
| **Q14 Skill** | Prompt 已说「特殊格式桌面端已跳过」；补一句「Office 已抽成 .txt 侧车，请 Read 列表中的路径，勿调用 officecli」。Skill 文件若仍写 special 停整次，与 I-08 一并核对改掉（本故事验收以桌面行为为准） |

### 1.1 路径约定（验收对照）

设产品 `prod_X`，资料 `绿森/地板/说明.docx`：

| 位置 | 值 |
|------|-----|
| `inputs/` 磁盘 | `…/inputs/绿森/地板/说明.docx` + `…/inputs/绿森/地板/说明.docx.txt` |
| `_sources.json.files` / Prompt | `data/products/prod_X/inputs/绿森/地板/说明.docx.txt` |
| `_sources.json.source_inputs[]` | `{ type: 'file', library_path: '绿森/地板/说明.docx' }` |
| `profile.json.source_inputs[]`（补齐后） | `{ type: 'file', path: 'data/products/prod_X/inputs/绿森/地板/说明.docx.txt', … }` |

---

## 2. 目标与非目标

### 2.1 目标

1. CLI 就绪时，三种扩展名可参与生成并进入画像来源。  
2. 可与官网、txt/md 混合；`source_inputs` 同时有 website 与 file（沿用 I-08 补齐）。  
3. 单文件失败不影响其它资料；全失败且无官网/文本 → 现网删空 `prod_*` 并报错。  
4. Agent **不必**、也**不应**依赖自行调用 officecli。

### 2.2 非目标

| 不做 | 归属 |
|------|------|
| pdf / 老 Office 格式 | 另故事 / 明确不做 |
| I-09 安装、I-10 弹框 | 已落地 |
| 编辑/渲染 PPT、改写原件 | 明确不做 |
| 抽取进度 UI | 第一刀串行即可；耗时长时仅 Agent 面板现有「启动中」 |
| 清洗 officecli 结构标记 | 可后续 |

---

## 3. 界面

无新控件。行为变化仅：

- 成功且含 Office → 跳转画像；必要时 message 带 skipped（个别失败时）  
- 仅 Office 且全部抽取失败 → 与「没有可导入的资料」相同错误

---

## 4. 行为细则

### 4.1 分类（`profile-inputs.ts`）

```ts
export type InputFileKind = 'supported' | 'office' | 'special' | 'unknown'

// .docx .xlsx .pptx → 'office'
// 原 SPECIAL 中去掉这三项；其余 pdf/图片/.doc 等仍 special
```

与渲染进程 `library-office.ts` 扩展名集合保持一致（两处常量，注释互指；不跨进程 import）。

### 4.2 抽取（新建 `profile-office-extract.ts`）

```ts
extractOfficeTextToString(absSourcePath: string, cliExe: string): Promise<
  { ok: true; text: string } | { ok: false; reason: string }
>
```

- `execFile(cliExe, ['view', absSourcePath, 'text'], { windowsHide, timeout: 60_000, maxBuffer: 16MB })`  
- stdout → string（Buffer 按 utf8）  
- `trim()` 后长度为 0 → `ok: false, reason: '抽出文本为空'`  
- 非 0 退出 / 超时 / spawn 错 → `ok: false`  

**禁止**调用 `officecli install` 或无参裸跑。

### 4.3 拷贝循环（`copyLibrarySourcesToInputs` → async）

对每个 `filePaths` 项：

```text
supported → 现网拷贝
office →
  cli = resolveConfiguredOfficeCli()
  若无 cli → skipped「未安装 OfficeCLI」；continue
  先 extract(srcAbs)（对资料库原件抽，不必先拷）
  若失败 → skipped；continue
  mkdir；copyFile 原件 → inputs/…/说明.docx
  writeFile 侧车 → inputs/…/说明.docx.txt（utf8）
  inputFiles.push(侧车 storedInputPath)
  sourceInputs.push({ type:'file', library_path: 原件 stored 相对路径 })
special/unknown → 现网 skipped「当前不支持该格式」
```

解析器在循环外解析一次即可（避免每文件重复读 prefs）。

网站书签循环不变。

### 4.4 `mergeSourceInputs` / `inputsPathFor`

当 `library_path` 扩展名为 office 门禁三类时：

1. 优先在 `manifest.files` 中找以 `/${library_path}.txt` 结尾，或等于 `data/products/…/inputs/${library_path}.txt` 的项；  
2. 否则合成 `data/products/{id}/inputs/${library_path}.txt`。

普通文本逻辑不变。

单测：office 的 library_path → 侧车 path；文本仍映射原名。

### 4.5 Prompt（`buildPrompt`）

在执行要求中增补（或改第 5 点）：

> Office（Word/Excel/PPT）已在桌面端抽成 `.txt` 侧车并列在「输入文件」中，请直接 Read；不要调用 officecli，不要因原件扩展名停止整次生成。

`inputFiles` 已不含原件路径，一般无需再改列表格式。

### 4.6 `main` 生成入口

```ts
const bootstrap = await bootstrapProductFromLibrary({ ... })
```

保持 IPC 错误信息可读（抽取阶段异常应进 skipped 或包装为业务错误，避免未捕获打崩）。

### 4.7 与 I-10 防呆关系

| 场景 | 期望 |
|------|------|
| I-10 跳过 Office | 主进程收不到 office 路径 → 无抽取 |
| I-10 安装成功后带 Office | 本故事抽出侧车 |
| 绕过 UI 直接 IPC 且无 CLI | skipped「未安装 OfficeCLI」 |
| 有 CLI 但坏文件 | 该文件 skipped，其它继续 |

---

## 5. 文件清单

| 文件 | 动作 |
|------|------|
| `electron/profile/profile-office-extract.ts` | 新增 spawn + 超时 |
| `electron/profile/profile-inputs.ts` | `office` 分类；async 拷贝 + 侧车 |
| `electron/profile/profile-bootstrap.ts` | async 转发 |
| `electron/profile/profile-sources.ts` | office → 侧车 path 映射 |
| `electron/main.ts` | await bootstrap |
| `electron/opencode/agent-runner.ts` | Prompt 文案 |
| `electron/runtime/officecli-paths.ts` | 复用 resolve（已有） |
| `profile-inputs.test.ts` / `profile-sources.test.ts` / 抽取单测 | 扩测；抽取可用假 exe 或 mock |
| 工作区 Skill `extract-product-profile`（若在 template） | 核对 special 不再整批停止；注明侧车 |
| `docs/17` US-I-11 状态 | 详细设计已写 |

---

## 6. 验收对照（手工）

| # | 步骤 | 期望 |
|---|------|------|
| C1 | CLI 已装，只勾中文路径 docx | 生成成功；`inputs/` 有原件+侧车；Prompt/画像 file path 为 `.docx.txt` |
| C2 | xlsx、pptx 各一条 | 同上 |
| C3 | 官网书签 + docx 同夹 | `source_inputs` 同时 website + file（侧车 path） |
| C4 | 空格文件名 `报价 单.xlsx` | 抽取成功或可读 skipped（不得整次崩） |
| C5 | 故意坏 zip/空文件冒充 docx | 该文件 skipped；同批 md 仍可生成 |
| C6 | 卸掉 CLI，绕过 UI（或开发直接 IPC）带 docx | skipped「未安装 OfficeCLI」 |
| C7 | 三种格式混合 + txt | 侧车进列表；txt 仍进列表；原件不进 Prompt |

自动化：分类、侧车文件名、`inputsPathFor` 映射、strip/空文本分支（mock extract）。

---

## 7. 实现顺序建议

1. `profile-office-extract.ts` + 分类常量调整  
2. async `copyLibrarySourcesToInputs` + 单测（可用 fixture 小 docx 若 CI 有 CLI；否则 mock extract 函数注入）  
3. `mergeSourceInputs` 映射 + 单测  
4. bootstrap / main await  
5. Prompt 文案  
6. 手工 C1–C7（本机已装 OfficeCLI）  

**测试注入（建议）**：`copyLibrarySourcesToInputs` 可选参数 `extractOffice?: typeof extractOfficeTextToString`，单测注入假实现，避免 CI 依赖真 exe。

**编码门禁**：本设计评审通过后再动代码。
