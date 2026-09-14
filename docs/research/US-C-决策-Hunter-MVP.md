# US-C 决策：Hunter BYOK 集成扩展（非核心）

> **日期**：2026-09-08  
> **状态**：**已采纳**

---

## 决策摘要

| 项 | 结论 |
|----|------|
| **形态** | Hunter **集成扩展**（Integration），不是 FTCS 核心环节 |
| **通道** | **BYOK** — 用户自备 Hunter API Key，桌面/MCP 直连 `api.hunter.io` |
| **官方代调** | **不做**（无法务/合同前不走路网网关转售 Hunter） |
| **竞品叙事** | 不宣传「取代 Hunter」；对外 *powered by Hunter (optional)* |
| **自研 builtin** | **延后**（预研证明难稳定找人） |

---

## 主路径 vs 扩展

| | 核心主路径 | Hunter 扩展 |
|---|-----------|-------------|
| 能力 | 画像 → 探索 → 线索 → 开发信 | 线索页「补全联系人」 |
| 无 Hunter Key | ✅ 照常 | ❌ 按钮置灰 + 引导 |
| 设置位置 | 官方/自定义模型、搜索 | **集成 → Hunter**（对齐 Places Key） |

---

## 依据

1. builtin 预研（Decodeck 等）：公开搜索 + 官网 **难稳定找人**。  
2. 业务员已用 Hunter — **集成**比自研更划算，且 **降低竞品/ToS 风险**。  
3. Tavily/模型官方代调 ≠ Hunter 代调；Hunter 个人数据与 **禁止共享账号** 条款更严。

---

## 实现要点（MVP）

- MCP：`workspace/mcp-servers/hunter-api/`（`domain_search`、`email_verifier`）  
- Skill：`enrich-lead-contacts`（仅 Hunter）  
- Preflight：**仅 enrich 任务**检查 Key  
- Spike：5 条线索 `domain-search`（见 doc 20 §8）

---

## 参考

- [20-需求-联系人Enrichment.md](../20-需求-联系人Enrichment.md)  
- Hunter API：https://hunter.io/api-documentation/v2 · FTCS 参考：[hunter-api/README.md](../reference/hunter-api/README.md)  
- 预研归档：`联系人Enrichment-spike-简明-Decodeck.md`
