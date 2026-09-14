# DuxxBak · 联系人预研（简明版 · Type-B 对照）

> **用途**：与 Decodeck（难例）对照，试 **「能不能找到具体的人」**  
> **Decodeck 难例**：[联系人Enrichment-spike-简明-Decodeck.md](./联系人Enrichment-spike-简明-Decodeck.md)

---

## 为什么选这家？

| 对比 | Decodeck USA | DuxxBak |
|------|--------------|---------|
| 品牌 | 易与 DecoDeck 混淆 | **DuxxBak** 较独特 |
| Team 页 | 无 | 无，但 **新闻稿里有 VP 姓名+邮箱** |
| LinkedIn 公司页 | 未找到美司 | **有** → `linkedin.com/company/greenbay-decking` |
| 行业 | WPC 分销 | 矿物基 **复合地板** 制造/经销 |

---

## 线索 JSON（可当 scored 样本）

```json
{
  "id": "lead_spike_duxxbak_001",
  "company": {
    "name": "DuxxBak Composite Decking",
    "website": "https://duxxbakdecking.com",
    "country": "US",
    "description": "美国威斯康星 Green Bay 的矿物基复合地板制造商，主打防水 shed-deck 系统；有 Dealer / Certified Contractor 计划，面向全美经销商与承包商。"
  },
  "score": 82,
  "score_breakdown": {
    "product_match": 85,
    "purchase_intent": 90,
    "size_fit": 75,
    "geo_match": 88,
    "reachability": 55,
    "competition": 78
  },
  "tier": "high",
  "status": "new",
  "dedupe_key": "duxxbakdecking.com",
  "source_url": "https://duxxbakdecking.com",
  "match_reason": "美国 WPC/复合地板制造与分销，Dealer 计划与绿森地板/墙板出口场景匹配",
  "contacts": [],
  "round": "spike",
  "discovered_at": "2026-09-08T00:00:00.000Z"
}
```

---

## 4 步执行

### ① 官网（按序打开）

| # | URL |
|---|-----|
| 1 | https://duxxbakdecking.com |
| 2 | https://duxxbakdecking.com/contact/ |
| 3 | https://duxxbakdecking.com/about/ |
| 4 | https://duxxbakdecking.com/become-a-certified-contractor/ |
| 5 | https://duxxbakdecking.com/category/press-release/ （或任一篇新闻，见下） |
| 6 | https://duxxbakdecking.com/duxxbak-composite-decking-partners-with-hall-forest-products-to-expand-distribution-in-the-pacific-northwest/ |

**第 6 步是重点**：页面上应有（请本地再确认）：

- **Eddie Holzem** · Vice President of Sales & Marketing  
- **eholzem@duxxbakdecking.com** · 920-419-7601  

→ 若确认，这是 **P1 具名 + 个人/角色邮箱**，比 Decodeck 的 info@ 高一档。

---

### ② 搜索（3 次，全文如下）

**S1 · LinkedIn 公司页**

```json
{
  "query": "\"DuxxBak Composite Decking\" \"duxxbakdecking.com\"",
  "language": "en",
  "search_depth": "advanced",
  "max_results": 5,
  "include_domains": ["linkedin.com/company"]
}
```

**S2 · LinkedIn 个人摘要**

```json
{
  "query": "\"DuxxBak Composite Decking\" \"Green Bay\"",
  "language": "en",
  "search_depth": "advanced",
  "max_results": 10,
  "include_domains": ["linkedin.com/in"]
}
```

**S3 · 地址锚定（S2 若仍 0 人再跑）**

```json
{
  "query": "\"DuxxBak Composite Decking\" \"1518 S Broadway\"",
  "language": "en",
  "search_depth": "advanced",
  "max_results": 10,
  "include_domains": ["linkedin.com/in"]
}
```

**采纳规则**：title/snippet **必须含 `DuxxBak` 或 `Green Bay Decking`**；First+Last 全名；snippet 无公司名 → 丢弃。

**禁止执行：**

```
DuxxBak CEO OR founder
DuxxBak procurement Green Bay
DuxxBak
```

---

### ③ 验邮

对官网/新闻稿里出现的每个 `@duxxbakdecking.com` 邮箱：

```powershell
nslookup -type=MX duxxbakdecking.com
```

预期验：

- `eholzem@duxxbakdecking.com`（新闻稿明文）

---

### ④ 结果表

| 项目 | 你的结果 |
|------|----------|
| 官网具名 | 预期 **Eddie Holzem** |
| 官网邮箱 | 预期 **eholzem@...** |
| 搜索补充的人 | |
| 邮箱 mx_ok | |
| **档位** | 预期 **L2 或 L3** |

| 档位 | 含义 |
|------|------|
| **L3** | 有具名 + 个人邮箱 mx_ok → `Dear Eddie` |
| **L2** | 有具名、无可用邮箱 |
| **L1** | 仅公司电话/表单 |
| **L0** | 几乎无联系信息 |

---

## 写回 JSON 示例（L3 预期）

```json
{
  "lead_id": "lead_spike_duxxbak_001",
  "people": [
    {
      "name": "Eddie Holzem",
      "title": "Vice President of Sales and Marketing",
      "role_match": "sales_director",
      "match_reason": "官网新闻稿 press release 署名 VP Sales & Marketing",
      "email": "eholzem@duxxbakdecking.com",
      "email_status": "mx_ok",
      "sources": [
        {
          "type": "website",
          "url": "https://duxxbakdecking.com/duxxbak-composite-decking-partners-with-hall-forest-products-to-expand-distribution-in-the-pacific-northwest/"
        }
      ]
    }
  ],
  "outreach": {
    "best_recipient": "eholzem@duxxbakdecking.com",
    "greeting": "Dear Eddie"
  }
}
```

> 以上为 **预期**，须你 Phase A 本地 snapshot 确认后再写入。

---

## 与 Decodeck 怎么对比

| | Decodeck | DuxxBak |
|---|----------|---------|
| 预期档位 | **L1**（仅 info@） | **L2/L3**（新闻稿有人） |
| 说明 | 公开信息少 | 官网新闻 + LinkedIn 公司页存在 |

两条都跑完，才能回答 MVP：**多少比例能找得到人，多少只能补公司邮箱。**
