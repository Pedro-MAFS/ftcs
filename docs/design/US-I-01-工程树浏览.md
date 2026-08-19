# US-I-01 工程树浏览设计

> **用户故事**：[../17-需求-业务效率工具.md](../17-需求-业务效率工具.md) · US-I-01  
> **状态**：编码已落地  
> **范围**：录入页资料区由「进入单层列表」改为 IDE 式展开树；数据根仍为 `data/library/files`  
> **依赖**：无  
> **不做**：右键菜单（I-02）；重命名/移动（I-03）；导入整棵外部分配树（I-04）；网站书签进树（I-05）；Ctrl/Shift 跨选（I-06）；文件夹递归生成（I-07）  
> **文档位置**：`docs/design/`

---

## 0. 相对现网

| 现网 | **本期** |
|------|----------|
| `listFilesDir(cwd)` 只返回一层；UI 用面包屑 +「上级」钻入 | 一次返回整棵树；UI 展开/折叠 |
| 切 `cwd` 时勾选被滤成当前层 | 不再有「当前层」浏览态；文件勾选按 `relativePath` 保留 |
| 顶栏新建/粘贴/上传写入 `cwd` | 写入**焦点目录**（见 Q3）；按钮本故事保留，I-02 再撤到右键 |
| 全局网站 chips | **不动**（I-05） |
| 文件夹复选框禁用 | **不动**（I-07） |

---

## 1. 已确认选型

| 项 | 决定 |
|----|------|
| **Q1 加载策略** | **一次走完** `files/` 做成树交给渲染进程。资料库体量小；I-04 导入大树后再评估懒加载 |
| **Q2 默认展开** | 根的直接子节点可见（即「第一层」）；更深默认折叠。展开状态只活在本次打开录入页，不落盘 |
| **Q3 整理落点** | 本故事仍有顶栏新建/上传/粘贴。落点 = **焦点目录**：选中文件夹则用该夹；选中文件则用其父夹；未选则用根 `''` |
| **Q4 单击文件夹** | 设为焦点 + 切换展开/折叠（Chevron 与行点击效果相同，降低学习成本） |
| **Q5 单击文件** | 设为焦点；**不**自动勾选。勾选仍点行首复选框（与现网一致） |
| **Q6 安全上限** | 遍历最多 **5000** 个节点、深度 **16**。超限截断并在树顶提示，不抛崩 |
| **Q7 隐藏项** | 与现网一致：列出除 `.` / `..` 外的目录项；不额外隐藏点文件 |
| **Q8 根展示** | 树顶固定一行「资料库」只读根（`relativePath === ''`），不可勾选、不可删除 |

---

## 2. 目标与非目标

### 2.1 目标

1. 录入主区能同时看见多家公司/多个产品夹，不必点进一层丢掉兄弟目录。  
2. 文件夹可展开、折叠；展开后可见子夹与文件。  
3. 去掉面包屑、「上级」、`library-path` 那种「当前路径」导航。  
4. 空库有空态。  
5. 现网生成画像（勾选**文件** + 网站 chips）仍可用；IPC 整理操作仍可用。

### 2.2 非目标

| 不做 | 归属 |
|------|------|
| 右键菜单；撤掉顶栏整理按钮 | US-I-02 |
| F2 重命名、拖到另一夹移动 | US-I-03 |
| 从资源管理器拖入**文件夹**整棵导入 | US-I-04（本故事拖入仍只导入文件到焦点目录，与现网一致） |
| 网站进树、迁移 `websites/` | US-I-05 |
| Ctrl/Shift 范围选 | US-I-06 |
| 勾选文件夹并递归生成 | US-I-07 |
| 改 `sanitizeBaseName` 保留空格 | US-I-03 |

---

## 3. 界面

### 3.1 录入页结构（本故事后）

```text
产品录入
  [新建目录] [粘贴文件] [上传文件]  [生成画像]

  公司网站          ← 现网 chips，不改
  [URL 输入] [保存网站]

  资料库            ← 去掉面包屑、「上级」、cwd 路径
  已选网站 N / 文件 M

  ┌ 树 ─────────────────────────────────┐
  │ ▼ 资料库                            │  根，无复选框
  │    ▼ 绿森塑木                       │  文件夹：chevron + folder 图标
  │         户外地板.md                 │  文件：复选框 + file-text
  │       ▶ 墙板                        │  折叠
  │    ▶ 另一家工厂                     │
  └─────────────────────────────────────┘
  空：当前还没有资料。可用「新建目录」或「上传文件」添加。
```

### 3.2 树行

| 元素 | 规则 |
|------|------|
| 缩进 | `depth * 16px`（根 depth=0） |
| 文件夹 | `chevron-right` 折叠 / `chevron-down` 展开；图标 `folder` |
| 文件 | 无 chevron；占位与 chevron 同宽以免错位；图标 `file-text` |
| 复选框 | 仅 `kind === 'file'`；文件夹 disabled（I-07 再开） |
| 焦点 | 当前焦点行高亮（与「已勾选」不是同一状态：勾选是复选框，焦点是落点/键盘） |
| 删除 | 本故事保留行尾删除按钮（I-02 收到右键后再撤） |
| 新建目录 | 仍用顶栏按钮；输入条插在树顶（现网 `mkdir-row`），创建到 **焦点目录** |

### 3.3 空态

根下没有任何子节点时，树区域显示：

> 当前还没有资料。可用「新建目录」或「上传文件」添加。

I-02 会把这句话改成右键提示；本故事按按钮文案写。

### 3.4 截断提示

若 `truncated === true`：

> 资料超过显示上限，仅展示部分节点。请把目录拆得更浅后再打开。

---

## 4. 数据与 IPC

### 4.1 新类型（`desktop/src/types/library.ts` 与 electron 侧对齐）

```ts
export interface LibraryTreeNode {
  name: string
  kind: 'dir' | 'file'
  relativePath: string
  depth: number
  sizeBytes?: number
  modifiedAt?: string
  children: LibraryTreeNode[] // 文件恒为 []
}

export interface LibrarySnapshot {
  websites: WebsiteItem[]
  /** 焦点目录，供新建/上传/粘贴；根为 '' */
  focusDir: string
  tree: LibraryTreeNode[] // 根「资料库」的 children，即 files/ 下一层
  truncated: boolean
  filesRootLabel: string // 固定 'data/library/files'
  /** @deprecated I-01 起不再用于浏览；突变接口可暂时同传 focusDir */
  cwd?: string
  entries?: FileEntry[]
}
```

编码时：**新字段必须有**；`cwd` / `entries` 可继续填以免漏改，但 `InputView` 不得再靠它们做导航。

### 4.2 主进程

在 [`library-service.ts`](../../desktop/electron/library/library-service.ts) 新增 `listFilesTree(workspaceRoot)`：

- 从 `filesRoot` 递归 `readdir`；目录在前、同级按 `localeCompare`（与现网一层排序相同）。
- `relativePath` 仍用 `/`，且必须经过现有 `resolveUnderFiles` 同类沙箱：含 `..`、绝对路径、逃出 `files/` 的 symlink **跳过该节点**。
- 达到 5000 节点或深度 16：停止下行，`truncated = true`。
- 不存在 `files/` 时 `mkdir`（沿用 `ensureLibraryDirs`）。

`buildLibrarySnapshot(focusDir)`：

- `tree` + `truncated` 来自 `listFilesTree`
- `focusDir` 若已不存在（被删），回落到 `''`
- `filesRootLabel` 固定 `data/library/files`
- 整理类 IPC 仍接收「目标目录」参数；渲染进程传入 **focusDir**，不再传「当前打开的 cwd」

现有 `listFilesDir` 可留作实现细节或给测试用，UI 不再调用「按 cwd 列一层」作为主路径。

### 4.3 Preload / 渲染

| 现网 | 本期 |
|------|------|
| `listLibrary(cwd)` | 改为 `listLibrary(focusDir?)`，返回带 `tree` 的 snapshot；`focusDir` 仅用于回写焦点，**不**限制返回哪些节点 |
| `createLibraryFolder(name, cwd)` | 第二参改为焦点目录 |
| upload / import / paste / delete | 同样：目标目录用焦点；delete 仍按 `relativePath` |

### 4.4 渲染状态

`InputView`（或抽出 `LibraryTree.vue`）：

- `expanded`：`Set<string>`，根 children 默认不进 Set（第一层直接渲染；子夹需展开才进 Set）。更直观的实现：**第一层始终画出**；`expanded` 只记录「哪些目录显示 children」。
- `focusDir`：`string`，默认 `''`。
- `selectedIds`：勾选的**文件** `relativePath`。刷新 snapshot 时：**只剔除树中已不存在的路径**，禁止按「当前层」过滤。
- 生成画像：仍只把 `kind === 'file'` 的勾选 + 网站 chips 交给现网 `generateProfile`。

建议组件：`desktop/src/components/library/LibraryTree.vue`，Props：`nodes`、`expanded`、`focusDir`、`selectedIds`；事件：`toggle-expand`、`focus`、`toggle-select`、`delete`。

---

## 5. 行为细则

### 5.1 展开与焦点

- 点文件夹行或 chevron → `expanded` 切换该 `relativePath`；同时 `focusDir = relativePath`。  
- 点文件行（非复选框）→ `focusDir = 父目录`（文件本身不是落点）。  
- 点根「资料库」→ `focusDir = ''`，根不可折叠（始终展开第一层）。  
- 新建目录成功：把新夹加入 `expanded` 的父节点（父本就该展开），`focusDir` 设为新夹。

### 5.2 与顶栏整理的衔接（过渡）

| 操作 | 目标 |
|------|------|
| 新建目录 | `createFolder(focusDir, name)` |
| 上传 / 粘贴 / 拖入文件 | 导入到 `focusDir` |
| 删除 | 现网 `deleteLibraryEntry(relativePath)`；若删的是焦点夹，焦点回到父夹 |

拖入**文件夹**：本故事仍按现网「不是文件则 skip」。I-04 再改。

### 5.3 勾选（故意保持现网语义）

- 仅文件可勾选；点复选框 toggle。  
- `canGenerate` 仍为「已选文件数 + 已选网站 chips > 0」。  
- 因不再切层，勾选 A/a.txt 后再展开 B，A/a.txt 仍应勾选——这是树浏览的必然结果，**不是** I-06（I-06 补 Ctrl/Shift）。

---

## 6. 须改动的文件

| 文件 | 变更 |
|------|------|
| `desktop/electron/library/library-service.ts` | `listFilesTree`；上限与沙箱 |
| `desktop/electron/main.ts` | `buildLibrarySnapshot` 改树；IPC 目标目录语义 |
| `desktop/src/types/library.ts` | `LibraryTreeNode`、snapshot 字段 |
| `desktop/src/types/electron.d.ts`、`preload.ts` | 签名与类型 |
| `desktop/src/views/InputView.vue` | 去掉 crumbs/上级；接树；focusDir |
| `desktop/src/components/library/LibraryTree.vue` | 新建 |
| `desktop/src/styles/main.css` | 树缩进、焦点、chevron；删除或闲置 crumbs 样式 |
| `desktop/electron/library/*.test.ts` 或 lead-store 外测 | 给 `listFilesTree` 加单测：排序、沙箱、上限 |
| `docs/17-需求-业务效率工具.md` | US-I-01 详细设计改为本文 |

交互稿 `desktop/designs/ftcs-console.pen`：有录入页则补一帧「工程树」；无则编码以本文为准。

---

## 7. 与后续故事

| 故事 | 衔接 |
|------|------|
| I-02 | 右键菜单挂在树行与空白处；顶栏三按钮删除；空态改文案 |
| I-03 | 拖动行 = 移动；F2 重命名；焦点/展开状态在 rename 后按新 path 迁移 |
| I-04 | 拖入目录走导入树，不再 skip |
| I-05 | `LibraryTreeNode.kind` 可增 `website`；本故事不要预留假节点 |
| I-06 | 在树多选上加 Ctrl/Shift；复用本故事的 `selectedIds` |
| I-07 | 文件夹复选框启用 + 递归展开候选 |

---

## 8. 验收用例

| # | Given | When | Then |
|---|--------|------|------|
| A1 | `files/` 为空 | 打开录入 | 见空态；无面包屑、无「上级」 |
| A2 | 根下有 `公司A/`、`说明.txt` | 打开录入 | 两者都在第一层；`公司A` 默认不展开其子项 |
| A3 | `公司A/地板/a.md` | 单击 `公司A` | 展开并看到 `地板`；再点 `地板` 看到 `a.md`；`说明.txt` 仍在第一层可见 |
| A4 | 已展开 `公司A` | 再点 `公司A` | 折叠，其下节点隐藏；第一层其它项仍在 |
| A5 | 勾选 `说明.txt` 后展开另一夹 | 看复选框 | `说明.txt` 仍勾选；可生成画像 |
| A6 | 焦点在 `公司A` | 顶栏新建目录 `新产品` | 目录出现在 `公司A/` 下，不出现在根 |
| A7 | 未点任何夹 | 上传文件 | 文件落在 `files/` 根 |
| A8 | 删掉当前焦点夹 | 刷新树 | 焦点回到父夹；树无死路径 |
| A9 | 相对路径含 `..` 的异常项 | 遍历 | 不出现在树里 |
| A10 | 节点超过 5000 或深度 >16 | 打开录入 | 树仍能画；有截断提示；应用不崩溃 |

---

## 9. 编码任务顺序

1. `listFilesTree` + 单测（排序、沙箱、上限）。  
2. Snapshot / IPC 改为树 + `focusDir`。  
3. `LibraryTree.vue` + 样式。  
4. `InputView` 去掉进入式导航，接树、焦点、勾选保留。  
5. 手工走 A1–A8；更新本故事与 17 号文档状态为「编码已落地」。

---

## 10. 已确认点汇总

| # | 议题 | 决定 |
|---|------|------|
| Q1 | 懒加载 vs 一次加载 | **一次加载**，5000/16 截断 |
| Q2 | 默认展开 | 只展示根下一层，子夹折叠 |
| Q3 | 顶栏整理写到哪 | **焦点目录** |
| Q4 | 点文件夹 | 焦点 + 展开切换 |
| Q5 | 点文件 | 焦点到父夹；勾选仍靠复选框 |
| Q6 | 网站 chips | 本故事保留 |
| Q7 | 文件夹勾选 | 本故事仍禁用 |
