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

## 特殊文件示例

用户提交 `catalog.pdf`：

1. `file_classify` → special
2. **停止**，返回：

> 该文件格式需专用解析器，当前版本暂不支持。请提供 txt/md/json/csv，或提供公司网站 URL。
