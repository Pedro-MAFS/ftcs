# 示例：普通文本文件输入

## 用户请求

> 根据这个文件建立产品画像：D:\docs\valve-product-intro.md

## 执行摘要

1. `file_classify("D:\docs\valve-product-intro.md")` → supported
2. `product_generate_id` → `prod_20260712_002`
3. `inputs_ensure_dir`
4. Read 文件内容，复制到 `data/products/prod_20260712_002/inputs/valve-product-intro.md`
5. 从 Markdown 提取公司与产品信息
6. `product_save` → readiness 55，status: draft
7. 追问目标市场（regions）与买家类型

## 图片（US-I-12）

用户提交 `样品图.jpg`（可单独或与其它资料混用）：

1. `file_classify` → **image**
2. Read **多模态**读取图片，提取产品名、规格、卖点
3. 合并进同一份画像；`source_inputs` 记录原图 path

某张 Read 失败 → **跳过该张**，继续其它资料。

## PDF 侧车（US-I-13）

用户提交 `产品目录.pdf`（文字型；桌面已抽侧车）：

1. `file_classify` → **pdf**
2. Read **`产品目录.pdf.txt` 侧车**，提取产品名、规格、MOQ
3. 合并进同一份画像；`source_inputs.library_path` = 原件 `产品目录.pdf`

扫描件 / 抽不到文本 → 桌面端 skipped，Agent 不看到该路径。

## 仍跳过的 special 文件

用户提交 `legacy.doc`（同时还有官网或 txt）：

1. `file_classify` → special
2. **跳过该文件**，继续用官网 / 文本 / PDF 侧车 / 图片生成
3. 摘要里可说明老格式暂不抽取

若**只有** special 文件、没有其它可生成资料，再提示用户补充 txt、文字型 PDF 或官网。
