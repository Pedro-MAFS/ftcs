# search-api MCP Server

基于 Tavily 的搜索 MCP 服务，供 R1 获客探索使用。

## 功能

| Tool | 说明 |
|------|------|
| `search_web` | 执行网络搜索，返回 title / url / snippet |
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
- 自动过滤 Google、YouTube、Wikipedia 等非目标客户站点
