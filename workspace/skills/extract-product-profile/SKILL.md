---
name: extract-product-profile
description: 从公司网站、文本文件或产品图片中提取外贸产品画像，计算就绪度并保存。用户提供网站 URL、txt/md/json/csv 或图片时使用。
phase: -1
inputs:
  - name: website_url
    type: string
    required: false
  - name: file_paths
    type: array
    required: false
  - name: product_id
    type: string
    required: false
outputs:
  - path: data/products/{product_id}/profile.json
    schema: ProductProfile
---

# extract-product-profile

从用户提交的产品信息中提取结构化**产品画像**，并保存至 `data/products/{product_id}/profile.json`。

## 何时使用

- 用户提供**公司网站 URL**，需要提取公司与产品信息
- 用户提供**普通文本类产品资料**（txt/md/json/csv 等）
- 用户提供**产品图片**（jpg/png/webp 等），需要从画面提取产品信息
- 用户说「建立产品画像」「分析我的产品」「提取产品信息」

## 前置条件

- 工作区内存在 `config/scoring-rules.yaml`（就绪度阈值等）
- MCP `lead-store` 已配置
- 网站输入时，chrome-devtools MCP 可用

## 输入分流策略


| 输入类型 | 使用工具                       | 行为    |
| ---- | -------------------------- | ------------- |
| 公司网站 | `chrome-devtools-mcp`      | 打开首页，按需自由探索站内页面 |
| 普通文本 | 智能体原生 Read 工具              | 直接读取文本内容      |
| Office 侧车 | 智能体原生 Read 工具           | 读取桌面端已抽好的 `.docx.txt` 等侧车 |
| 图片 | 智能体原生 Read（**多模态**）     | 识别画面中的产品名、规格、卖点等，合并进画像 |
| pdf 等待解析 / 未知 | `lead-store.file_classify` | **跳过该文件**，有其它资料则继续 |


**仍跳过的格式**：pdf（待桌面端侧车支持）、老 Office 原件（`.doc`/`.xls`/`.ppt`）等。桌面端生成时已过滤或已抽侧车；若仍碰到 special/unknown，**不要停止整次生成**。

## 执行步骤

### Step 0：初始化

1. 若用户未提供 `product_id`，调用 `lead-store.product_generate_id`
2. 调用 `lead-store.inputs_ensure_dir` 确保 `inputs/` 目录存在

### Step 1：判断输入类型

- 有 `website_url` → 走 **网站分支**（Step 2A）
- 有 `file_paths` → 对每个文件调用 `lead-store.file_classify`（可选；桌面端已过滤）
  - `supported` → 走 **文本文件分支**（Step 2B）
  - **`image`** → **Read 多模态**读取图片，提取产品信息（Step 2C）
  - Office 已抽成侧车的路径（如 `说明.docx.txt`）→ 按 **文本文件分支** Read
  - `special` / `unknown` → **跳过该文件并继续**，不要停止整次。可在摘要里说明跳过了哪些格式。
- 两者都有 → 分别执行后 **合并进同一份画像**
- **仅图片、无官网无文本**：允许执行；Read 全部图片后组装画像；若全部 Read 失败 → 提示用户补充 txt 或官网
- `source_inputs`：
  - 每个官网 URL 一条 `{ "type": "website", "url": "...", "crawled_at": "..." }`
  - 每个已读文本一条 `{ "type": "file", "path": "data/products/{id}/inputs/…", "uploaded_at": "..." }`
  - **不要**把 `inputs/` 里的网站书签 markdown（frontmatter `type: website`）写成 `type: file`

### Step 2A：网站分支（chrome-devtools-mcp）

1. `navigate_page` 或 `new_page` 打开 `website_url`
2. `take_snapshot` 获取首页内容，提取：
  - 公司名、简介、国家/地区
  - 导航结构与站内链接线索
3. `evaluate_script` 收集站内链接，供后续探索参考：
  ```javascript
   () => Array.from(document.querySelectorAll('a[href]'))
     .map(a => ({ text: a.innerText.trim(), href: a.href }))
     .filter(x => x.href.startsWith(location.origin))
  ```
4. **按需自由探索**（不设页面数量上限）：
  - 由智能体根据当前已收集信息与画像缺口，自行决定下一步访问哪些页面
  - 优先访问与画像字段相关的页面，例如：
    - 产品列表 / 产品详情 / 产品分类页
    - About / Company / Factory
    - Contact / 认证 / 资质页
    - 应用案例、解决方案、新闻稿（若有助于推断买家场景）
  - 若网站产品结构较深（多级分类、系列产品页），可继续向下探索，直到产品信息足够完整
  - 每访问一页：`navigate_page` + `take_snapshot`（必要时 `evaluate_script`）提取：
    - 产品名称、规格、材质、应用场景
    - 认证（ISO、CE、UL 等）
    - 联系方式、差异化卖点
  - **停止探索的条件**（满足其一即可）：
    - 已能构建完整画像，预计 `readiness.score >= 60`
    - 继续访问新页面不再带来有价值的画像字段
    - 网站结构已穷尽，或剩余链接与画像无关
5. 合并所有已访问页面信息，整理为画像字段；在 `source_inputs` 中可记录主要访问过的 URL

### Step 2B：文件分支（智能体原生工具）

1. 对每个 `supported` 文件：
  - 使用 Read 工具读取文件内容
  - 将原文件复制到 `data/products/{product_id}/inputs/`（保留原文件名）
2. 从文件内容提取：
  - 公司信息、产品列表、规格、MOQ、目标市场等
3. 在 `source_inputs` 中记录：
  ```json
   { "type": "file", "path": "data/products/{id}/inputs/xxx.txt", "uploaded_at": "..." }
  ```

### Step 2C：图片分支（Read 多模态）

1. 对每个 `image` 文件（或 Prompt 列表中的 `.jpg`/`.png`/`.webp` 等路径）：
  - 使用 Read 工具 **多模态**读取（不要当纯文本打开）
  - 从画面提取：产品名称、规格、材质、卖点、包装、认证标识等可见信息
2. 某张图片 Read 失败 → **跳过该张**，继续处理其它文件；在最终汇报中说明
3. 在 `source_inputs` 中记录（path 为 inputs 下 **原图** 路径）：
  ```json
   { "type": "file", "path": "data/products/{id}/inputs/…/样品图.jpg", "uploaded_at": "..." }
  ```

### Step 3：构建画像对象

组装 `ProductProfile`（路径：`data/products/{product_id}/profile.json`）。必填/推荐字段如下。

**顶层**

| 字段 | 必填 | 说明 |
|------|------|------|
| `id` | 是 | 与目录名一致，格式 `prod_{YYYYMMDD}_{seq}` |
| `status` | 是 | 由就绪度决定：`draft` / `ready` |
| `company` | 是 | 卖方公司 |
| `products` | 是 | 至少一个产品 |
| `buyer_personas` | 推荐 | 目标买家 |
| `target_markets` | 推荐 | 缺省则全球搜索 |
| `competitors` | 可选 | 竞品，便于后续关键词 |
| `source_inputs` | 是 | 记录本次输入来源 |

**示例结构**

```json
{
  "id": "prod_20260712_001",
  "version": 1,
  "created_at": "ISO8601",
  "updated_at": "ISO8601",
  "status": "draft",
  "company": {
    "name": "...",
    "website": "https://...",
    "country": "CN",
    "description": "...",
    "certifications": ["ISO9001", "CE"]
  },
  "products": [
    {
      "name": "...",
      "name_en": "...",
      "category": "...",
      "materials": [],
      "specs": [],
      "moq": "",
      "use_cases": [],
      "differentiators": []
    }
  ],
  "buyer_personas": [
    {
      "role": "procurement_manager",
      "company_types": ["distributor", "importer", "OEM"],
      "regions": ["EU", "NA"],
      "pain_points": []
    }
  ],
  "target_markets": {
    "regions": ["EU", "NA"],
    "excluded_regions": [],
    "languages": ["en"]
  },
  "competitors": [{ "name": "...", "website": "https://..." }],
  "source_inputs": []
}
```

网站输入时 `source_inputs` 记录：

```json
{ "type": "website", "url": "...", "crawled_at": "ISO8601" }
```

官网 + 文本同时存在时，两类都要有，例如：

```json
[
  { "type": "website", "url": "https://example.com", "crawled_at": "ISO8601" },
  { "type": "file", "path": "data/products/prod_…/inputs/绿森/说明.md", "uploaded_at": "ISO8601" }
]
```

**就绪度（由 lead-store 计算，勿手改）**

- `company.name` + `company.website`：+20
- ≥1 个 `products[].name`：+20
- `products[].use_cases`：+15
- `buyer_personas`：+20
- `target_markets.regions`：+15
- `competitors`：+10
- `score < 60` → `status = draft`，需追问补全后再探索

### Step 4：保存与就绪度检查

1. 调用 `lead-store.product_save` 保存画像
2. 检查返回的 `readiness` 和 `status`：
  - `status == "ready"` → 告知用户画像已就绪，可进入关键词扩展
  - `status == "draft"` → 根据 `follow_up_questions` 向用户追问缺失信息
3. 用户补充后，再次 `product_save` 更新（传入相同 `product_id`）

### Step 5：输出摘要

向用户展示：

- 产品 ID 与保存路径
- 公司与核心产品摘要
- 就绪度分数与状态
- 缺失字段（如有）
- 下一步建议（`expand-keywords` 或继续补全画像）

## 输出要求

- 必须写入 `data/products/{product_id}/profile.json`
- `id` 与目录名一致
- `readiness` 由 `lead-store` 自动计算，不要手动覆盖
- 禁止编造无法从输入中推断的事实；不确定的字段留空

## 错误处理


| 情况                  | 处理                                        |
| ------------------- | ----------------------------------------- |
| 网站无法访问              | 告知用户检查 URL，建议改提供文本资料                      |
| chrome-devtools 不可用 | 提示启用 chrome-devtools MCP（桌面 App / Cursor 均可） |
| 特殊文件                | 跳过该文件，有官网或文本则继续生成；不要整次停止           |
| 画像分数 < 60           | 保存为 `draft`，追问后继续                         |


## 示例对话

**网站输入**：

> 请从这个网站提取产品画像：[https://example-valves.com](https://example-valves.com)

**文件输入**：

> 请根据这个产品说明文件建立画像：D:\docs\product-intro.md

**官网 + 文本**：

> 这个产品夹里有公司网站，也有说明书，请合并生成一份画像。

## 流水线

- 本 Skill 完成后 → `expand-keywords`
- 工作区根目录为含 `config/scoring-rules.yaml` 与 `data/` 的目录（即 `workspace/`）

