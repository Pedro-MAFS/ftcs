# Decodeck USA · 联系人预研（简明版）

> **线索**：`lead_20260906_0005` · [decodeckusa.com](https://www.decodeckusa.com)  
> **目的**：试跑「补联系人」流程，看 **能拿到什么、拿不到什么**。  
> **复杂版归档**：[联系人Enrichment-spike-v2-lead_20260906_0005.md](./联系人Enrichment-spike-v2-lead_20260906_0005.md)（不必先看）

---

## 一句话：这条公司大概率是什么结果？

- **能找到**：官网上的 **公司邮箱**（如 `info@decodeckusa.com`）  
- **很难找**：具体负责人姓名（无 Team 页，LinkedIn 也没有美司主页）  
- **成功定义**：不是「找到 Jane Doe」，而是 **诚实标注**「只有公司邮箱，开发信仍写 Dear Team」

---

## 你要做的就 4 件事

```
① 打开官网，抄邮箱/电话/地址
② 搜 1 次 LinkedIn 公司页（可选，你已完成）
③ 验 info@ 邮箱能不能收信（MX）
④ 填下面「结果表」
```

---

## ① 官网（浏览器或 chrome MCP）

按顺序打开，**只抄页面上看得见的内容**，不要猜邮箱。

| 顺序 | 打开这个网址 | 找什么 |
|------|--------------|--------|
| 1 | https://www.decodeckusa.com | 导航里有没有 About、Contact |
| 2 | https://www.decodeckusa.com/contact | **邮箱、电话、地址** |
| 3 | https://www.decodeckusa.com/become-a-dealer | 有没有额外邮箱或人名 |
| 4 | 首页 footer 里的 Privacy 链接（若有） | 有时有 legal@ / info@ |

**v1 已知的 Contact 页内容（你再确认一次）：**

- 邮箱：`info@decodeckusa.com`
- 电话：`520 664 8695`
- 地址：`6000 Powers Ave, Jacksonville, FL`
- 人名：**没有**

---

## ② 搜索（你已经跑过，结论如下）

### 你跑过的第 1 次：试品牌会不会搜乱

- Query：`Decodeck USA`
- **结论**：10 条里 **5 条是别的公司**（澳洲 DecoDeck 等）→ 名字容易混淆

### 你跑过的第 2 次：找 LinkedIn 公司页

- Query：`"Decodeck USA" "decodeckusa.com"`
- **结论**：
  - **没有** 美国 Decodeck USA 的 LinkedIn 公司页
  - 搜出来的是土耳其 DECODECK、挪威 Decodeck 经销商、澳洲 DECO 等
  - **0 个可采纳的联系人姓名**

**→ 搜索这步可以结案，不用再搜。**

---

## ③ 验邮（1 条命令）

在 PowerShell 里：

```powershell
nslookup -type=MX decodeckusa.com
```

| 看到什么 | 含义 |
|----------|------|
| 有 `mail exchanger` / MX 记录 | `info@decodeckusa.com` 记为 **可用**（mx_ok） |
| 没有 MX | 记为 **不可用**（mx_fail） |

---

## ④ 结果表（填这个就够）

**执行日期**：__________

| 项目 | 你的结果 |
|------|----------|
| 官网邮箱 | |
| 官网人名 | 有 / **无** |
| 搜索找到的人 | 有 / **无** |
| info@ MX 验邮 | mx_ok / mx_fail |
| **最终档位** | 见下表 |

### 最终档位（四选一）

| 档位 | 什么意思 | 开发信怎么写 |
|------|----------|--------------|
| **L3** | 找到具体的人 + 个人邮箱可用 | Dear 名 |
| **L2** | 找到具体的人，但没邮箱 | Dear Team，线索里展示人名 |
| **L1** | 没人，但有 **info@** 这类公司邮箱 | Dear Decodeck USA Team → info@ |
| **L0** | 只有表单，没邮箱 | 与现网一样，走联系表单 |

**本条预期档位：L1**（若 info@ 验邮通过）

---

## 写回线索的 JSON（L1 示例）

```json
{
  "lead_id": "lead_20260906_0005",
  "people": [],
  "contacts_patch": [
    {
      "type": "email",
      "value": "info@decodeckusa.com",
      "confidence": "high"
    }
  ],
  "note": "无 Team 页；搜索无 LinkedIn 美司页；仅补公司邮箱，非个人联系人"
}
```

---

## 这条试跑说明了什么？（给产品设计）

1. **小 B2B + 品牌名像 DecoDeck** → 搜索几乎帮不上忙，还会搜出一堆错公司  
2. **官网 Contact 页往往比探索阶段抓到的多**（探索只录了表单，其实有 info@）  
3. **MVP 要分两种「成功」**：
   - 补上了 **公司邮箱**（reachability 提升）  
   - 找到了 **具体联系人**（开发信个性化）  
   不能混为一谈  

4. **以后 Skill 建议**：
   - 先扫官网 Contact，再决定要不要搜索  
   - 搜索必须带 `"公司全名"`，且 **snippet 里必须出现公司全名** 才采纳  
   - 品牌易混淆的线索，UI 提示「可能只能补公司邮箱」

---

## 下一条试跑选什么？

Decodeck 是 **难例**。下一条请选 **官网有 Team/About 人名页** 的公司，才能测「找到具体联系人」的上限。

---

## 文档地图（迷路时看）

| 文档 | 什么时候看 |
|------|------------|
| **本文** | 执行 Decodeck 预研 |
| [v2 方案修订](./联系人Enrichment-spike-v2-方案修订.md) | 想了解为什么要改 v1、10 条怎么抽样 |
| [20-需求](../20-需求-联系人Enrichment.md) | Spike 通过后写正式需求 |
| [v2 详细版](./联系人Enrichment-spike-v2-lead_20260906_0005.md) | 需要 curl/MCP 完整参数时 |
