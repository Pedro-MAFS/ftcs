# US-I-08 官网与文本混合生成设计

> **用户故事**：[../17-需求-业务效率工具.md](../17-需求-业务效率工具.md) · US-I-08  
> **状态**：编码已落地  
> **范围**：同一产品夹里官网书签 + txt/md/csv/json 生成**一份**画像；`profile.json.source_inputs` 同时带 `website` 与 `file`；仅官网、仅文本仍能生成  
> **依赖**：US-I-05（书签 `kind: website`）；US-I-07（勾选夹递归展开、拷到 `inputs/`、`_sources.json`）  
> **不做**：pdf / docx / xlsx 抽文本；图片 OCR；画像页新增来源 UI；从同一夹更新已有 `prod_*`  
> **文档位置**：`docs/design/`

---

## 0. 相对现网（I-07 之后）——用户感觉「已经实现了」

**录入到开 Agent 这条路已经通。** I-05 把书签和文件拆进 `websitePaths` / `filePaths`；I-07 勾夹会两类一起展开、一起拷进 `inputs/`，`_sources.json.source_inputs` 已能同时出现 `type: website` 与 `type: file`。Skill 也写了「两者都有 → 分别执行后合并」。勾一个「书签 + 说明书」的夹点生成，不必再做一套新 UI。

**本故事要验收的不是 `_sources.json`，是 Agent 写下的 `profile.json`。** I-07 明确把这件事留给本故事。现网抽完后字段不稳定，例如 `prod_20260818_007`：

| 已发生 | 问题 |
|--------|------|
| `_sources.json` 里同时有 website 与 file | 符合 I-07 |
| `profile.json.source_inputs` 也有两类 | 表面过关 |
| `type: file` 指向的是 `ai-utills.com.md`、`官网.md` | 这是**书签拷贝**，不是说明书 |
| 夹内 html / 无扩展名 txt / 图片 / pptx | 有的没进画像来源；Skill 仍写「遇到 special **整批停止**」 |

因此：**主路径不用重做；本故事补齐「混合时画像来源写对、特殊格式不毁掉整次生成」。**

| 现网（I-07） | **本期** |
|--------------|----------|
| 勾夹可同时带上书签 + 任意 `kind: file` 并原样拷贝 | **可生成文本**才进 `filePaths` 拷贝与 Prompt；pdf/图片等进 `skipped`，不停止整次 |
| Prompt「输入文件」= 全部 `inputFiles`（含书签 md） | 网站只出现在 URL 列表；输入文件**不含**书签 md |
| `profile.json.source_inputs` 全靠 Agent | 抽完后用 `_sources.json` **补齐**必有项；书签只记 website，不把书签 md 记成 file |
| Skill：special → 停止整次 | Skill：special / unknown **跳过该文件**，有官网或文本则继续 |

---

## 1. 已确认选型

| 项 | 决定 |
|----|------|
| **Q1 还要不要新交互** | **不要。** 勾选、确认框、拷贝目录结构沿用 I-07 |
| **Q2 验收对象** | 生成结束后的 **`profile.json.source_inputs`**。`_sources.json` 只作补齐依据，不单独再验收一遍 I-07 |
| **Q3 谁保证字段** | **不要只靠模型。** Agent 仍按 Skill 写 `source_inputs`；`runExtractProfile` 成功写入画像后，桌面端把 `_sources.json` 的官网 URL 与文本路径 **并入** `profile.json`（见 4.3）。Agent 多写的站内爬取 URL 保留 |
| **Q4 书签 md** | 继续拷到 `inputs/`（现网），但 **不算文本资料**：不进 Prompt「输入文件」，不进画像 `type: file` |
| **Q5 夹内有 Office / 图片** | **本故事不抽取。** 拷贝时跳过，`skipped` 写清「当前不支持该格式」；若跳过后仍有 ≥1 个网站或 ≥1 个可生成文本 → **继续生成**。抽文本归后续 Office 故事 |
| **Q6 仅官网 / 仅文本** | 与混合同一套收尾逻辑；`source_inputs` 只有对应那一类即可 |
| **Q7 画像页** | **不**展示 `source_inputs` 列表 |

可生成文本扩展名与 lead-store `file-types.ts` 对齐：`.txt` `.md` `.json` `.csv` `.yaml` `.yml` `.xml` `.html` `.htm`。其余走 skipped（含无扩展名、pdf/docx/xlsx/ppt/图片）。

---

## 2. 目标与非目标

### 2.1 目标

1. 夹内至少 1 个网站书签 + 1 个可生成文本，勾该夹（或同时勾这两类节点）生成一份画像。  
2. 该画像 `source_inputs` **同时**含 `type: website`（书签 URL）与 `type: file`（文本在 `inputs/` 下的路径）。  
3. 只有官网、或只有文本，也能生成。  
4. 夹里多放了 pdf/图片时，不因 Skill「整批停止」而失败。

### 2.2 非目标

| 不做 | 归属 |
|------|------|
| pdf / docx / xlsx / ppt 抽文本、图片 OCR | 另开 Office 故事；本故事只跳过 |
| 侧栏按资料夹成树、同一夹更新旧 `prod_*` | 17 §12.3 |
| 画像编辑页展示来源 | 现网没有，本故事不加 |
| 改就绪度公式 | 现网 lead-store 计算不变 |

---

## 3. 界面

无新控件。生成结果仍：

- 成功 → 侧栏新产品、跳转画像页（现网）  
- 有跳过项 → 现网 `（跳过：…）`  
- 跳过后 0 网站且 0 文本 → 不保留空 `prod_*`（现网 bootstrap 已 `rmSync`），提示没有可导入的资料

---

## 4. 行为细则

### 4.1 拷贝（`copyLibrarySourcesToInputs`）

网站书签循环不变。

普通文件循环增加分类（扩展名，不读内容）：

- **supported** → 按 I-07 相对路径拷贝，写入 `files` / `source_inputs.type: file`  
- **special / unknown** → 不拷贝，`skipped` 增加 `{相对路径}（当前不支持该格式）`  
- 仍是网站书签却进了 `filePaths` → 现网已跳过「请按网站书签勾选」

`BootstrapResult.inputFiles` **只含 supported 文本**，不含书签 md。`websiteUrls` 仍来自书签。

跳过全部文件但还有网站 → 只走网站分支（允许）。跳过全部且无网站 → 抛错并删掉刚建的 `prod_*`。

### 4.2 Agent Prompt（`buildPrompt`）

```text
公司网站 URL：
- https://…

输入文件（已复制到 inputs/，请用 Read 读取；网站书签不要当说明书）：
- data/products/{id}/inputs/绿森/地板/说明.md

执行要求：
…有网站则探索；有文件则读取。两类都有则合并进同一份画像。
source_inputs 必须记录：每个官网 URL 一条 type:website；每个文本一条 type:file（path 用上面的 inputs 路径）。
不要把 inputs 里的网站书签 md 写成 type:file。
特殊格式不要调用 file_classify 后停止整次；桌面端已跳过。
来源清单：…/_sources.json
```

Skill `extract-product-profile` 同步改：

- Step 1「两者都有 → 合并」写明 `source_inputs` 两类都要有  
- special / unknown：**跳过该文件并继续**，不再整批停止  
- 示例增加「网站 + 文本」；删掉 text-file 示例里「special → 停止」作为混合路径的唯一结局（可注明 Office 故事再抽取）

### 4.3 抽完后补齐 `profile.json.source_inputs`

在 `runExtractProfile` 已读到画像（Agent `product_save` 成功）之后、发 `done` 之前，调用纯函数 `mergeSourceInputs(profileSourceInputs, sourcesManifest)` 写回 `profile.json`。

补齐规则：

1. **必有 website**：`_sources.json.source_inputs` 里每条 `type: website` 的 `url`，画像中至少一条 `{ type: "website", url }`。已有则保留原 `crawled_at`；没有则补一条（`crawled_at` 可用清单 `created_at`）。  
2. **必有 file**：每条 `type: file` 对应 `_sources.json.files[]` 里那条 `inputs/` 路径，画像中至少一条 `{ type: "file", path }`。没有则补（`uploaded_at` 可用清单时间）。  
3. **去掉误记的书签 file**：`path` 落在某条 website 的拷贝上（与 `files[]` 中书签 md 相同，或 `_sources` 里同 `library_path` 的 type 是 website）→ 从 `type: file` 里删掉。  
4. **保留额外 website**：Agent 写入的其它爬取 URL 仍留在数组里。  
5. 不改 `company` / `products` 等业务字段。手工草稿（`type: manual`）不走本函数。

这样验收不依赖模型有没有把说明书写进 `source_inputs`。

### 4.4 三条路径

| 勾选 | `_sources` | 补齐后的画像 `source_inputs` |
|------|------------|------------------------------|
| 仅书签 | 仅 website | 至少那些 URL 的 `type: website` |
| 仅 txt/md/csv/json | 仅 file | 至少那些 `type: file` |
| 书签 + 文本 | 两类都有 | **两类都有**；可另有爬取 URL |

同一夹再生成仍是新 `prod_*`（I-07，不改）。

---

## 5. 须改动的文件（编码时）

| 文件 | 变更 |
|------|------|
| `desktop/electron/profile/profile-inputs.ts` | 按扩展名跳过 special/unknown；`inputFiles` 不含书签 md |
| `profile-inputs.test.ts` | 跳过 pdf/jpg；文本仍保留目录结构 |
| 新 `desktop/electron/profile/profile-sources.ts` | `mergeSourceInputs` 纯函数（无 Electron） |
| `profile-sources.test.ts` | 补齐两类、去掉书签当 file、保留额外爬取 URL |
| `profile-writer.ts` 或 runner | 抽完后读 `_sources.json`、合并、写回 `profile.json` |
| `agent-runner.ts` `buildPrompt` | 文件列表不含书签；要求两类都写入且勿整批停止 |
| `workspace/skills/extract-product-profile/SKILL.md` + examples | 混合示例；special 改为跳过 |
| `docs/17-…` | 本故事链到本文，编码后标落地 |

不新增 IPC，不改勾选/确认框。

lead-store `file_classify` 可暂时保留；桌面端先跳过，Agent 即使仍调用也不应以 special 结束整次（Skill 文案约束）。不在本故事改 MCP 实现，除非补齐逻辑放在 `product_save` 更合适——**默认放桌面 runner**，避免 Cursor 里单独跑 Skill 时误改手工草稿。

---

## 6. 验收用例

| # | Given | When | Then |
|---|--------|------|------|
| A1 | 夹内 1 个书签 + 1 个 `说明.md`，无 Office | 勾夹生成并等 Agent 结束 | `profile.json.source_inputs` 同时有 `type: website`（该书签 URL）与 `type: file`（`inputs/…/说明.md`）；**没有**把书签 md 写成 file |
| A2 | 只勾该书签 | 生成结束 | 有 website，无必填 file |
| A3 | 只勾该 md | 生成结束 | 有 file，无必填 website |
| A4 | 夹内书签 + md + `x.pdf` | 勾夹生成 | pdf 进 skipped、不拷进 `inputs`（或拷了也不当文本）；生成仍成功；画像仍同时有 website + 该 md |
| A5 | 夹内只有 pdf | 生成 | 提示没有可导入的资料；无新画像（或刚分配的 `prod_*` 被删掉） |
| A6 | `_sources.json` | 与 I-07 一致 | 仍有 `library_path`；文本 `files[]` 带子目录 |

A1 为 Must。A4 防止真实产品夹里随手丢了一个 pdf 就整次失败。

---

## 7. 编码任务顺序

1. 拷贝跳过 special/unknown + 单测；`inputFiles` 与书签拆开。  
2. `mergeSourceInputs` + 单测；接到 `runExtractProfile` 写回。  
3. 改 Prompt 与 Skill / 混合示例。  
4. 手工 A1–A4（干净夹 + 夹内多一个 pdf）；本文与 17 号文档标「编码已落地」。

---

## 8. 已确认点汇总

| # | 议题 | 决定 |
|----|------|------|
| Q1 | 是否重做录入 | **不**，沿用 I-07 |
| Q2 | 验收 | **`profile.json.source_inputs` 两类都在** |
| Q3 | 字段谁写 | Agent 写 + 桌面端用 `_sources.json` 补齐 |
| Q4 | 书签 md | 拷贝保留；不算 file |
| Q5 | Office/图片 | **跳过继续**，不抽取、不整批停止 |
| Q6 | UI | 无新界面 |
