# US-I-13 文字型 PDF 侧车抽取设计

> **用户故事**：[../17-需求-业务效率工具.md](../17-需求-业务效率工具.md) · US-I-13  
> **状态**：详设已写，**编码前须完成 PDF 库 spike**（§8）  
> **范围**：`.pdf` 在 bootstrap 时用 **内置 Node 库**抽文本层 → 侧车 `{名}.pdf.txt`；原件保留；Prompt 只列侧车；与 txt / Office / 图片 / 官网可混勾  
> **依赖**：US-I-08（拷贝 / skipped / `mergeSourceInputs`）；US-I-11（侧车路径、`inputsPathFor` 模式）；US-I-12（`InputFileKind`、混勾口径）  
> **不做**：扫描 PDF OCR；图片 OCR；poppler / 额外 exe 安装流；Agent 调 file-parser MCP；加密 PDF 破解  
> **文档位置**：`docs/design/`

---

## 0. 相对现网（I-12 之后）

| 现网 | **本期** |
|------|----------|
| `.pdf` → `classify` 为 `special` → skipped「当前不支持该格式」 | `.pdf` → **`pdf`**：抽文本 → 侧车；`inputFiles` 进侧车路径 |
| 不拷 pdf 进 `inputs/` | **原件 + 侧车** 均在 `inputs/` |
| Skill / `file_classify` 对 pdf 要求跳过 | pdf 返回 **`pdf`**（或 Skill 说明读侧车）；**不再**因 pdf 单独停整次 |
| 绿森 `安装手册.pdf` 恒 skipped | 文字型 → 参与生成；扫描件 → 固定 skipped 文案 |

无新弹框、无 Preflight 门禁（与 I-12 图片不同，**不**依赖模型多模态）。

---

## 1. 已确认选型

| 项 | 决定 |
|----|------|
| **Q1 抽取引擎** | **内置 Node 依赖**（spike 首选 **`pdf-parse`**）；纯 JS、无 poppler；打进 `desktop` 主进程 bundle |
| **Q2 扩展名** | **仅** `.pdf`（大小写不敏感）。`.doc` / `.xls` / `.ppt` 仍 `special` |
| **Q3 侧车命名** | 与 Office 对齐：`{原相对路径}.txt`，例 `安装手册.pdf` → `安装手册.pdf.txt` |
| **Q4 原件** | **保留**拷到 `inputs/`；**不**进入 Prompt `inputFiles` |
| **Q5 Prompt / inputFiles** | 只列：**普通文本** + **Office 侧车** + **PDF 侧车** + **图片原图** |
| **Q6 source_inputs.library_path** | **原件**相对 `files/`（如 `绿森塑木/户外地板/安装手册.pdf`） |
| **Q7 profile.json path** | **侧车** `data/products/{id}/inputs/…/安装手册.pdf.txt` |
| **Q8 文字型判定** | 抽出文本经 **有效字符** 计数（§4.2）≥ **`PDF_MIN_EFFECTIVE_CHARS`（80）**；否则 skipped：`（未能提取 PDF 文本，扫描件暂不支持）` |
| **Q9 加密 / 损坏** | skipped：`（PDF 已加密或无法解析）`（不区分密码与结构损坏，v1 合并文案） |
| **Q10 空文本** | 与 Q8 合并处理 → 扫描件文案（有效字符 &lt; 80） |
| **Q11 单文件体积上限** | 原件 **20 MB**；超限 skipped：`（PDF 超过 20MB 上限）` |
| **Q12 抽取超时** | 单文件 **60s**（与 OfficeCLI 一致）；超时 skipped：`（PDF 文本抽取超时）` |
| **Q13 侧车体积** | 写出侧车上限 **512 KB** UTF-8；超出则截断并在文首一行注明：`[侧车已截断，仅保留前 512KB 文本]` |
| **Q14 并发** | **串行**（与 I-11 第一刀一致；bootstrap 循环内 await） |
| **Q15 抽取顺序** | **先抽后拷**：抽取失败则不写原件、不写侧车（保持 `inputs/` 干净） |
| **Q16 新 UI** | **无**；成功 / skipped 沿用现网 message |
| **Q17 mergeSourceInputs** | `library_path` 为 `.pdf` 原件时，映射到 `{path}.txt` 侧车（扩展 `inputsPathFor`） |
| **Q18 工作区模板** | 同步 Skill + bump `workspace-init` 模板版本 |

### 1.1 路径约定（验收对照）

设产品 `prod_X`，资料 `绿森塑木/户外地板/安装手册.pdf`：

| 位置 | 值 |
|------|------|
| `inputs/` 磁盘 | `…/inputs/绿森塑木/户外地板/安装手册.pdf` + `…/安装手册.pdf.txt` |
| `_sources.json.files` / Prompt | `data/products/prod_X/inputs/绿森塑木/户外地板/安装手册.pdf.txt` |
| `_sources.json.source_inputs[]` | `{ type: 'file', library_path: '绿森塑木/户外地板/安装手册.pdf' }` |
| `profile.json.source_inputs[]`（补齐后） | `{ type: 'file', path: '…/安装手册.pdf.txt', … }` |

---

## 2. 目标与非目标

### 2.1 目标

1. 电子版产品目录、说明书类 **文字型 PDF** 可勾选并进入 **同一份** 画像。  
2. 桌面端 **零额外安装**；用户无 poppler / Adobe 等依赖。  
3. 侧车行为与 **US-I-11 Office** 一致：Agent 只 Read 侧车，不调外部 PDF 工具。  
4. 单文件失败 → `skipped`；有其它资料则整次仍成功（I-08）。  
5. `lead-store.file_classify` 与桌面 `classifyInputFile` 对 pdf **口径一致**。

### 2.2 非目标

| 不做 | 归属 |
|------|------|
| 扫描件 OCR | 明确不做；skipped 文案引导换 txt 或文字型 PDF |
| 解密 / 破解密码 PDF | 明确不做 |
| pdf 内嵌图片里的字 | 不做 OCR |
| 复杂版式还原、表格结构保留 | 侧车纯文本即可 |
| 录入页 PDF 预览 | 可选后续 |
| file-parser MCP | 明确不做 |

---

## 3. 界面

### 3.1 无新控件

不像 I-10 Office：**不**新增安装 / 跳过弹框；PDF 无运行时依赖检查。

### 3.2 生成结果

- bootstrap 有 skipped → 现网 `（跳过：…）` 后缀  
- **仅 pdf** 且全部抽取失败（扫描 / 加密 / 超限）→ 与现网相同：`没有可导入的资料`  
- 混勾 txt + 扫描 pdf → txt 正常；pdf 出现在 skipped

---

## 4. 行为细则

### 4.1 分类（主进程 + lead-store）

**桌面** `profile-inputs.ts`：

```ts
export type InputFileKind = 'supported' | 'office' | 'image' | 'pdf' | 'special' | 'unknown'

// .pdf → 'pdf'
// .docx/.xlsx/.pptx → 'office'
// 图片 → 'image'
// .doc/.xls/.ppt 等 → 'special'
```

**lead-store** `file-types.ts`：

```ts
export type FileSupportStatus = 'supported' | 'office' | 'image' | 'pdf' | 'special' | 'unknown'
```

- 从 `SPECIAL_FILE_EXTENSIONS` **移除** `.pdf`。  
- `file_classify` 对 `pdf` 返回 message：`PDF 已在桌面端抽成 .txt 侧车，请 Read 侧车路径（列表中的 .pdf.txt），不要 Read 原件。`

### 4.2 有效字符（文字型判定）

```ts
/** 去掉空白后的字符数；CJK 与拉丁均计 1 */
function countEffectiveTextChars(text: string): number {
  return text.replace(/\s+/g, '').length
}
```

- `countEffectiveTextChars(extracted) < PDF_MIN_EFFECTIVE_CHARS` → 视为 **无文本层 / 扫描件** → skipped 扫描件文案。  
- spike 时用 2～3 份真实文字型目录 PDF 验证阈值 **80** 不误杀；若误杀则调至 **50**（详设冻结 **80**，spike 可提变更 PR 改常量）。

### 4.3 抽取模块（新建 `profile-pdf-extract.ts`）

```ts
export const PDF_EXTRACT_TIMEOUT_MS = 60_000
export const PDF_MAX_BYTES = 20 * 1024 * 1024
export const PDF_MIN_EFFECTIVE_CHARS = 80
export const PDF_MAX_SIDECAR_BYTES = 512 * 1024

export type PdfExtractResult =
  | { ok: true; text: string; truncated?: boolean }
  | { ok: false; reason: 'too_large' | 'timeout' | 'encrypted_or_invalid' | 'scanned' | 'empty' }

export function isPdfExtension(filePath: string): boolean
export function pdfSidecarRelPath(libraryRelPath: string): string  // `${path}.txt`，与 office 同规则

export async function extractPdfTextToString(absSourcePath: string): Promise<PdfExtractResult>
```

**实现要点（spike 通过后固化）：**

1. `stat` 大小 &gt; 20MB → `too_large`  
2. `readFile` → `pdf-parse(buffer)`（或 spike 选定 API）  
3. 整体包在 `Promise.race` + 60s 超时 → `timeout`  
4. 库抛错且 message 含 `password` / `encrypted` / `Invalid PDF` → `encrypted_or_invalid`  
5. 文本有效字符 &lt; 80 → `scanned`  
6. 侧车写入前：UTF-8 字节 &gt; 512KB → 截断 + 文首截断说明行  

**禁止**：spawn 外部进程、写临时文件到系统目录（可选 spike 写 temp 仅调试，量产不必）。

### 4.4 拷贝循环（`copyLibrarySourcesToInputs`）

在 `office` 分支之外增加 **`pdf`** 分支（**不**依赖 OfficeCLI）：

```text
pdf →
  stat 大小 > 20MB → skipped「PDF 超过 20MB 上限」；continue
  extracted = await extractPdfTextToString(srcAbs)
  失败 → 按 reason 映射 skipped 文案（§4.5）；continue
  mkdir；copyFile 原件 → inputs/…/安装手册.pdf
  writeFile 侧车 → inputs/…/安装手册.pdf.txt（utf8，可截断）
  inputFiles.push(侧车 storedInputPath)
  sourceInputs.push({ type:'file', library_path: 原件 stored 相对路径 })
```

`special` / `unknown` 不再含 pdf。

网站 / `supported` / `image` / `office` 分支 **不变**。

### 4.5 skipped 文案映射

| `PdfExtractResult.reason` / 场景 | 用户可见（括号内） |
|----------------------------------|-------------------|
| `too_large` | PDF 超过 20MB 上限 |
| `timeout` | PDF 文本抽取超时 |
| `encrypted_or_invalid` | PDF 已加密或无法解析 |
| `scanned` / `empty` | 未能提取 PDF 文本，扫描件暂不支持 |
| IO / 拷贝失败 | 沿用现网 `（${message}）` |

### 4.6 `mergeSourceInputs` / `inputsPathFor`

扩展 `inputsPathFor`：当 `library_path` 以 `.pdf` 结尾（大小写不敏感）时，候选路径与 Office 相同逻辑：

1. 优先 `manifest.files` 中 `{library_path}.txt`  
2. 否则合成 `data/products/{id}/inputs/{library_path}.txt`

可复用通用 helper：

```ts
function sidecarRelPath(originalRel: string): string {
  return `${originalRel.replace(/\\/g, '/')}.txt`
}
```

Office 现有 `officeSidecarRelPath` 可 rename 为 `sidecarRelPath` 并共用，或 pdf 模块 re-export 同实现。

单测：pdf `library_path` → 侧车 path；Office / 图片 / 文本逻辑 **不回退**。

### 4.7 Prompt（`buildPrompt`）

在「输入文件」段与执行要求中增补 PDF（与 Office 并列）：

```text
输入文件（…）：
- 文本、Office 侧车、PDF 侧车：Read 文本
- 图片：Read 多模态
…

执行要求增补：
- PDF 已在桌面端抽成 .pdf.txt 侧车并列在「输入文件」中，请直接 Read 侧车；不要 Read 原件 .pdf，不要调用外部 PDF 工具。
```

`inputFiles` **不含** `.pdf` 原件路径。

### 4.8 Skill（`extract-product-profile`）

更新 Step 1 / 输入分流：

| 类型 | 行为 |
|------|------|
| `supported` | Read 文本 |
| `office` | Read 侧车（桌面已预处理） |
| **`pdf`** | Read **`{原名}.pdf.txt` 侧车**；勿 Read 原件 |
| `image` | Read 多模态 |
| `special`（老 Office 等） | 跳过，继续 |
| `unknown` | 跳过 |

- 删除「pdf 等待解析 / 待 I-13」旧文案。  
- 示例 `text-file-input.md`：增加 PDF 侧车成功分支；扫描件 skipped 分支。

### 4.9 与 I-11 / I-12 混勾

| 场景 | 期望 |
|------|------|
| pdf + txt | 侧车 + txt 均在 `inputFiles` |
| pdf + docx（CLI 就绪） | 两路侧车 |
| pdf + jpg | 侧车 + 原图 |
| 扫描 pdf + 官网 | 官网正常；pdf skipped |
| 仅扫描 pdf | `没有可导入的资料` |

---

## 5. PDF 库 spike（编码门禁）

**未通过 spike 不得合并实现 PR。**

### 5.1 选用：`pdf-parse@2.4.5`（v2 API）

| 项 | 说明 |
|----|------|
| 许可证 | MIT |
| 形态 | 纯 JS（内部 pdf.js） |
| API | `new PDFParse({ data: buffer })` → `getText()` → `destroy()` |
| Electron | 主进程 `readFile` + parse；`electron-vite` 外置依赖 |
| 已知限制 | v1.x 无法解析现代 PDF 1.7；无 OCR；加密 PDF 抛错；复杂 CID 字体偶发乱码可接受；**侧车写入前须去掉 \\0**（OpenCode Read 遇空字节即拒读） |
| spike 记录 | [../research/PDF文本抽取-spike.md](../research/PDF文本抽取-spike.md) |

### 5.2 备选（首选失败时）

| 库 | 何时考虑 |
|----|----------|
| `pdfjs-dist`（legacy build） | `pdf-parse` 打包失败或特定 PDF 解析崩溃 |
| `pdf2json` | 文本提取质量对比 spike |

**不选**：依赖系统 poppler、`pdftotext` exe、Python 子进程。

### 5.3 spike 用例（最小）

| # | 样例 | 通过标准 |
|---|------|----------|
| S1 | 1 份真实文字型产品目录 PDF（≥2 页） | 有效字符 ≥80；侧车可读中文/英文 |
| S2 | 1 份扫描件 PDF 或 spike 内空白页扫描导出 | 有效字符 &lt;80 → 映射 `scanned` |
| S3 | 损坏 / 非 PDF 字节 | `encrypted_or_invalid` |
| S4 | Electron 主进程 `extractPdfTextToString` 跑通 | 无 native 模块加载错误 |
| S5 | 绿森夹 `安装手册.pdf` | 记录结论：若仅为占位假文件则 **不作为** S1；另找真实 PDF 测 |

spike 结论写入 `docs/research/PDF文本抽取-spike.md`（spike 完成后补；本详设 §5 为验收清单）。

---

## 6. 文件清单

| 文件 | 动作 |
|------|------|
| `desktop/package.json` | 依赖 `pdf-parse`（或 spike 选定库） |
| `electron/profile/profile-pdf-extract.ts` | 新增抽取 + 常量 + 侧车路径 |
| `electron/profile/profile-pdf-extract.test.ts` | 有效字符、reason 映射、mock 解析 |
| `electron/profile/profile-inputs.ts` | `pdf` 分类；拷贝 + 侧车分支 |
| `electron/profile/profile-inputs.test.ts` | pdf 成功 / 扫描 / 超限 / 混勾 |
| `electron/profile/profile-sources.ts` | pdf → 侧车 `inputsPathFor` |
| `electron/profile/profile-sources.test.ts` | pdf 映射单测 |
| `electron/opencode/agent-runner.ts` | Prompt PDF 侧车说明 |
| `workspace/mcp-servers/lead-store/src/file-types.ts` | `pdf` 状态 |
| `workspace/mcp-servers/lead-store/src/index.ts` | `file_classify` message |
| `workspace/skills/extract-product-profile/SKILL.md` | pdf 分支 |
| `workspace/skills/extract-product-profile/examples/text-file-input.md` | pdf 示例 |
| `electron/config/workspace-init.ts` | bump 模板版本 |
| `docs/testdata/两家公司资料库测试用例.md` | pdf 用例更新（T2 等） |
| `docs/17` US-I-13 状态 | 详设链接 + 状态 |
| `docs/research/PDF文本抽取-spike.md` | spike 完成后补结论 |

**MCP**：改 lead-store 后 `npm run build:mcp` + `prepare:template`。

---

## 7. 验收对照

### 7.1 手工

| # | 步骤 | 期望 |
|---|------|------|
| C1 | 只勾一份 **文字型** `产品目录.pdf` | 成功；`inputs/` 有原件 + `.pdf.txt`；Prompt 仅侧车；画像含 PDF 信息 |
| C2 | pdf + 官网 + txt | `source_inputs` 含 website + file（原件 library_path） |
| C3 | pdf + docx（CLI 已装） | 两路侧车均在 `inputFiles` |
| C4 | pdf + jpg（vision 模型） | 侧车 + 原图 |
| C5 | **扫描件** pdf | skipped：`未能提取 PDF 文本，扫描件暂不支持`；同批 txt 仍成功 |
| C6 | 加密 pdf | skipped：`PDF 已加密或无法解析` |
| C7 | pdf &gt; 20MB | skipped 体积文案 |
| C8 | 中文路径 `绿森/手册.pdf` | 拷贝与侧车 path 正确 |
| C9 | 绿森夹 `安装手册.pdf` | 按 spike 结论：文字型则 C1 类通过；否则 C5 |

### 7.2 自动化

- `profile-pdf-extract`：有效字符、reason、截断  
- `profile-inputs`：pdf 侧车、skipped 文案、与 office/image 混勾  
- `profile-sources`：pdf `inputsPathFor`  
- lead-store：`classifyInputFile('x.pdf') === 'pdf'`

---

## 8. 实现顺序建议

1. **Spike**（§5）→ 写 `docs/research/PDF文本抽取-spike.md`  
2. `profile-pdf-extract.ts` + 单测  
3. `classifyInputFile`（桌面 + lead-store）  
4. `copyLibrarySourcesToInputs` pdf 分支 + bootstrap 测试更新  
5. `profile-sources` + Prompt + Skill + 模板 bump  
6. 手工 C1–C9  

**编码门禁**：spike 通过 + 本设计评审通过后再动业务代码。

---

## 9. 风险与后续

| 风险 | 缓解 |
|------|------|
| `pdf-parse` Electron 打包失败 | spike 提前验证；备选 pdfjs-dist |
| 抽取乱码 | v1 接受；用户可另提供 txt |
| 超大 PDF 内存 | 20MB 上限 + 60s 超时 + 512KB 侧车截断 |
| 表格型 PDF 文本顺序乱 | 侧车仅作 Agent 参考，不追求版式 |
| 测试夹假 pdf | 手工验收另备真实文字型样例 |

**后续**：扫描 OCR；网关 / 云端预解析；录入页 PDF 页数预览。
