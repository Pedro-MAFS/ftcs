# lead-store MCP Server

外贸获客系统的数据存储 MCP 服务，Phase 1 基于 JSON 文件。

## 功能

| Tool | 说明 |
|------|------|
| `product_save` | 保存/更新产品画像，自动计算就绪度 |
| `product_get` | 按 ID 读取画像 |
| `product_list` | 列出所有画像 |
| `product_generate_id` | 生成新产品 ID |
| `profile_compute_readiness` | 预览就绪度（不保存） |
| `file_classify` | 判断输入文件是否支持 |
| `inputs_ensure_dir` | 创建 `inputs/` 归档目录 |
| `keywords_expand` | 基于 ready 画像生成五维关键词与搜索查询并保存 |
| `keywords_get` | 读取关键词扩展结果 |
| `keywords_save` | 手动保存/更新关键词扩展（智能体补充后） |

## 开发

```bash
cd mcp-servers/lead-store
npm install
npm run build
npm test
```

## Cursor 配置

已在项目根 `.cursor/mcp.json` 中配置：

```json
{
  "mcpServers": {
    "lead-store": {
      "command": "node",
      "args": ["mcp-servers/lead-store/dist/index.js"]
    }
  }
}
```

修改代码后执行 `npm run build` 并重启 MCP。

## 数据路径

- 画像：`data/products/{product_id}/profile.json`
- 关键词：`data/keywords/{product_id}/expansion.json`
- 输入归档：`data/products/{product_id}/inputs/`
- 就绪度阈值：`config/scoring-rules.yaml` → `profile_readiness_threshold`
