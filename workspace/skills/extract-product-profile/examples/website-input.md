# 示例：网站输入

## 用户请求

> 请从网站 https://example-valves.com 提取我们的产品画像。

## 执行摘要

1. `product_generate_id` → `prod_20260712_001`
2. `new_page("https://example-valves.com")`
3. `take_snapshot` → 提取公司名「Example Valves Co.」、简介
4. `evaluate_script` → 发现 /products、/about-us、/contact
5. 依次打开 /products、/about-us，合并产品列表与认证信息
6. `product_save` → readiness 75，status: draft（缺 buyer_personas）
7. 追问目标买家类型与目标市场
8. 用户回复后再次 `product_save` → readiness 95，status: ready

## 预期 source_inputs

```json
[
  {
    "type": "website",
    "url": "https://example-valves.com",
    "crawled_at": "2026-07-12T06:30:00Z"
  }
]
```
