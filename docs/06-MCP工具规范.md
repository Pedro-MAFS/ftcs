# 06 - MCP 工具规范

MCP（Model Context Protocol）是智能体访问外部能力的统一接口。所有 IDE 通过连接同一 MCP Server 共享工具能力。

## 1. 服务总览

```
mcp-servers/
├── lead-store/       # P0 - 数据读写
├── search-api/       # P0 - 搜索
├── web-crawler/      # P2 - headless 批量爬取（Phase 2）
├── email-sender/     # P2 - 发信
└── scheduler/        # P2 - 定时

外部 MCP（Phase 1，无需自研）：
└── chrome-devtools-mcp   # 网站浏览与页面抓取
```

## 2. 实现优先级

| 优先级 | 服务 | Phase | 说明 |
|--------|------|-------|------|
| P0 | lead-store | 1 | 最先实现，Skills 依赖 |
| P0 | search-api | 1 | R1 探索依赖 |
| P0 | chrome-devtools-mcp | 1 | 网站抓取（外部 MCP，Cursor 配置即用） |
| — | 智能体文件读写 | 1 | 普通文件输入，无需自研 MCP |
| P2 | web-crawler | 2 | headless 批量爬取，用于定时探索 |
| P2 | email-sender | 2 | 审核后发送 |
| P2 | scheduler | 2 | 定时探索 |
| P2+ | file-parser | 2+ | 特殊文件解析（PDF/Excel/图片），按需扩展 |

---

## 3. lead-store

**职责**：产品画像、关键词、线索、邮件、探索记录的读写。

### Tools

#### `product.save`

```json
{
  "product_id": "prod_20260709_001",
  "profile": { }
}
```

写入 `data/products/{product_id}/profile.json`。

#### `product.get`

```json
{ "product_id": "prod_20260709_001" }
```

返回 profile 对象。

#### `keywords.save` / `keywords.get`

读写 `data/keywords/{product_id}/expansion.json`。

#### `lead.append_raw`

```json
{
  "product_id": "prod_20260709_001",
  "round": "R1",
  "lead": { }
}
```

追加一行至 `data/leads/{product_id}/raw/{round}.jsonl`。

#### `lead.save_scored`

```json
{
  "product_id": "prod_20260709_001",
  "scored": { }
}
```

写入 `scored.json`。

#### `lead.update_status`

```json
{
  "product_id": "prod_20260709_001",
  "lead_id": "lead_20260709_0001",
  "status": "contacted"
}
```

#### `email.save` / `email.get`

读写 `data/emails/{lead_id}/draft.json`。

#### `exploration.save_run`

读写 `data/exploration/{product_id}/runs/{run_id}.json`。

### Phase 1 实现

- 语言：TypeScript 或 Python
- 存储：直接读写 JSON 文件
- 无需数据库

### Phase 2 迁移

- 底层换 SQLite，Tool 接口不变

---

## 4. search-api

**职责**：执行网络搜索，返回结构化结果。

### Tools

#### `search.web`

```json
{
  "query": "industrial ball valve distributor Germany",
  "language": "en",
  "num_results": 10
}
```

**返回**：

```json
{
  "query": "...",
  "results": [
    {
      "title": "...",
      "url": "https://...",
      "snippet": "...",
      "position": 1
    }
  ],
  "provider": "tavily",
  "cached": false
}
```

### 配置（`.env`）

```env
SEARCH_PROVIDER=tavily          # tavily | serpapi | bing
TAVILY_API_KEY=tvly-xxx
SERPAPI_API_KEY=xxx
SEARCH_DAILY_LIMIT=50
```

### 实现要点

- 搜索结果缓存至 `data/cache/search/{hash}.json`（TTL 24h）
- 超出 `SEARCH_DAILY_LIMIT` 时返回错误，不静默失败
- 记录 API 用量至探索运行记录

---

## 5. chrome-devtools-mcp（Phase 1，外部 MCP）

**职责**：在 Cursor 等支持该 MCP 的环境中，通过真实 Chrome 浏览器浏览网站并提取页面内容。

**来源**：用户环境已配置的 `chrome-devtools` / `user-chrome-devtools` MCP，**无需在 `mcp-servers/` 自研**。

### 常用 Tools

| Tool | 用途 |
|------|------|
| `navigate_page` / `new_page` | 打开目标 URL |
| `take_snapshot` | 获取页面 a11y 树文本（优先使用） |
| `evaluate_script` | 执行 JS 提取 title、正文、链接列表 |
| `list_pages` / `close_page` | 管理多标签页 |

### 典型调用流程（产品网站）

```
1. new_page(url=首页)
2. take_snapshot → 提取公司名、简介
3. evaluate_script → 收集 /products、/about 链接
4. navigate_page → 逐个打开关键页
5. take_snapshot → 合并产品信息
```

### 典型调用流程（获客探索）

```
1. search-api 返回候选 URL
2. new_page(url) 或 navigate_page
3. take_snapshot / evaluate_script → 供智能体判断是否目标客户
```

### 限制

- 绑定支持 Chrome DevTools MCP 的环境（Cursor 为主）
- 不适合 Phase 2 无人值守批量探索（资源占用高）
- 无内置 robots.txt、限速、结构化批量输出

---

## 6. web-crawler（Phase 2，自研）

**职责**：headless 批量爬取，用于定时探索与跨环境自动化。Phase 1 **不实现**。

### Tools

#### `crawl.page`

```json
{
  "url": "https://example.com/products",
  "extract": "text",
  "timeout_ms": 15000
}
```

**返回**：

```json
{
  "url": "https://example.com/products",
  "title": "Products - Example Co",
  "text": "提取的正文...",
  "links": ["https://example.com/about", "..."],
  "status_code": 200
}
```

#### `crawl.site`

```json
{
  "url": "https://example.com",
  "max_depth": 2,
  "max_pages": 20,
  "include_patterns": ["/products", "/about", "/contact"]
}
```

批量抓取站内页面，用于自动化探索。

### 实现要点

- 基于 Playwright / Puppeteer headless
- 遵守 `robots.txt`
- 请求间隔 ≥ 1s
- 失败时返回 `status_code` 与 `error`，不抛未处理异常

---

## 7. file-parser（Phase 2+，按需扩展）

**职责**：解析智能体原生工具无法直接读取的特殊文件。

Phase 1 **不实现**。遇到 PDF、Excel、图片等格式时，Skill 应提示用户：
- 转换为 txt/md/json/csv，或
- 提供公司网站 URL，或
- 等待后续版本支持

后续按需扩展：

| 格式 | 解析方式 |
|------|---------|
| PDF | pdf-parse / OCR |
| Excel | xlsx 库 |
| 图片 | 多模态模型 OCR |

---

## 8. email-sender（Phase 2）

**职责**：审核通过后发送邮件。

### Tools

#### `email.send`

```json
{
  "to": "sales@abc-valves.de",
  "subject": "...",
  "body": "...",
  "lead_id": "lead_20260709_0001"
}
```

**返回**：

```json
{
  "success": true,
  "message_id": "xxx",
  "provider": "sendgrid"
}
```

### 配置

```env
EMAIL_PROVIDER=sendgrid    # sendgrid | smtp
SENDGRID_API_KEY=xxx
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=xxx
SMTP_PASS=xxx
FROM_EMAIL=sales@yourcompany.com
FROM_NAME=Your Company
DAILY_SEND_LIMIT=20
```

### 合规

- 邮件底部自动加退订说明（如适用）
- 遵守 `DAILY_SEND_LIMIT`
- 记录发送日志至 `logs/email/`

---

## 9. scheduler（Phase 2）

**职责**：注册与管理定时探索任务。

### Tools

#### `schedule.register`

```json
{
  "product_id": "prod_20260709_001",
  "cron": "0 9 * * 1",
  "rounds": ["R1", "R4"],
  "enabled": true
}
```

写入 `config/exploration-schedule.yaml` 或数据库。

#### `schedule.list` / `schedule.disable`

管理已注册任务。

### 实现选项

- 本地：node-cron 常驻进程
- 云端：GitHub Actions workflow
- 生产：Celery Beat / BullMQ

---

## 10. MCP Server 开发规范

### 10.1 项目结构（单个服务）

```
mcp-servers/lead-store/
├── package.json
├── src/
│   ├── index.ts          # MCP Server 入口
│   ├── tools/            # 各 Tool 实现
│   └── storage/          # 文件/SQLite 读写
├── tests/
└── README.md
```

### 10.2 错误格式

所有 Tool 错误统一返回：

```json
{
  "error": true,
  "code": "DAILY_LIMIT_EXCEEDED",
  "message": "Search API daily limit of 50 reached"
}
```

### 10.3 本地开发配置

Cursor MCP 配置示例（`.cursor/mcp.json`）：

```json
{
  "mcpServers": {
    "lead-store": {
      "command": "node",
      "args": ["mcp-servers/lead-store/dist/index.js"]
    },
    "search-api": {
      "command": "node",
      "args": ["mcp-servers/search-api/dist/index.js"],
      "env": {
        "TAVILY_API_KEY": "${TAVILY_API_KEY}"
      }
    }
  }
}
```

> **说明**：`chrome-devtools-mcp` 由用户在 Cursor 设置中单独配置（如 `user-chrome-devtools`），不在 `mcp-servers/` 自研。Phase 2 再加入自研 `web-crawler`。

---

## 11. 开发顺序建议

```
Week 1: lead-store（文件读写）+ extract-product-profile Skill
        网站输入走 chrome-devtools-mcp，文件输入走智能体原生读写
Week 2: search-api + discover-leads Skill 联调
Week 3: score-and-dedupe + draft-outreach-email
Week 4+: Phase 2 — web-crawler + email-sender + scheduler + file-parser
```

## 12. 相关文档

- 实施计划：[04-实施计划.md](04-实施计划.md)
- Skills：[05-智能体技能规范.md](05-智能体技能规范.md)
- 目录约定：[07-目录结构约定.md](07-目录结构约定.md)
