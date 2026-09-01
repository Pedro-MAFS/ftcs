# US-E-07 Places MCP 与自定义 API Key（BYOK 直连）

> **用户故事**：[../17-需求-业务效率工具.md](../17-需求-业务效率工具.md) · US-E-07  
> **状态**：编码已落地（待手工 P1–P10 验收）  
> **范围**：新增 `places-api` **MCP**（`provider=custom` 直连 Google）；设置页 **可选** 填写 **Google Places API Key**；OpenCode 运行时注入；**不写 Lead、不做 Preflight、不接探索页按钮**  
> **依赖**：[R3-Places-API-预研.md](R3-Places-API-预研.md)（FieldMask、Postman spike 已通过）；US-E-06 已落地（R3 出词形态）；现网 `search-api` / 设置页 `.env` 注入模式（对齐 Tavily BYOK）  
> **不做**：`provider=gateway` 实现（US-E-10）；`discover-leads-r3`（US-E-08）；探索页「开始 R3」与 Preflight（US-E-09）；Geocoding 工具（可 E-08 仍用 `regionCode` + `textQuery`）；Places 用量/余额 UI（E-10）  
> **文档位置**：`docs/design/`

---



## 0. 相对现网（US-E-06 之后）


| 现网                                                       | **本期（E-07）**                                                   |
| -------------------------------------------------------- | -------------------------------------------------------------- |
| 无 Places MCP；R3 词仅预览                                     | Agent / Cursor 可调 `places-api` 拿 Text Search / Details 结构化结果   |
| 设置页无 Places Key                                          | **可选** `GOOGLE_PLACES_API_KEY`；留空时 R1/R2 **不受影响**              |
| OpenCode 仅 `lead-store` + `search-api` + chrome-devtools | 模板与运行时注册 `places-api`                                          |
| R3 发现层仅在预研/需求文档                                          | **custom BYOK** 直连 `places.googleapis.com`，FieldMask 按预研 §4 冻结 |


---



## 1. 已确认选型


| 项                  | 决定                                                                                                                                                                                              |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Q1 MCP 名称**      | `places-api`（与 `search-api` 并列；包路径 `workspace/mcp-servers/places-api/`）                                                                                                                         |
| **Q2 首发 Provider** | 仅实现 `custom`（读 `GOOGLE_PLACES_API_KEY` 直连 Google）。`PLACES_PROVIDER=gateway` 在 E-07 **占位**：若被误设则工具返回结构化错误 `PLACES_GATEWAY_NOT_READY`，文案指向 E-10                                                   |
| **Q3 与模型/搜索通道关系**  | Places Key **独立于** `FTCS_CHANNEL_MODE`（官方模型 + 官方 Tavily 的用户仍可 BYOK Places 跑 R3）。E-07 **不**因未配 Key 阻断 R1/R2                                                                                      |
| **Q4 Key 存储**      | 工作区 `.env` 键 `GOOGLE_PLACES_API_KEY`；明文仅本机；设置快照 `placesApiKeySet` **/** `placesApiKeyMasked`（对齐 `tavilyApiKeySet`）；保存时掩码占位不覆盖                                                                   |
| **Q5 FieldMask**   | 冻结为预研 §4.2 / §4.3（Search **Pro** + Details **Enterprise**）；**禁止**在 Text Search 请求 `websiteUri`                                                                                                  |
| **Q6 工具面**         | `places_text_search`、`place_details`；**不做** `places_geocode`（E-07）；E-08 用 `languageCode` + `regionCode` + 自然语言 `textQuery`                                                                      |
| **Q7 pageSize**    | 默认 **20**，上限 **20**；**不**暴露 `nextPageToken` / 翻页（首发不翻页）                                                                                                                                         |
| **Q8 Places 缓存**   | Text Search 与 Details 均 **24h** TTL（与 search-api 一致）；Search 键 = `textQuery` + `languageCode` + `regionCode` + `pageSize`；Details 键 = `place_id` + `languageCode`；**不**长期缓存整段 Places JSON 到 Lead |
| **Q9 日志与错误**       | 日志 **不得**打印完整 API Key；HTTP 4xx/5xx 映射为 MCP 结构化 JSON（含 `code` / `message` / 可选 `http_status`）                                                                                                    |
| **Q10 验收方式**       | Cursor / OpenCode **直调 MCP**（等价 Postman）；**不**要求 E-08 Skill 或探索页按钮                                                                                                                              |
| **Q11 Preflight**  | **本故事不做**；Key 缺失时工具返回 `MISSING_PLACES_API_KEY`；E-09 再在「开始 R3」前拦截                                                                                                                                |
| **Q12 设置 UI 位置**   | **设置 → 探索** 区块内新增「R3 地图发现（Google Places）」；说明 **仅 R3 需要**、**可选**                                                                                                                                 |


---



## 2. 目标与非目标



### 2.1 目标

1. Skill / 开发者可通过 MCP **稳定调用** Places Text Search 与 Place Details（custom BYOK）。
2. 用户在设置页 **可选** 配置 Key；保存后 OpenCode 重启/重连 MCP 即可注入。
3. 返回 JSON **稳定、字段精简**，供 US-E-08 过滤与补官网管道消费。
4. Provider 抽象就绪，US-E-10 仅增 gateway 分支，**不改**工具名与对外 JSON 形态。



### 2.2 非目标


| 不做                                     | 归属                      |
| -------------------------------------- | ----------------------- |
| `discover-leads-r3`、写 `raw/R3.jsonl`   | US-E-08                 |
| 「开始 R3」、Preflight 弹窗                   | US-E-09                 |
| 网关 `POST /v1/places/...`               | US-E-10 / token-gateway |
| `max_details_per_keyword` 截断、types 黑名单 | US-E-08 Skill 逻辑        |
| 打开 Google 地图真页                         | §5.7 禁止                 |
| 强制所有用户填 Key                            | §14.3                   |


---



## 3. MCP 工具契约（冻结）



### 3.1 公共约定

- 所有工具返回 **单行 JSON 字符串**（`content[0].text`），与 `search-api` 一致。  
- 成功 payload 含 `"error": false` 或省略 `error`；失败 `"error": true` + `code` + `message`。  
- `provider` 字段：`custom` | `gateway`（E-07 仅 custom 成功路径）。



### 3.2 `places_text_search`

**用途**：阶段 1 发现 — 按 R3 自然语言句查本地商户列表（Pro 档 FieldMask）。


| 参数             | 类型     | 必填  | 默认   | 说明                                               |
| -------------- | ------ | --- | ---- | ------------------------------------------------ |
| `textQuery`    | string | 是   | —    | 与 expansion `query` 原样对齐（US-E-06 城市+品类句）         |
| `languageCode` | string | 否   | `en` | BCP-47 语言，如 `de`、`en`；优先用关键词 `language`          |
| `regionCode`   | string | 否   | —    | ISO 3166-1 **alpha-2**，如 `DE`、`US`；E-08 从画像/句中推断 |
| `pageSize`     | number | 否   | `20` | 1～20                                             |


**Google 请求**（实现参考）：

```http
POST https://places.googleapis.com/v1/places:searchText
X-Goog-Api-Key: ${GOOGLE_PLACES_API_KEY}
X-Goog-FieldMask: places.id,places.displayName,places.formattedAddress,places.types,places.businessStatus
Content-Type: application/json

{
  "textQuery": "Bodenbelag Fachhandel München",
  "languageCode": "de",
  "regionCode": "DE",
  "pageSize": 20
}
```

**成功响应 schema（冻结）**：

```json
{
  "provider": "custom",
  "cached": false,
  "textQuery": "Bodenbelag Fachhandel München",
  "languageCode": "de",
  "regionCode": "DE",
  "pageSize": 20,
  "places": [
    {
      "placeId": "ChIJ…",
      "displayName": "Example Bodenbelag GmbH",
      "formattedAddress": "…, München, Germany",
      "types": ["store", "…"],
      "businessStatus": "OPERATIONAL"
    }
  ]
}
```

- `displayName`：取 Google `displayName.text`（若为多语言对象则按 `languageCode` 或默认 text）。  
- **不**返回 `websiteUri`（留给 Details）。  
- **不**返回 `nextPageToken`。  
- `cached`：命中 `data/cache/places/search/` 时为 `true`。



### 3.3 `place_details`

**用途**：阶段 2 — 对单个 `placeId` 拉 `websiteUri` 等（Enterprise 档）。


| 参数             | 类型     | 必填  | 说明                        |
| -------------- | ------ | --- | ------------------------- |
| `placeId`      | string | 是   | Text Search 的 `places.id` |
| `languageCode` | string | 否   | 同 Search                  |


**Google 请求**：

```http
GET https://places.googleapis.com/v1/places/{placeId}
X-Goog-Api-Key: ${GOOGLE_PLACES_API_KEY}
X-Goog-FieldMask: id,displayName,websiteUri,formattedAddress,types
```

**成功响应 schema（冻结）**：

```json
{
  "provider": "custom",
  "cached": true,
  "placeId": "ChIJ…",
  "displayName": "Example Bodenbelag GmbH",
  "formattedAddress": "…",
  "types": ["store"],
  "websiteUri": "https://example.com/"
}
```

- `websiteUri` 可缺失或空字符串；E-08 走 Tavily 补官网。  
- `cached`：命中 `data/cache/places/details/` 时为 `true`。



### 3.4 错误码（冻结）


| code                       | 何时                        | 说明                                               |
| -------------------------- | ------------------------- | ------------------------------------------------ |
| `MISSING_PLACES_API_KEY`   | custom 且无 Key             | 提示去设置页配置（**不**弹桌面 Preflight）                     |
| `PLACES_GATEWAY_NOT_READY` | `PLACES_PROVIDER=gateway` | E-10 未实现                                         |
| `PLACES_INVALID_ARGUMENT`  | 参数校验失败                    | 如空 `textQuery`                                   |
| `PLACES_HTTP_ERROR`        | Google 非 2xx              | 含 `http_status`；401/403 提示 Key 无效或未启用 Places API |
| `PLACES_RESPONSE_INVALID`  | 响应 JSON 无法解析              | 少见                                               |


---



## 4. Provider 与运行时注入



### 4.1 环境变量（工作区 `.env`）


| 键                       | 写入方                            | 说明                      |
| ----------------------- | ------------------------------ | ----------------------- |
| `GOOGLE_PLACES_API_KEY` | 设置页保存                          | BYOK；**可选**             |
| `PLACES_PROVIDER`       | E-07 默认写 `custom`；E-09/E-10 切换 | E-07 实现 **仅 custom 通路** |


`.env.example` 增补注释：Places Key 仅 R3 需要；须启用 **Places API (New)**。

### 4.2 OpenCode MCP 注册

`[workspace/config/opencode/opencode.json](../../workspace/config/opencode/opencode.json)` 增加：

```json
"places-api": {
  "type": "local",
  "command": ["node", "mcp-servers/places-api/dist/mcp.js"],
  "enabled": true,
  "environment": {
    "FTCS_WORKSPACE": ".",
    "PLACES_PROVIDER": "custom"
  }
}
```



### 4.3 桌面 `rewriteMcpWorkspaceEnv`

`[desktop/electron/opencode/runtime.ts](../../desktop/electron/opencode/runtime.ts)` 对 `places-api` 注入（**与** `FTCS_CHANNEL_MODE` **无关**）：

```ts
{
  FTCS_WORKSPACE: workspaceRoot,
  PLACES_PROVIDER: process.env.PLACES_PROVIDER || 'custom',
  ...(process.env.GOOGLE_PLACES_API_KEY
    ? { GOOGLE_PLACES_API_KEY: process.env.GOOGLE_PLACES_API_KEY }
    : {}),
}
```

- **不**在 E-07 把网关 sk 注入 Places MCP。  
- 保存设置后沿用现网 **重启 OpenCode / reconnect MCP** 流程。



### 4.4 构建与模板

- `[desktop/scripts/build-mcp.mjs](../../desktop/scripts/build-mcp.mjs)`：`MCP_NAMES` 增加 `places-api`。  
- `[desktop/scripts/prepare-workspace-template.mjs](../../desktop/scripts/prepare-workspace-template.mjs)`：`REQUIRED_MCP` 增加 `places-api`。  
- MCP 版本号初始 `0.1.0`；模板同步时 bump。

---



## 5. 设置页（桌面）



### 5.1 数据模型

扩展 `[SettingsSnapshot](../../desktop/electron/settings/settings-service.ts)` / `[SaveSettingsInput](../../desktop/electron/ipc/types.ts)`：


| 字段                   | 类型                     | 说明                                     |
| -------------------- | ---------------------- | -------------------------------------- |
| `placesApiKeyMasked` | string                 | 如 `AIza…xxxx`                          |
| `placesApiKeySet`    | boolean                | `.env` 是否有非空 Key                       |
| `placesProvider`     | `'custom' | 'gateway'` | 读 `PLACES_PROVIDER`；E-07 保存时写 `custom` |


表单字段：`placesApiKey`（密码框；掩码占位不覆盖，复用 `isMaskedSecret`）。

### 5.2 UI（设置 → 探索）

在现有 **R2 站点勾选** 下方增加子块 **「R3 地图发现（Google Places）」**：

- 说明文案（冻结要点）：  
  - **仅**在跑 R3 地图发现时需要；只跑 R1/R2 **可不填**。  
  - Key 来自 [Google Cloud Console](https://console.cloud.google.com/apis/credentials)；须启用 **Places API (New)**。  
  - 费用计入用户 GCP 结算账号（见预研定价摘要）。
- 输入：`GOOGLE_PLACES_API_KEY`（password + 显示切换，对齐 Tavily）。  
- **不**在 E-07 做「测试连接」按钮（可选后续；验收用手动 MCP 调用）。  
- 官方/自定义 **模型通道** 下 **均显示** 此块（Places 与 Tavily 通道独立）。



### 5.3 保存行为

- 写入 `workspace/.env` 的 `GOOGLE_PLACES_API_KEY`；空字符串 **不**删除已有 Key（与 Tavily 一致：仅非掩码新值覆盖）。  
- 若用户要清除 Key：详设允许 **留空且显式清除** — 复用 Tavily 模式：输入空并保存时 **删除** `.env` 键（实现时与 `TAVILY_API_KEY` 清除逻辑对齐）。  
- 保存后 `PLACES_PROVIDER=custom`（若尚未设置）。

---



## 6. MCP 实现要点



### 6.1 目录结构（建议）

```
workspace/mcp-servers/places-api/
  package.json
  tsconfig.json
  src/
    index.ts          # 注册 tools
    custom.ts         # fetch Google Places API (New)
    provider.ts       # getProvider / getApiKey
    field-masks.ts    # 冻结常量
    cache.ts          # Search / Details 24h TTL 缓存
    paths.ts          # findProjectRoot
    types.ts          # Zod schemas
    custom.test.ts    # mock fetch 单测
```



### 6.2 Places 缓存

与 `search-api` 一致：**24h** TTL（`expires_at`）。R3 对实时性要求不高，同一查询 24h 内变化有限；重复跑词 / 调试时可省 Search 与 Details 计费。

**Text Search**

- 路径：`data/cache/places/search/{sha256(textQuery|languageCode|regionCode|pageSize)}.json`  
- 键：`textQuery` + `languageCode` + `regionCode`（缺省记空串）+ `pageSize`  
- 缓存内容：**仅** §3.2 成功响应中的 `places[]` 及请求元数据；**不**写 Lead、不上传  

**Place Details**

- 路径：`data/cache/places/details/{sha256(placeId|languageCode)}.json`  
- 键：`placeId` + `languageCode`  
- 缓存内容：**仅** §3.3 成功响应中的允许字段；**不**写 Lead、不上传  

**共性**

- 命中时工具响应 `cached: true`；过期或未命中则调 Google 并写盘。  
- **不**长期缓存整段 Places JSON 到 Lead（合规与 §3 字段裁剪仍适用）。



### 6.3 合规

- 遵守 [Places API Policies](https://developers.google.com/maps/documentation/places/web-service/policies)：`place_id` 可持久化；**不**把 photo/rating 等未使用字段落盘。  
- MCP 日志：Key 仅允许 `maskSecret` 前 4 后 4。

---



## 7. 与后续故事衔接


| 故事       | 衔接                                                                                                                                                         |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **E-08** | Skill 只调 `places_text_search` / `place_details`；`textQuery` = R3 词；`languageCode` ← `search_queries[].language`；`regionCode` 由 Skill 从画像/句中推断（规则在 E-08 详设） |
| **E-09** | Preflight 检查 `placesApiKeySet`（custom）或 gateway 可用；注入 `PLACES_PROVIDER`                                                                                    |
| **E-10** | 实现 `provider.ts` 的 `gateway` 分支；**不改**工具名与 §3 JSON                                                                                                         |
| **E-06** | R3 词已是合法 `textQuery`；E-07 不读 expansion 文件                                                                                                                  |


---



## 8. 验收用例


| #   | Given                              | When                                   | Then                                                                               |
| --- | ---------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------- |
| P1  | `.env` 有有效 Key，OpenCode 已加载 MCP    | 调用 `places_text_search`（慕尼黑德区样例 query） | 返回 ≥1 条 `places[]`；含 `placeId` / `displayName` / `formattedAddress`；无 `websiteUri` |
| P2  | P1 完成                              | 对某 `placeId` 调 `place_details`         | 返回 Details JSON；可有或无可 `websiteUri`；FieldMask 未含 rating/photos                      |
| P3  | 无 `GOOGLE_PLACES_API_KEY`          | 调任一 Places 工具                          | `error: true`，`code: MISSING_PLACES_API_KEY`                                       |
| P4  | 无效 Key                             | 调 `places_text_search`                 | `PLACES_HTTP_ERROR`，`http_status` 401/403；日志无完整 Key                                |
| P5  | 设置页保存 Key                          | 重启 OpenCode 后 MCP env                  | `places-api` 进程可见 Key（仅 mask 日志）                                                   |
| P6  | 仅跑 R1/R2、未配 Places Key             | 跑 R1/R2 探索                             | **与现网一致**，不受阻                                                                      |
| P7  | `PLACES_PROVIDER=gateway`（手工设 env） | 调 Places 工具                            | `PLACES_GATEWAY_NOT_READY`（E-07 占位）                                                |
| P8  | 同一 `textQuery` + 参数 24h 内重复 Search | 第二次调用 `places_text_search`             | `cached: true`；不再发起 HTTP（或实现等价）                                                    |
| P9  | 同一 `placeId` 24h 内重复 Details       | 第二次调用 `place_details`                  | `cached: true`；不再发起 HTTP（或实现等价）                                                    |
| P10 | 设置页                                | 未配 Key 时 UI                            | 无强制弹窗；探索区有说明「仅 R3 需要」                                                              |


**Postman 等价**：P1/P2 与 [R3-Places-API-预研.md](R3-Places-API-预研.md) §6.4 / §6.5 一致，仅多一层 MCP JSON 封装。

---



## 9. 编码任务顺序

1. `places-api` **MCP 脚手架**：package、`custom.ts`、`field-masks.ts`、`provider.ts`、两工具 + 错误映射 + 单测（mock fetch）。
2. **Places 缓存**（Search + Details，`cache.ts`）+ 单测。
3. **构建链**：`build-mcp.mjs`、`prepare-workspace-template`、`opencode.json` 注册。
4. **桌面设置**：`settings-service` / IPC / `SettingsView` 探索区 Places Key；`.env.example` 注释。
5. `runtime.ts`：`places-api` env 注入；Runtime 面板 MCP 列表文案（可选「Places 地图」）。
6. **手工 P1–P10**；更新 [17 号需求](../17-需求-业务效率工具.md) US-E-07 状态为「编码已落地」。

---



## 10. 测试清单（自动化建议）


| 文件                              | 用例                                                   |
| ------------------------------- | ---------------------------------------------------- |
| `places-api/src/custom.test.ts` | FieldMask 头；Search/Details URL；401 映射；displayName 解析 |
| `places-api/src/cache.test.ts`  | Search / Details TTL 过期；hit/miss；键含 `regionCode` / `pageSize` |
| `settings-service`（可选）          | 保存/掩码 `GOOGLE_PLACES_API_KEY`                        |


集成 / GCP 真 Key 测试：**手工** P1/P2，不入 CI。

---



## 11. 已确认点汇总


| #   | 议题          | 决定                        |
| --- | ----------- | ------------------------- |
| Q1  | MCP 名       | `places-api`              |
| Q2  | 首发 provider | 仅 **custom**；gateway 占位错误 |
| Q3  | Key 环境变量    | `GOOGLE_PLACES_API_KEY`   |
| Q4  | 设置位置        | 设置 → **探索**               |
| Q5  | FieldMask   | 预研 §4.2 / §4.3 冻结         |
| Q6  | 翻页          | 首发 **不**翻页                |
| Q7  | Geocoding   | **E-07 不做**               |
| Q8  | Preflight   | **E-09**                  |
| Q9  | 与官方模型通道     | **独立**；官方用户也可 BYOK Places |
| Q10 | 验收          | MCP 直调，不写 Lead            |


---



## 12. 相关文档

- 需求 §5.7 / §14：[../17-需求-业务效率工具.md](../17-需求-业务效率工具.md)  
- 预研与 Postman：[R3-Places-API-预研.md](R3-Places-API-预研.md)  
- R3 出词（E-06）：[US-E-06-按渠道出R3词与文案.md](US-E-06-按渠道出R3词与文案.md)  
- 定价摘录：[../reference/google-maps-platform-pricing/places-api-pricing-r3-summary.md](../reference/google-maps-platform-pricing/places-api-pricing-r3-summary.md)  
- search-api 参考实现：[../../workspace/mcp-servers/search-api/src/index.ts](../../workspace/mcp-servers/search-api/src/index.ts)

