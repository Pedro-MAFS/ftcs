# 示例：官网 + 文本混合输入

## 用户请求

> 产品夹里有 https://example-valves.com 的书签，还有 说明.md，请生成一份画像。

## 执行摘要

1. 产品 ID 已由桌面端分配（禁止再调 `product_generate_id`）
2. 网站分支：打开官网，按需探索站内页
3. 文件分支：Read `data/products/prod_…/inputs/…/说明.md`
4. 不要把书签文件 `www.example-valves.com.md` 当作说明书
5. `product_save`，`source_inputs` 同时含 website 与 file

## 预期 source_inputs

```json
[
  {
    "type": "website",
    "url": "https://example-valves.com",
    "crawled_at": "2026-08-18T00:00:00.000Z"
  },
  {
    "type": "file",
    "path": "data/products/prod_20260818_001/inputs/绿森/说明.md",
    "uploaded_at": "2026-08-18T00:00:00.000Z"
  }
]
```
