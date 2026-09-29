# US-EI-03 详细设计：Places 超过 20 条自动翻页

> **用户故事**：作为调用 places-api 的技能，我希望只声明要多少条地点，以便超过 Google 单次 20 条时不必自己翻页。  
> **范围**：`places_text_search` 在请求条数 > 20 时，由 MCP 用 `nextPageToken` / `pageToken` 翻页、去重、合并后再返回。  
> **依赖**：[24-需求-探索强度.md](../24-需求-探索强度.md) §4.2、I8；US-EI-03 验收要点。与 US-EI-01 **无编码依赖**（不读 `exploreIntensity`）。  
> **不在本期**：R3 技能仍传 20、详情仍 15（**US-EI-06**）；搜索条数与补官网（**US-EI-05**）；扩展关键词目标（**US-EI-04**）。  
> **文档位置**：`docs/design/`

上游依据（Places API New，Text Search）：单页 `pageSize` 为 1～20，超过 20 会被收成 20；要下一页必须在 `X-Goog-FieldMask` 里带上 `nextPageToken`，并把该值放进下一次请求的 `pageToken`。除 `pageSize`、`pageToken`、已废弃的 `maxResultCount` 外，其余参数必须与上一页相同。全部页合计最多 **60** 条。`nextPageToken` 不是地点字段，掩码里加上它不会把 Text Search 从 Pro 升到 Enterprise（掩码仍不含 `websiteUri`）。

---

## 0. 相对现网

| 现网 | **本期（EI-03）** |
|------|-------------------|
| 工具参数 `pageSize` 为 **1～20**，默认 20，说明写「不翻页」 | 同一参数改为「希望返回的条数」，**1～60**，默认仍是 20 |
| `textSearchCustom` 一次 POST，Google `pageSize` 原样送出 | ≤20：仍一次 POST，行为与现在一致。>20：MCP 按每页最多 20 条翻页后合并 |
| FieldMask 只有 `places.id,places.displayName,places.formattedAddress,places.types,places.businessStatus` | ≤20 **不改**这条掩码。>20 的每一页在末尾追加 `,nextPageToken`，否则 Google 不给翻页令牌 |
| 响应不带 `nextPageToken` | **仍然不带**。调用方只看 `places[]` |
| 缓存键含 `pageSize` | **沿用**。键里的数是调用方要的条数，所以 20 条缓存不能命中 40 条请求 |
| R3 技能写死 `pageSize=20`、详情 15 | **不改技能**。本故事只让「传入 40」变得可用，谁来传 40 留到 US-EI-06 |

---

## 1. 目标与非目标

### 1.1 目标

1. 调用方只传要多少条，不传页码、也不看到 `nextPageToken`。  
2. 要 ≤20 条时，仍是一次 Text Search，请求体、字段掩码、响应形状与现网一致。  
3. 要 >20 条时，MCP 自动翻页、按 `placeId` 去重、按先出现的顺序合并，再截到请求条数。  
4. 上游没有下一页时，返回已经合并到的条数，不为凑不满而失败。  
5. 缓存按请求条数区分；只有整次合并成功才写入。

### 1.2 非目标

| 不做 | 归属 |
|------|------|
| 技能改传 10 / 20 / 40，详情改为实际条数的 3/4 | **US-EI-06** |
| 读探索强度 | US-EI-01 已有档位；本故事不调用 |
| `place_details`、Details 缓存、连通性探测 | 探测仍 `pageSize: 1`，一次请求 |
| 搜索 `num_results`、补官网次数 | **US-EI-05** |
| 官方网关 `gateway` | 仍返回 `PLACES_GATEWAY_NOT_READY` |
| 把 Google 单页上限从 20 抬高后原样转发 | 上游会把 >20 收成 20；必须自己翻页 |

---

## 2. 已确认选型（Q 表）

| 项 | 决定 |
|----|------|
| **Q1 参数名** | **继续叫 `pageSize`**。对调用方它表示希望返回的条数。US-EI-06 将传 `pageSize: 10 \| 20 \| 40`，不必再学一个新参数。不增加 `pageToken` 入参 |
| **Q2 取值** | 整数 **1～60**，默认 **20**。61 及以上、0、负数、非整数由工具 schema 拒绝（`PLACES_INVALID_ARGUMENT`），不静默收成 60。60 来自上游「各页合计最多 60 条」；产品高档只要 40，工具本身放到上游硬顶 |
| **Q3 ≤20** | 一次 `textSearchCustom`。Google `pageSize` = 请求值。FieldMask 用现有 `TEXT_SEARCH_FIELD_MASK`，**不**加 `nextPageToken` |
| **Q4 >20 的每一页** | Google `pageSize` = `min(20, 还差多少条)`。`textQuery`、`languageCode`、`regionCode` 与第一页相同。从第二页起把上一页的 `nextPageToken` 放进 `pageToken`。FieldMask = `TEXT_SEARCH_FIELD_MASK + ",nextPageToken"`。官方允许后续页的 `pageSize` 与第一页不同 |
| **Q5 何时停止** | 满足任一即停：没有非空 `nextPageToken`；本页 `places` 为空；去重后已达到请求条数；已经发出 **3** 次 Text Search（20×3=60）。然后 `slice(0, 请求条数)` 返回。条数不够 **不算失败** |
| **Q6 去重** | 按规范化后的 `placeId`。先出现的保留，后面的丢掉。去重后仍不够、且还有令牌、且未满 3 页，则继续下一页 |
| **Q7 中途失败** | 某一页 HTTP 非 2xx，或响应不是合法 JSON：整次工具调用失败，**不**把已拿到的前几页当作成功结果，**不**写搜索缓存。前几页的费用已经发生，重试会再请求；避免把残缺列表缓存 24 小时 |
| **Q8 等待** | 官方 Text Search (New) 翻页示例是立刻带上 `pageToken`。实现 **不**插入固定休眠，也不在令牌报错时自动重试 |
| **Q9 响应** | 形状不变：`provider`、`cached`、`textQuery`、`languageCode`、`regionCode?`、`pageSize`、`places`。响应里的 `pageSize` 回显**调用方要的条数**。实际条数看 `places.length`，可以更短。US-EI-06 的「实际返回条数」必须用 `places.length`，不能用响应里的 `pageSize` |
| **Q10 缓存** | 键算法不变：`sha256(textQuery\|languageCode\|regionCode\|pageSize)`，TTL 24h。只在合并成功后写一条，键为本次请求条数。不把第一页另存成 `pageSize=20`。读 40 不会命中 20，读 20 也不会命中 40 |
| **Q11 计费** | 每向 Google 成功或失败地发出一次 Text Search，计一次。请求 40 且两页都打到上游 = 2 次。缓存命中 = 0 次。中档技能仍传 20，仍是 1 次 |
| **Q12 技能与桌面** | 不改 `discover-leads-r3`、`agent-runner` 里的 `pageSize=20` / 详情 15，不改设置页，不读 `exploreIntensity` |

---

## 3. 调用过程

无新 prefs、无新 IPC。工具入口仍是 `places_text_search`。

```text
places_text_search({ textQuery, languageCode, regionCode?, pageSize })
  → pageSize 缺省为 20；不在 1～60 则 schema 拒绝
  → 读缓存，键含 pageSize（请求条数）
  → 命中：cached=true，places 为当时合并后的列表
  → 未命中且 pageSize ≤ 20：
       一次 Text Search，Google pageSize = pageSize，现网 FieldMask
  → 未命中且 pageSize > 20：
       collected = []
       token = 空
       重复至多 3 次：
         googlePageSize = min(20, pageSize - collected.length)
         POST searchText
           body: textQuery, languageCode, regionCode?, pageSize=googlePageSize
           若 token 非空：再加上 pageToken
           FieldMask: 现网地点字段 + nextPageToken
         按 placeId 追加新地点
         若已满 / 无令牌 / 本页没有地点：停止
         否则 token = nextPageToken
       places = collected 的前 pageSize 条
  → 整次成功才 writeSearchCache
  → 响应不含 nextPageToken、不含页码
```

第一页与后续页的 Google 请求示例（调用方要 40 条）：

```http
POST https://places.googleapis.com/v1/places:searchText
X-Goog-Api-Key: ${GOOGLE_PLACES_API_KEY}
X-Goog-FieldMask: places.id,places.displayName,places.formattedAddress,places.types,places.businessStatus,nextPageToken

{ "textQuery": "…", "languageCode": "de", "regionCode": "DE", "pageSize": 20 }
```

```http
POST https://places.googleapis.com/v1/places:searchText
X-Goog-FieldMask: （与上一页相同，含 nextPageToken）

{ "textQuery": "…", "languageCode": "de", "regionCode": "DE", "pageSize": 20, "pageToken": "<上一页 nextPageToken>" }
```

调用方最终看到的仍是一份 `places`（最多 40 条），没有 `pageToken`。

---

## 4. 改动文件

| 路径 | 改动 |
|------|------|
| `workspace/mcp-servers/places-api/src/custom.ts` | 抽出「一页」解析：地点列表 + 可选 `nextPageToken`。新增按请求条数合并的函数。`textSearchCustom` 保持「一次请求、只返回地点」，供 ≤20 与现有单测使用。≤20 的 FieldMask 常量不改字面量 |
| `workspace/mcp-servers/places-api/src/index.ts` | `pageSize` schema 改为 `min(1).max(60).default(20)`，描述改为希望返回的条数、超过 20 由服务端翻页。处理函数改为调用合并函数。错误映射沿用 `PlacesHttpError` / `PlacesResponseInvalidError` |
| `workspace/mcp-servers/places-api/src/custom.test.ts` | 覆盖 §6 的翻页、停页、去重、中途失败、≤20 掩码不变 |
| `workspace/mcp-servers/places-api/src/cache.test.ts` | 补一条：同一查询 `pageSize` 20 与 40 的缓存键不同，且互不命中 |
| `docs/24-需求-探索强度.md` | US-EI-03 状态改为详设已立 |

**不改**：`cache.ts` 的键与 TTL、`types.ts` 的响应字段、`place_details`、`places-connectivity.ts`、技能、`agent-runner.ts`、`explore-intensity*.ts`。历史详设 [US-E-07](US-E-07-Places-MCP自定义Key.md) 里「pageSize 1～20、不翻页」不再回改，以本文为准。

---

## 5. 验收对照

| 验收要点 | 详设落点 |
|----------|----------|
| 请求 ≤20：一次 Text Search，行为与现在一致 | §2 Q3；FieldMask 与现网常量相同 |
| 请求 >20：按每页最多 20 条用令牌翻页，合并后返回；调用方看不到页码 | §2 Q4～Q6、Q9；§3 |
| 上游没有下一页：返回已合并条数，不为凑数失败 | §2 Q5 |
| 每翻一页再计一次 Text Search | §2 Q11 |
| 缓存按请求条数区分，20 不能当作 40 命中 | §2 Q10 |
| 不改 R3 技能里的 20 与详情 15 | §2 Q12 |

---

## 6. 测试计划

用现有 `places-api` 的 `node:test` + 假 `fetch`，不打真实 Google。

| # | 场景 | 期望 |
|---|------|------|
| T1 | 请求 20 | 一次 POST；body `pageSize` 为 20 且无 `pageToken`；FieldMask **等于**现有 `TEXT_SEARCH_FIELD_MASK` |
| T2 | 请求 10 | 一次 POST；Google `pageSize` 为 10 |
| T3 | 请求 40，第一页 20 条且带 `nextPageToken`，第二页 20 条 | 两次 POST；第二次 body 含相同 `textQuery` / `languageCode` / `regionCode`、`pageSize: 20` 与 `pageToken`；两次掩码都含 `nextPageToken` 且仍不含 `websiteUri`；合并结果 40 条；返回值本身无令牌 |
| T4 | 请求 40，第一页 20 条但没有 `nextPageToken` | 只请求一次；返回 20 条；不抛错 |
| T5 | 请求 40，第二页 HTTP 500 | 抛 `PlacesHttpError`；调用方拿不到第一页的残缺列表 |
| T6 | 请求 30，第一页 20 条有令牌 | 第二页 Google `pageSize` 为 10；结果最多 30 条 |
| T7 | 两页出现相同 `placeId`，且第二页之后仍有令牌、去重后不足 | 保留第一次出现的顺序；在 3 页以内继续要下一页 |
| T8 | 已写出 `pageSize=20` 的缓存 | 读取 `pageSize=40` 为未命中；反向同样未命中 |
| T9 | 请求 61 | 工具 schema 拒绝，不发 HTTP |

`npm test`（`workspace/mcp-servers/places-api`）需通过。不要求手点 R3：技能仍传 20，探索行为与本故事之前相同。

---

## 7. 修订记录

| 日期 | 说明 |
|------|------|
| 2026-09-29 | 初稿：`pageSize` 改为希望返回的条数（1～60）；超过 20 由 MCP 翻页合并；≤20 与技能保持现网 |
| 2026-09-29 | 编码落地 |
