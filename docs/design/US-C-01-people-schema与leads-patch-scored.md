# US-C-01 详细设计：people[] Schema 与 leads_patch_scored

> **用户故事**：作为业务员，我希望在已有公司线索上补全联系人后，系统能把 Hunter 返回的联系人写入 `people[]`，供开发信选用收件人。  
> **范围**：`people[]` Schema 定义、`leads_patch_scored` MCP 工具、`email_status` 枚举、ID 生成规则。  
> **关联**：[20-需求-联系人Enrichment.md](../20-需求-联系人Enrichment.md) §5、§6.3；[03-数据模型.md](../03-数据模型.md) §3.2

---

## 1. 设计目标

1. 在 `scored.json` 的 lead 上扩展 `people[]` 字段，存储 Hunter 补全的联系人。
2. 提供 `leads_patch_scored` MCP 工具，支持对单条 lead 的 `people[]` 进行 **增量 patch**（不覆盖已有 `contacts`）。
3. 定义 `email_status` 枚举，对齐 Hunter `verification.status` 与实测 `null` 场景。
4. 确保 `leads_score_and_dedupe` **保留** 已有 `people[]`（C10 规则）。

---

## 2. `people[]` Schema 定义

### 2.1 字段表

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | ✅ | 格式 `person_{YYYYMMDD}_{seq}`，当日递增 |
| `name` | string | ✅ | 姓名；Hunter 无 `first_name` 时用邮箱前缀（如 `steve`） |
| `first_name` | string \| null | ❌ | Hunter `first_name` |
| `last_name` | string \| null | ❌ | Hunter `last_name` |
| `title` | string \| null | ❌ | Hunter `position`（常为 null，见实测） |
| `role_match` | string \| null | ❌ | 匹配到的 `buyer_personas` 角色 slug（如 `procurement_manager`）；无匹配为 null |
| `match_reason` | string | ✅ | 排序依据说明（如「personal 邮箱 + confidence 84 + 含 first_name」） |
| `email` | string | ✅ | 邮箱地址 |
| `email_status` | enum | ✅ | 见 §3 `email_status` 枚举 |
| `confidence` | number | ✅ | Hunter `confidence`（0-100） |
| `sources` | array | ✅ | Hunter `sources[]`（至少 1 条，用于 UI 溯源） |
| `provider` | string | ✅ | 固定 `"hunter"` |
| `enriched_at` | string | ✅ | ISO 8601 时间戳 |

### 2.2 `sources[]` 子结构

| 字段 | 类型 | 说明 |
|------|------|------|
| `domain` | string | 来源站域名 |
| `uri` | string | 完整 URL |
| `extracted_on` | string | Hunter 首次发现日期（YYYY-MM-DD） |
| `last_seen_on` | string | Hunter 末次发现日期 |
| `still_on_page` | boolean | 是否仍在页面上 |

### 2.3 完整 JSON 示例

```json
{
  "people": [
    {
      "id": "person_20260914_0001",
      "name": "Steve",
      "first_name": "Steve",
      "last_name": null,
      "title": null,
      "role_match": null,
      "match_reason": "personal 邮箱 + confidence 84 + 含 first_name",
      "email": "steve@pantron.com",
      "email_status": "hunter_valid",
      "confidence": 84,
      "sources": [
        {
          "domain": "kfia.org",
          "uri": "https://kfia.org:443/Page/55/kentucky-wood-expo-kfia-wood-expo",
          "extracted_on": "2026-05-19",
          "last_seen_on": "2026-08-07",
          "still_on_page": true
        }
      ],
      "provider": "hunter",
      "enriched_at": "2026-09-14T06:30:00Z"
    },
    {
      "id": "person_20260914_0002",
      "name": "info",
      "first_name": null,
      "last_name": null,
      "title": null,
      "role_match": null,
      "match_reason": "generic 邮箱 + confidence 81 + 域名官网仍在页",
      "email": "info@pantron.com",
      "email_status": "hunter_unverified",
      "confidence": 81,
      "sources": [
        {
          "domain": "pantron.com",
          "uri": "https://pantron.com",
          "extracted_on": "2026-08-18",
          "last_seen_on": "2026-09-04",
          "still_on_page": true
        }
      ],
      "provider": "hunter",
      "enriched_at": "2026-09-14T06:30:00Z"
    }
  ]
}
```

### 2.4 Zod Schema（TypeScript）

```typescript
import { z } from "zod";

const PersonSourceSchema = z.object({
  domain: z.string(),
  uri: z.string().url(),
  extracted_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  last_seen_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  still_on_page: z.boolean(),
});

const PersonSchema = z.object({
  id: z.string().regex(/^person_\d{8}_\d{4}$/),
  name: z.string().min(1),
  first_name: z.string().nullable(),
  last_name: z.string().nullable(),
  title: z.string().nullable(),
  role_match: z.string().nullable(),
  match_reason: z.string().min(1),
  email: z.string().email(),
  email_status: z.enum([
    "hunter_valid",
    "hunter_accept_all",
    "hunter_invalid",
    "hunter_unknown",
    "hunter_unverified",
  ]),
  confidence: z.number().int().min(0).max(100),
  sources: z.array(PersonSourceSchema).min(1),
  provider: z.literal("hunter"),
  enriched_at: z.string().datetime(),
});

// 用于 leads_patch_scored 的输入（不含 id / enriched_at，由 MCP 生成）
const PersonInputSchema = PersonSchema.omit({ id: true, enriched_at: true });

export { PersonSchema, PersonInputSchema, PersonSourceSchema };
```

---

## 3. `email_status` 枚举与 Hunter 映射

### 3.1 枚举值

| 值 | 说明 | 可作默认收件人 | UI 徽章 |
|----|------|----------------|---------|
| `hunter_valid` | Hunter `verification.status === "valid"` | ✅ 优先 | 绿色 ✅ |
| `hunter_accept_all` | Hunter `accept_all: true` 或 `status === "accept_all"` | ⚠️ 可选 | 黄色 ⚠️ |
| `hunter_invalid` | `invalid` / `disposable` | ❌ 禁用 | 红色 ❌ |
| `hunter_unknown` | Verifier 202 未决 / `unknown` | ❌ 禁用 | 灰色 ? |
| `hunter_unverified` | Domain Search 返回 `verification.status: null`（实测约 85%） | ⚠️ 可选 | 灰色 ⚪ |

### 3.2 映射规则

```typescript
function mapEmailStatus(
  hunterVerification: { status: string | null } | null,
  domainAcceptAll: boolean
): "hunter_valid" | "hunter_accept_all" | "hunter_invalid" | "hunter_unknown" | "hunter_unverified" {
  if (!hunterVerification || hunterVerification.status === null) {
    return "hunter_unverified"; // Domain Search 未验证
  }
  switch (hunterVerification.status) {
    case "valid":
      return "hunter_valid";
    case "accept_all":
      return "hunter_accept_all";
    case "invalid":
    case "disposable":
      return "hunter_invalid";
    case "unknown":
    case "webmail":
      return "hunter_unknown";
    default:
      return domainAcceptAll ? "hunter_accept_all" : "hunter_unverified";
  }
}
```

### 3.3 实测数据参考

基于 `pantron.com` Domain Search 实测（2026-09-14）：

| 邮箱 | `verification.status` | `email_status` | 说明 |
|------|----------------------|----------------|------|
| steve@pantron.com | `valid` | `hunter_valid` | 已验证，可首选 |
| info@pantron.com | `null` | `hunter_unverified` | 未验证，灰标 |
| sales@pantron.com | `null` | `hunter_unverified` | 未验证，灰标 |

---

## 4. `leads_patch_scored` MCP 工具

### 4.1 工具签名

```typescript
server.tool(
  "leads_patch_scored",
  "Patch a scored lead's people[] with enriched contacts (e.g. from Hunter). Does NOT overwrite existing contacts[].",
  {
    product_id: z.string().describe("Product ID, e.g. prod_20260712_001"),
    lead_id: z.string().describe("Lead ID to patch, e.g. lead_20260709_0001"),
    people: z.array(PersonInputSchema).describe("Enriched contacts to add (no limit, sorted by priority)"),
  },
  async ({ product_id, lead_id, people }) => { ... }
);
```

### 4.2 行为规则

| 规则 | 说明 |
|------|------|
| **不覆盖 `contacts`** | `people[]` 与 `contacts[]` 独立；patch 只写 `people[]` |
| **去重** | 按 `email` 去重：若 `people[]` 已有相同 `email`，更新该条（覆盖 `match_reason` / `email_status` / `confidence`） |
| **ID 生成** | `id` 由 MCP 生成（`person_{YYYYMMDD}_{seq}`），`enriched_at` 为当前时间 |
| **保留已有** | 已有 `people[]` 中不在本次 patch 的条目 **保留** |
| **排序** | `people[]` 按 §6.3 邮箱质量排序规则 **降序排列**（最高优先级在前），由 MCP 在写入时排序 |
| **lead 存在性** | `lead_id` 必须在 `scored.json` 中存在，否则报错 `NOT_FOUND` |

### 4.3 返回结构

```json
{
  "success": true,
  "product_id": "prod_20260712_001",
  "lead_id": "lead_20260709_0001",
  "people_added": 2,
  "people_updated": 0,
  "people_total": 2,
  "people": [
    {
      "id": "person_20260914_0001",
      "email": "steve@pantron.com",
      "email_status": "hunter_valid"
    }
  ]
}
```

### 4.4 错误码

| 错误码 | 条件 |
|--------|------|
| `NOT_FOUND` | `product_id` 或 `lead_id` 不存在 |
| `VALIDATION_FAILED` | `people` 字段不符合 Schema |

---

## 5. `leads_score_and_dedupe` 保留 `people[]`（C10）

### 5.1 当前行为

`leads_score_and_dedupe` 从 `raw/*.jsonl` 重新计算 `scored.json`，**会覆盖** 整个 `scored.json`。

### 5.2 修改要求

在 `scoreAndDedupeLeads()` 中：

1. 读取旧 `scored.json`（若存在）。
2. 建立 `dedupe_key → people[]` 映射。
3. 写入新 `scored.json` 时，若新 lead 的 `dedupe_key` 在旧映射中，**保留** 旧 `people[]`。
4. 若新 lead 的 `dedupe_key` 不在旧映射中，`people` 初始化为 `[]`。

### 5.3 伪代码

```typescript
function scoreAndDedupeLeads(root: string, product_id: string) {
  const oldScored = loadScoredLeads(root, product_id);
  const oldPeopleMap = new Map<string, Person[]>();
  if (oldScored) {
    for (const lead of oldScored.leads) {
      if (lead.people && lead.people.length > 0) {
        oldPeopleMap.set(lead.dedupe_key, lead.people);
      }
    }
  }

  const newLeads = computeScoredLeads(...); // 现有逻辑
  for (const lead of newLeads) {
    lead.people = oldPeopleMap.get(lead.dedupe_key) ?? [];
  }

  saveScoredLeads(root, product_id, newLeads);
  // ...
}
```

---

## 6. ID 生成规则

### 6.1 `person_id` 格式

```
person_{YYYYMMDD}_{seq}
```

- `seq` 为 **4 位数字**，当日递增（与 `lead_id` 的 3 位区分，避免冲突）。
- 存储路径：`data/leads/{product_id}/.person_seq`（当日 seq 计数器，格式 `YYYY-MM-DD:NNNN`）。

### 6.2 生成函数

```typescript
function generatePersonId(root: string): string {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const seqPath = path.join(root, "data", "leads", product_id, ".person_seq");
  const seq = readAndIncrementSeq(seqPath, today);
  return `person_${today}_${seq.toString().padStart(4, "0")}`;
}
```

---

## 7. 测试用例

### 7.1 Schema 校验

| 用例 | 输入 | 预期 |
|------|------|------|
| 正常 personal 邮箱 | `{ name: "Steve", email: "steve@pantron.com", email_status: "hunter_valid", confidence: 84, sources: [...] }` | ✅ 通过 |
| `sources` 为空 | `{ ..., sources: [] }` | ❌ `VALIDATION_FAILED` |
| `email_status` 非法 | `{ ..., email_status: "unknown_status" }` | ❌ `VALIDATION_FAILED` |
| `confidence` 超界 | `{ ..., confidence: 101 }` | ❌ `VALIDATION_FAILED` |

### 7.2 `leads_patch_scored` 行为

| 用例 | 操作 | 预期 |
|------|------|------|
| 新增 2 条 people | patch 2 条新邮箱 | `people_added: 2`, `people_total: 2` |
| 重复 email | patch 已有 `steve@pantron.com` | `people_updated: 1`, 覆盖 `match_reason` |
| 排序 | patch 3 条，confidence 分别为 84/81/78 | `people[]` 按 confidence 降序：84 → 81 → 78 |
| 保留已有 | patch 1 条新邮箱，已有 2 条 | `people_total: 3`，已有 2 条保留 |

### 7.3 `leads_score_and_dedupe` 保留 `people[]`

| 用例 | 操作 | 预期 |
|------|------|------|
| 重新评分 | 已有 `people[]` 的 lead 重新评分 | `people[]` 保留，`dedupe_key` 相同 |
| 新 lead | 新域名 lead 评分 | `people: []` |

---

## 8. 实现清单

| 文件 | 改动 |
|------|------|
| `workspace/mcp-servers/lead-store/src/person-types.ts` | 新增 `PersonSchema` / `PersonInputSchema` / `PersonSourceSchema` |
| `workspace/mcp-servers/lead-store/src/person-id.ts` | 新增 `generatePersonId()` |
| `workspace/mcp-servers/lead-store/src/lead-storage.ts` | 修改 `scoreAndDedupeLeads()` 保留 `people[]`；新增 `patchScoredLead()` |
| `workspace/mcp-servers/lead-store/src/index.ts` | 注册 `leads_patch_scored` 工具 |
| `workspace/mcp-servers/lead-store/src/lead-types.ts` | `ScoredLeadSchema` 增加 `people: z.array(PersonSchema).optional()` |

---

## 9. 验收标准

- [ ] `people[]` Schema 通过 zod 校验（含 `hunter_unverified` 状态）。
- [ ] `leads_patch_scored` 可新增/更新 `people[]`，不覆盖 `contacts[]`。
- [ ] `people[]` 按 §6.3 排序规则降序排列（最高优先级在前）。
- [ ] `leads_score_and_dedupe` 后已有 `people[]` 保留。
- [ ] `person_id` 格式 `person_YYYYMMDD_NNNN`，当日递增。
- [ ] 单测覆盖 Schema 校验、patch 行为、排序、保留逻辑。

---

## 10. 变更记录

| 日期 | 说明 |
|------|------|
| 2026-09-14 | 初稿：基于 Hunter 实测（pantron.com）定义 `people[]` Schema、`email_status` 枚举、`leads_patch_scored` 工具 |
| 2026-09-14 | **修订**：移除 `people[]` 3 条上限；改为 MCP 写入时按 §6.3 排序规则降序排列 |
