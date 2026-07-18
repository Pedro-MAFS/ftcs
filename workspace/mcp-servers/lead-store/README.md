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
| `lead_generate_id` | 生成线索 ID |
| `lead_append_raw` | 追加原始线索至 `raw/{round}.jsonl` |
| `lead_list_raw` | 列出原始线索 |
| `exploration_start` | 创建探索运行记录 |
| `exploration_update` | 更新探索进度与 API 用量 |
| `exploration_finish` | 完成探索运行 |
| `exploration_get` / `exploration_list` | 读取探索记录 |
| `leads_score_and_dedupe` | 原始线索去重、评分；写入 scored.json 与 discarded.json |
| `leads_get_scored` | 读取评分后的线索 |
| `email_draft_generate` | 为高意向线索生成邮件草稿（json + md） |
| `email_draft_get` | 读取单条邮件草稿 |
| `email_draft_save` | 保存/更新邮件草稿（智能体润色后） |
| `email_draft_list` | 列出邮件草稿 |

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
      "args": ["mcp-servers/lead-store/dist/mcp.js"]
    }
  }
}
```

修改代码后执行 `npm run build` 并重启 MCP。

## 数据路径

- 画像：`data/products/{product_id}/profile.json`
- 关键词：`data/keywords/{product_id}/expansion.json`
- 原始线索：`data/leads/{product_id}/raw/{round}.jsonl`
- 评分线索：`data/leads/{product_id}/scored.json`
- 邮件草稿：`data/emails/{lead_id}/draft.json`、`draft.md`
- 探索记录：`data/exploration/{product_id}/runs/{run_id}.json`
- 输入归档：`data/products/{product_id}/inputs/`
- 就绪度阈值：`config/scoring-rules.yaml` → `profile_readiness_threshold`
