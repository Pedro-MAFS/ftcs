# US-I-07 递归生成画像设计

> **用户故事**：[../17-下一阶段-业务效率工具.md](../17-下一阶段-业务效率工具.md) · US-I-07  
> **状态**：编码已落地  
> **范围**：勾选文件夹后，生成时递归纳入该夹下全部文件与网站书签；多夹或夹内有子目录时先确认，仍只出一份 `prod_*`  
> **依赖**：US-I-06（文件夹可勾、跨目录勾选仍在）；US-I-05（书签 `kind: website`）  
> **不做**：Office 抽文本；按每个勾选夹各出一份画像；官网+文本混合的专项验收（I-08，但本故事须让「夹内书签 + 文件」展开后仍能走现网生成）  
> **文档位置**：`docs/design/`

---

## 0. 相对现网（I-06 之后）

| 现网 | **本期** |
|------|----------|
| `canGenerate` 只看勾选的文件 + 书签；只勾文件夹则按钮禁用 | 勾选文件夹也可点生成；展开后至少要有 1 个文件或书签 |
| `generateProfile` 只把 `selectedIds` 里的 file / website 交给 IPC | 先按树把勾选夹递归展开，去重后再交给现网 `websitePaths` + `filePaths` |
| 点生成即分配 `prod_*` | 满足确认条件时先弹框；取消则不分配 ID |
| 拷到 `inputs/` 时只保留文件名（平铺，重名加 `-2`） | **按资料库相对路径保留目录结构**；`_sources.json` 同步为带目录的路径 |
| `_sources.json` 只有拷到 `inputs/` 后的路径和 URL | 增加资料库相对路径（`source_inputs`），供排查与 I-08 |

生成主路径仍是：复制快照 → 分配新 `product_id` → Agent 抽画像。本故事不改抽画像 Skill，不改「同一夹再点一次再出一份」的现网行为。

---

## 1. 已确认选型

| 项 | 决定 |
|----|------|
| **Q1 在哪展开** | **渲染进程、对着当前树 snapshot 做纯函数**。折叠夹的 `children` 已在树里，不必为展开再走 IPC。主进程继续只收扁平的 `filePaths` / `websitePaths` |
| **Q2 树被截断** | `truncated === true` **且勾选了至少一个文件夹** → **禁止生成**，提示把目录拆浅。只勾已经出现在树上的文件/书签时，截断不影响（与现网一致） |
| **Q3 去重** | 勾选父夹则不再单独走其子夹；父夹 + 其内文件/书签同时勾选 → 每条路径只出现一次 |
| **Q4 何时确认** | 去重后仍有 **≥ 2 个勾选文件夹**，**或** 任一勾选夹在树里还有子文件夹。仅勾文件/书签、或只勾一个「下面没有子夹」的文件夹 → 不弹框，直接生成 |
| **Q5 确认 UI** | 复用现网 `ConfirmDialog`（与设置页相同），不要 `window.confirm`。取消 / Esc / 点遮罩 = 不生成 |
| **Q6 空夹** | 展开后 0 文件且 0 书签 → 不创建 `prod_*`，提示「没有可生成的资料」 |
| **Q7 `_sources.json`** | 保留现网 `websites` / `files` / `skipped`；**新增** `source_inputs`（资料库相对 `files/` 的路径）。**不**在本故事改 `profile.json`（仍由 Agent 写，I-08 再验收画像字段） |
| **Q8 `inputs/` 结构** | **不平铺**。拷贝时按相对 `data/library/files/` 的路径在 `inputs/` 下建同样的子目录。只勾单个文件也如此。只为被拷文件创建中间目录，**不**为没有资料的空子夹建目录 |

---

## 2. 目标与非目标

### 2.1 目标

1. 勾一个产品夹点生成，不必进夹逐个勾文件/书签。  
2. 跨夹勾选（I-06）展开后仍合并成 **一份** 画像。  
3. 容易误合并时先看清单再确认。  
4. 未确认、展开为空、或截断冲突时，工作区里不出现新的 `prod_*`。

### 2.2 非目标

| 不做 | 归属 |
|------|------|
| pdf / docx / xlsx 抽文本 | 另开 Office 故事；本故事按现网原样拷进 `inputs/` |
| 每个勾选夹各出一份画像 | 明确不做（见 17 §12.3） |
| 从同一资料夹更新已有 `prod_*` | 明确不做 |
| 官网+文本同时存在时的画像字段专项验收 | US-I-08 |
| 根「资料库」整库一键生成 | 根仍不可勾（I-01 / I-06） |

---

## 3. 界面

### 3.1 顶栏

「生成画像」在下列任一为真时可点（且非 busy / 非 generating）：

- 勾选了 ≥1 个文件或网站书签，或  
- 勾选了 ≥1 个文件夹  

`title`：

- 已有文件/书签，或文件夹将展开出资料：`基于勾选资料生成一份画像`  
- 尚未勾选：`请先勾选文件、网站或文件夹`

文件夹复选框 `title` 从 I-06「生成时暂不递归」改为：`勾选后生成时纳入该夹下全部文件与网站`。

### 3.2 确认框

标题：`合并生成一份画像`  
主按钮：`生成`  
取消：`取消`

正文（换行，`ConfirmDialog` 的 message 使用 `white-space: pre-wrap`）：

```text
将把以下资料合并成一份画像（不会按文件夹各出一份）：

文件夹 绿森/地板（3 个文件，1 个网站）
文件夹 客户A（2 个文件）
另选 报价.txt

合计 6 个文件、1 个网站。取消则不生成。
```

规则：

- 「文件夹 …」只列出 **去重后的最外层勾选夹**，括号内是该夹递归展开后的文件数 / 书签数。  
- 「另选」= 勾选了、但不落在上述任一最外层夹之内的文件或书签。  
- 不把成百上千个叶子路径全部刷进对话框；需要核对的是**将合并哪些夹 / 另选哪些项**。

---

## 4. 行为细则

### 4.1 展开（`expandGenerateSelection`）

输入：整棵 `tree`、`selectedIds`。  
只处理树上存在的 id（与 I-06 刷新后的勾选过滤一致）。

1. 把勾选分成 `dirs` / `files` / `websites`（按节点 `kind`）。  
2. **丢掉被其它勾选夹包含的子夹**（保留最外层）。例：勾了 `绿森` 又勾了 `绿森/地板` → 只保留 `绿森`。  
3. 对每个最外层夹，深度优先收集其下全部 `file` 与 `website`（含再深的子夹）。  
4. 并上第 1 步里直接勾选的文件/书签，按 `relativePath` 去重。  
5. 书签不得进入 `filePaths`（与 I-05 相同）。

输出至少包括：

| 字段 | 含义 |
|------|------|
| `folderPaths` | 最外层勾选夹 |
| `filePaths` / `websitePaths` | 去重后的叶子 |
| `needsConfirm` | 见 Q4 |
| `confirmLines` | 对话框正文 |
| `empty` | 叶子总数为 0 |

`needsConfirm`：

```text
folderPaths.length >= 2
  || folderPaths 中任一节点的 children 含 kind === 'dir'
```

只勾文件、或只勾一个无子夹的文件夹 → `needsConfirm === false`。

### 4.2 点「生成画像」

```text
expand = expandGenerateSelection(tree, selectedIds)
若 truncated 且 selectedIds 含文件夹 → 报错并 return（不分配 ID）
若 expand.empty → 报错「没有可生成的资料」并 return
若 expand.needsConfirm → 打开 ConfirmDialog；取消则 return
generateProfile({ websitePaths, filePaths })  // 现网 IPC，已是展开后的扁平列表
```

确认框打开期间不要把 `busy` 打成生成中，以免挡掉取消。点「生成」后再走现网 `ensureAgentReady` + `generateProfile`。

### 4.3 主进程拷贝与 `_sources.json`

`bootstrapProductFromLibrary` 入参仍是扁平的 `websitePaths` / `filePaths`（相对 `files/`）。**拷贝不再用 basename 平铺**：

- 源 `files/绿森/地板/说明.md` → `products/{id}/inputs/绿森/地板/说明.md`  
- 书签同样：`files/绿森/地板/www.example.com.md` → `inputs/绿森/地板/www.example.com.md`  
- `mkdir` 出中间目录；文件名与相对路径保持与资料库一致（不再 `sanitizeBaseName` 把空格改成 `-`，也不再因重名加 `-2`——路径已唯一）  
- `_sources.json` 固定仍在 `inputs/_sources.json`（不进子夹）

清单示例：

```json
{
  "product_id": "prod_…",
  "created_at": "…",
  "websites": ["https://www.example.com"],
  "files": ["data/products/prod_…/inputs/绿森/地板/说明.md"],
  "skipped": [],
  "source_inputs": [
    { "type": "website", "library_path": "绿森/地板/www.example.com.md", "url": "https://www.example.com" },
    { "type": "file", "library_path": "绿森/地板/说明.md" }
  ]
}
```

Agent 提示里的「输入文件」列表改用上述带目录的路径（现网 `buildPrompt` 已逐条列出 `inputFiles`，Read 按完整路径读，不依赖把 `inputs/` 当一层目录扫）。

`library_path` 相对 `data/library/files/`。跳过的项仍只进 `skipped`，不进 `source_inputs`。

同一夹再点生成：继续 `generateProductId` 新 ID，不覆盖旧画像。

### 4.4 与 I-08 的交界

夹内同时有书签和 txt/md 时，本故事展开后两条都会进 `websitePaths` / `filePaths`，现网 bootstrap 已能拷贝两类。I-08 只验收画像 `source_inputs` 是否同时带 `type: website` 与 `type: file`，不在本故事改 Agent 输出。

---

## 5. 须改动的文件（编码时）

| 文件 | 变更 |
|------|------|
| `desktop/src/components/library/library-generate.ts` | `expandGenerateSelection` 纯函数（无 Electron） |
| `library-generate.test.ts` | 去重、确认条件、空夹、只勾文件不弹框 |
| `InputView.vue` | `canGenerate`、确认框、截断+勾夹拦截 |
| `LibraryTree.vue` | 文件夹勾选 title |
| `profile-bootstrap.ts` | 分配 `prod_*` 并写 `_sources.json`（含 `source_inputs`） |
| `electron/profile/profile-inputs.ts` | 按相对 `files/` 的路径拷到 `inputs/`，不平铺 |
| `main.css` | `ConfirmDialog` message `pre-wrap` |
| `docs/17-…` | 本故事链到本文并在编码后标落地 |

不新增 generate IPC，不把 `folderPaths` 传给主进程。

---

## 6. 验收用例

| # | Given | When | Then |
|---|--------|------|------|
| A1 | 只勾 `绿森/说明.txt` | 生成 | 不弹框；`inputs/绿森/说明.txt`，不平铺到 `inputs/` 根 |
| A2 | 夹 `绿森/地板` 下有 a.md、书签，无子夹；只勾该夹 | 生成 | 不弹框；`inputs/绿森/地板/…` 含夹内全部叶子 |
| A3 | 勾父夹 `绿森` 及其内 `绿森/a.md` | 生成 | a.md 只进一次 |
| A4 | 勾 `绿森` 与 `客户A` 两个夹 | 生成 | 先确认，列出两夹；取消则无新 `prod_*`；确认则一份画像、叶子为两夹并集 |
| A5 | 只勾 `绿森`，其下还有子夹 `地板` | 生成 | 先确认（夹内有子目录） |
| A6 | 空夹 | 生成 | 提示没有资料；无 `prod_*` |
| A7 | 树 `truncated`，且勾了文件夹 | 生成 | 提示拆浅；无 `prod_*` |
| A8 | 同一夹生成两次 | — | 两个不同 `prod_*`；侧栏都出现 |
| A9 | `_sources.json` | 生成成功 | 有 `source_inputs[].library_path`；`files[]` 含子目录 |
| A10 | 两个夹里都有 `说明.md` | 勾两夹并确认生成 | 两个文件都在，路径不同；没有 `说明-2.md` |

---

## 7. 编码任务顺序

1. `expandGenerateSelection` + 单测。  
2. `bootstrap` 按相对路径拷贝 + `_sources.json`。  
3. `InputView`：可点生成、确认框、截断/空结果拦截。  
4. 改文件夹勾选 title；手工 A1–A10；本文与 17 号文档标「编码已落地」。

---

## 8. 已确认点汇总

| # | 议题 | 决定 |
|----|------|------|
| Q1 | 展开位置 | **渲染进程对当前树做纯函数** |
| Q2 | 截断 + 勾夹 | **禁止生成** |
| Q3 | 确认 | **≥2 个最外层勾选夹，或夹内有子夹** |
| Q4 | 对话框 | **现网 ConfirmDialog**，列夹 / 另选 / 合计 |
| Q5 | 一份画像 | 多夹也只出一个 `prod_*` |
| Q6 | 记录路径 | `_sources.json.source_inputs`；不改 profile.json |
| Q8 | `inputs/` | **保留相对 `files/` 的目录结构**，不平铺 |
