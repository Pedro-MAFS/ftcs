# Google Maps Platform 核心服务定价（离线）

| 项 | 值 |
| --- | --- |
| **保存日期** | 2026-09-01（评审 R3 时） |
| **语言** | 简体中文 |
| **在线 URL** | https://developers.google.com/maps/billing-and-pricing/pricing?hl=zh-cn |

## 文件

| 文件 | 说明 |
| --- | --- |
| [index.html](index.html) | 完整离线页（表格可浏览；部分交互脚本可能无效） |
| [places-api-pricing-r3-summary.md](places-api-pricing-r3-summary.md) | **R3 相关 SKU 摘录**（Essentials / Pro / Enterprise、免费额度） |
| `assets/` | 离线页依赖的 CSS / JS / 图片（浏览器另存为产物） |

## 与 FTCS R3 的关系

R3 发现层使用 **Places API（新）**；计费按每次请求的 FieldMask **最高 SKU 档**计。详见 [R3-Places-API-预研.md](../../design/R3-Places-API-预研.md) §3–§5。
