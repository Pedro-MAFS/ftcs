# US-I-05 网站书签进树设计

> **用户故事**：[../17-需求-业务效率工具.md](../17-需求-业务效率工具.md) · US-I-05  
> **状态**：编码已落地  
> **范围**：官网从全局 `websites/` chips 改为 `files/` 树上的书签节点；打开工作区迁移旧列表  
> **依赖**：US-I-01，US-I-02  
> **不做**：勾选文件夹递归生成（I-07）；官网+文本混合生成的专项验收（I-08，但本故事须保持「只勾网站 / 只勾文件」仍能生成，否则撤掉 chips 会打断现网主路径）  
> **文档位置**：`docs/design/`

---

## 0. 相对现网（I-04 之后）

| 现网 | **本期** |
|------|----------|
| 网站写在 `data/library/websites/*.md`，录入页顶部 chips | 书签是 `files/` 下带 `type: website` 的 md；chips 与顶部 URL 条删除 |
| `addWebsite(url)` 忽略目录参数 | 写入**焦点目录**（右键目标夹） |
| 树节点只有 `dir` / `file` | 增加 `kind: 'website'`，地球图标 |
| 生成时 `websitePaths` 必须 `websites/` 前缀 | 改为 `files/` 相对路径，读 frontmatter 的 `url` |
| 右键「保存网站」禁用 | 启用；书签节点有「打开网站 / 删除」 |

---

## 1. 已确认选型

| 项 | 决定 |
|----|------|
| **Q1 文件形态** | 与现网相同的 markdown + YAML：`type: website`、`url`、`title`、`created_at`。文件名 `{hostname}.md`，重名 `uniquePath` |
| **Q2 树节点** | `kind: 'website'`，`url` 字段给 UI；展示名用 `title`（hostname），副行显示 URL |
| **Q3 打开** | 单击 = 与文件相同（焦点到父夹，**不**勾选）。**双击**或右键「打开网站」= `openExternal` |
| **Q4 勾选** | 书签可勾选，进 `selectedIds`；生成时与普通文件拆开：书签 → `websitePaths`，文件 → `filePaths` |
| **Q5 重复 URL** | **同一目录**内规范化后的 URL 已存在则拒绝；**不同目录**允许各存一份 |
| **Q6 迁移** | `ensureLibraryDirs` / 列资料库时：把 `websites/*.md` **rename** 到 `files/` 根，冲突加 `-2`；幂等 |
| **Q7 空白处** | 与根相同，可「保存网站」到 `''` |

---

## 2. 目标与非目标

### 2.1 目标

1. 录入页不再出现全局网站 chips。  
2. 右键保存的书签出现在目标夹下，树里能分辨。  
3. 旧 `websites/` 打开后出现在资料库根。  
4. 勾选书签仍能生成画像（网站路径语义换到 `files/`）。

### 2.2 非目标

| 不做 | 归属 |
|------|------|
| 勾选文件夹递归带上书签 | US-I-07 |
| 官网+说明书混合生成的专项规则 | US-I-08（本故事只保证两类节点分别勾选仍走现网生成） |
| 重命名书签文件名 | US-I-03 |

---

## 3. 界面

### 3.1 录入页

去掉「公司网站」标签、URL 输入、「保存网站」按钮、chips。资料树即唯一资料面。

保存网站用树顶输入条（与新建目录同一套 `mkdir-row` 风格）：

> `[ https://… ] [保存] [取消]`

右键「保存网站」后出现，写入当前焦点目录。

### 3.2 菜单

| 目标 | 变更 |
|------|------|
| 空白 / 根 / 文件夹 | 「保存网站」**启用** |
| 书签 | 打开网站、删除（确认）；重命名仍占位 |
| 文件 | 不变 |

### 3.3 树行

书签：地球图标；复选框可用；副标题为 URL。

---

## 4. 数据与 IPC

### 4.1 节点类型

```ts
kind: 'dir' | 'file' | 'website'
url?: string  // 仅 website
```

`.md` 且 frontmatter `type: website` 才标书签；其它 md 仍是文件。

### 4.2 `addWebsite(url, destDir)`

1. 规范化 URL（现网 `http(s)` 规则）  
2. 扫 `destDir` 下已有书签，URL 相同则抛「该文件夹已保存此网站」  
3. 写入 `files/{destDir}/{hostname}.md`  
4. 返回 `relativePath`（相对 `files/`）

### 4.3 生成

`bootstrapProductFromLibrary`：`websitePaths` 相对 `data/library/files/`。校验为书签 md 后拷到 `inputs/`，抽取 `url` 进 `websites`。不再要求 `websites/` 前缀。

### 4.4 Snapshot

`websites: []`（兼容字段，UI 不再读）。树里带书签节点。

`LibraryMutationResult.createdPath?`：保存网站成功后供勾选新节点。

---

## 5. 须改动的文件

| 文件 | 变更 |
|------|------|
| `desktop/electron/library/library-website.ts` | 解析、写入、迁移、同夹去重（无 Electron） |
| `desktop/electron/library/library-tree.ts` | `kind: website` + `url` |
| `desktop/electron/library/library-service.ts` | `addWebsite` 写到夹；`ensureLibraryDirs` 触发迁移 |
| `desktop/electron/profile/profile-bootstrap.ts` | 网站路径改 `files/` |
| `desktop/electron/main.ts` | `addWebsite(url, cwd)`；`createdPath` |
| 类型三处 + preload | `website` kind、`createdPath` |
| `LibraryTree.vue` / `library-context.ts` / `InputView.vue` | 图标、菜单、对话框、撤 chips |
| 单测 | 迁移、同夹拒绝、异夹允许、树识别 |

---

## 6. 验收用例

| # | Given | When | Then |
|---|--------|------|------|
| A1 | `websites/a.md` 存在 | 打开录入 | 根下出现该书签；chips 消失 |
| A2 | 根已有同名 md | 迁移 | 新文件为 `name-2.md`，旧文件不丢 |
| A3 | 焦点在 `绿森/地板` | 右键保存 `https://www.example.com` | 出现 `绿森/地板/www.example.com.md` |
| A4 | 该夹已有同一 URL | 再保存 | 提示已存在，不新建 |
| A5 | 另一夹保存同一 URL | — | 允许 |
| A6 | 勾选书签点生成 | — | 仍能分配 `prod_*`（只勾文件也照旧） |
| A7 | 双击或右键打开 | — | 系统浏览器打开该 URL |
| A8 | 删除书签 | 确认 | 节点消失，不删其它文件 |

---

## 7. 编码任务顺序

1. `library-website.ts` + 迁移/去重单测。  
2. 树识别 `website`；bootstrap 改路径。  
3. 右键、输入条、撤 chips、生成勾选拆分。  
4. 手工 A1–A8；本文与 17 号文档标「编码已落地」。

---

## 8. 已确认点汇总

| # | 议题 | 决定 |
|---|------|------|
| Q1 | chips 去留 | **去掉** |
| Q2 | 单击书签 | **焦点到父夹**，不打开浏览器 |
| Q3 | 打开浏览器 | **双击 / 右键「打开网站」** |
| Q4 | 同 URL | **同夹拒绝，异夹允许** |
| Q5 | 生成 | **书签走 websitePaths**，避免当普通文件喂给画像 |
