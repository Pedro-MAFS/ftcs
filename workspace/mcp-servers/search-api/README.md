# search-api MCP Server

基于 Tavily 的搜索 MCP 服务，供 R1 获客探索使用。

## 功能

| Tool | 说明 |
|------|------|
| `search_web` | 执行网络搜索，返回 title / url / snippet；可选 `include_domains` 限定站点（如 `linkedin.com/company`） |
| `search_usage` | 查看当日 API 用量与配额 |

## 配置

在项目根 `.env` 中设置：

```env
SEARCH_PROVIDER=tavily
TAVILY_API_KEY=tvly-xxx
SEARCH_DAILY_LIMIT=50
```

Cursor MCP 配置见项目根 `.cursor/mcp.json`。

## 开发

```bash
cd mcp-servers/search-api
npm install
npm run build
npm test
```

## 行为说明

- 搜索结果缓存 24 小时（`data/cache/search/`）
- 超出 `SEARCH_DAILY_LIMIT` 返回 `DAILY_LIMIT_EXCEEDED`
- 站点收窄交给 Tavily：R1 传 `exclude_domains`（Google / Facebook / Wikipedia 等）；传入 `include_domains` 时改为只传 include（R2），不再本地按站点过滤
- 个人主页路径（如 `linkedin.com/in/`）仍由 MCP 丢弃（域名排除表达不了路径）
- 不传 `include_domains`（含空数组）时不把该字段发给上游，改为发 `exclude_domains`
