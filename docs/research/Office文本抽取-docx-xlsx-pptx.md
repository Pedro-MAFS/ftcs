# 技术预研：docx / xlsx / pptx 文本抽取

> **状态**：预研（未编码）  
> **背景**：US-I-01～08 已落地；生成时 Office/图片仍跳过。规划 [17 §4.3](../17-下一阶段-业务效率工具.md) 要求「生成前抽成文本、原件保留、单文件失败可跳过、不另做 Agent 必调的 file-parser MCP」。  
> **本期预研范围**：`.docx`、`.xlsx`、`.pptx`（你指定的三种）。`.pdf` / `.xls` / 老 `.doc` / `.ppt` 只作对照，不作为第一刀 Must。  
> **文档位置**：`docs/research/`

---

## 1. 结论（先看这段）

| 问题 | 结论 |
|------|------|
| 能不能做 | **能。** 三种都是 OOXML（zip + XML），Node 侧有成熟抽取库，不必装本机 Office。 |
| 放哪抽 | **桌面主进程、拷进 `inputs/` 时同步抽**（与 17 已拍板一致）。Agent / Skill 只读侧车文本。 |
| 推荐库策略 | **抽取引擎优先 [OfficeCLI](./OfficeCLI抽取方案.md)。** 分发与 OpenCode 对齐：**主包不内嵌，首次引导一键安装到 userData**。备选仍为 mammoth + SheetJS。 |
| 输出形态 | 每个原件旁写一份可读文本，例如 `说明.docx` → `说明.docx.txt`（或 `.md`）；`_sources.json` / Prompt 只把侧车当「可生成文本」。 |
| 失败策略 | 与 I-08 一致：单文件失败进 `skipped`，有其它资料则继续生成。 |
| 第一刀不做 | 图片 OCR、嵌入图里的字、加密文档、老 `.doc`/`.ppt`、完美还原排版、复杂公式。 |

**建议下一步**：先按 [OfficeCLI抽取方案.md](./OfficeCLI抽取方案.md) §6 做 Windows spike，同批样例对比分库；再拆 US-I 详细设计。

---

## 2. 与现网的交界

现网（I-08）在 `profile-inputs.ts`：

- 仅 `.txt/.md/.json/.csv/.yaml/.yml/.xml/.html/.htm` 拷贝并进 Agent  
- `.docx/.xlsx/.pptx/.pdf/...` → `skipped（当前不支持该格式）`

目标路径：

```text
勾选 → 展开（I-07）→ bootstrap 拷贝
  ├─ 文本：原样进 inputs/
  ├─ docx/xlsx/pptx：原件进 inputs/ + 抽出侧车文本
  └─ 仍不支持（图片等）：skipped
→ Agent Prompt 只列侧车文本（+ 原有 txt/md…）
→ profile source_inputs 记 type:file，path 指向侧车（或同时记原件 library_path）
```

不引入「Agent 必须记得调 file-parser MCP」——旧 `docs/06` 的 P2 file-parser 与本路线冲突时，以 17 §4.3 为准。

---

## 3. 格式事实

三种新格式（以及 xlsx 的兄弟）本质都是 **ZIP 包里的 XML**：

| 扩展名 | 典型内容位置 | 对画像有用的信息 |
|--------|--------------|------------------|
| `.docx` | `word/document.xml` | 说明书、报价说明、公司介绍正文 |
| `.xlsx` | `xl/sharedStrings.xml` + sheet XML | 规格表、MOQ、价格、型号 |
| `.pptx` | `ppt/slides/slideN.xml` | 展会介绍、产品卖点页上的字 |

共同风险：加密、损坏 zip、超大文件、大量嵌入媒体导致内存尖峰。Electron 主进程同步抽大文件可能卡 UI → spike 时要试「大 xlsx / 多页 pptx」并考虑超时与字节上限。

---

## 4. 库选型对比

### 4.1 分格式（推荐作默认方案）

| 格式 | 候选 | 优点 | 风险 |
|------|------|------|------|
| docx | **mammoth** `extractRawText` | 生态大、API 稳、专做 docx→文本/HTML | 只认 docx，不认老 doc |
| xlsx | **SheetJS**（npm `xlsx` 社区版，或 sheetjs CDN tgz） | 表→二维数据再拼文本很自然；可设 sheet 范围 | 许可证/发行渠道要核对；极大表要截断 |
| pptx | **自研轻量**：JSZip + 读 `ppt/slides/*.xml` 抽文本节点；或 **officeparser** | 自研可控、依赖少；officeparser 省事 | 自研要处理命名空间/备注页；万能库体积与行为需 spike |

### 4.2 「一个工具通吃」

| 方案 | 观察 | 预研态度 |
|------|------|----------|
| **OfficeCLI**（iOfficeAI） | `view text` 通吃三格式；**引导安装到 userData，不进主包**（对齐 docs/10） | **第一候选**；见 [OfficeCLI抽取方案.md](./OfficeCLI抽取方案.md) |
| `office-text-extractor` | 封装 mammoth + xlsx + pptx + pdf | JS 方案备选 |
| `officeparser` | 宣称多格式 | 体积/打包需 spike |
| `office-md` | native binding | **慎用** |

**预研建议**：spike 以 **OfficeCLI vs mammoth+SheetJS** 对照表收口；不要同时上三套实现。

### 4.3 规划里的 pdf / xls

- **pdf**：另库（如 `pdf-parse`），扫描件无字则空——与 OCR 故事分开。  
- **xls（老 Excel）**：SheetJS 部分可读；失败则 skipped +「请另存为 xlsx」。  
- **.doc / .ppt**：成本高，17 已写不做；提示转换。

---

## 5. 侧车约定（供后续详细设计拍板）

建议在预研/spike 阶段就固定一种，避免返工：

```text
inputs/绿森/户外地板/安装说明.docx          ← 原件保留
inputs/绿森/户外地板/安装说明.docx.txt      ← 抽出文本（UTF-8）
```

| 项 | 建议 |
|----|------|
| 扩展名 | `.txt`（Agent Read 最稳）；若要表格结构可对 xlsx 用 `.md` 表 |
| 空结果 | 抽到 0 字 → skipped「未能抽出文本」，不写空侧车冒充成功 |
| 大小上限 | 例如原文 > 20MB 或抽出 > 500KB → 截断并在文首注明，或 skipped |
| Prompt | `inputFiles` 只列 `*.docx.txt` / `*.xlsx.txt` / `*.pptx.txt` 与普通文本；**不要**让模型去 Read 二进制 Office |
| `_sources.json` | `source_inputs` 增加可选字段，如 `extracted_from: "…/安装说明.docx"`，便于排查 |

xlsx 文本拼法示例（spike 验证即可）：

```text
# Sheet: 规格
型号 | 尺寸 | MOQ
LSCO-1P | 140x22 | 500
```

pptx：按幻灯片顺序：

```text
## Slide 1
标题…
正文…
```

---

## 6. Spike 清单（编码故事前）

在 `desktop/` 下临时脚本或 `tsx` 单测即可，**先不要接 `bootstrapProductFromLibrary`**。

| # | 样例 | 要验证 |
|---|------|--------|
| S1 | 绿森类说明书 `.docx`（含中文） | mammoth 中文是否乱码、段落是否可读 |
| S2 | 规格/报价 `.xlsx`（多 sheet） | 是否抽到全部有用 sheet；空 sheet 是否忽略 |
| S3 | 产品介绍 `.pptx` | 是否抽到每页标题+正文；备注页要不要 |
| S4 | 加密 / 损坏文件 | 是否稳定进 skipped、不抛崩主进程 |
| S5 | 20MB+ xlsx 或 80 页 pptx | 耗时、内存；是否需要 worker / 超时 |
| S6 | electron-vite 打包后 | 所选库无原生缺失、路径可读 |

交付物：一份短表「库 × 样例 × 通过/失败原因」+ 选定依赖列表。

---

## 7. 产品故事拆分建议（预研后）

| 故事 | 范围 |
|------|------|
| US-I-09（暂名）Office 侧车抽取 | docx + xlsx + pptx；接入 bootstrap；单测 + 手工夹 |
| US-I-10（可选）PDF 文本抽取 | 另开；扫描件失败策略 |
| 更后 | OCR、xls/doc 兼容 |

pptx：规划 17 原文 Must 写的是 pdf/docx/xlsx；**本次你点名 pptx，预研认为应与 xlsx 同优先级纳入第一刀**（外贸常见展会 PPT），详细设计时写进验收即可。

---

## 8. 待你拍板的点

1. **第一刀是否含 pptx**（预研建议：含）。  
2. **侧车后缀**：统一 `.txt`，还是 xlsx 用 `.md`？  
3. **抽取引擎 + 分发**：OfficeCLI + **引导一键安装**（已倾向）；或分库 JS 开箱即用。  
4. **是否与 pdf 同迭代**：预研建议先做三件套，pdf 下一故事。  
5. OfficeCLI **是否可选依赖**（预研建议：是）。

你确认以上拍板（或改口）后，先做 spike，再写正式 `docs/design/US-I-0x-…` 并编码。
