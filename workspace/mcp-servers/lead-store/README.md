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
| `keywords_get` | 读取关键词扩展结果 |
| `keywords_save` | 保存大模型生成的关键词扩展（校验 schema，要求画像 ready） |
| `lead_generate_id` | 生成线索 ID |
| `lead_append_raw` | 追加原始线索至 `raw/{round}.jsonl`（应带 `run_id`） |
| `lead_list_raw` | 列出原始线索（可按 `round` / `run_id` 筛选） |
| `exploration_start` | 创建探索运行记录 |
| `exploration_update` | 更新探索进度与 API 用量 |
| `exploration_finish` | 完成探索运行 |
| `exploration_get` / `exploration_list` | 读取探索记录 |
| `leads_score_and_dedupe` | 原始线索去重、评分；写入 scored.json 与 discarded.json |
| `leads_get_scored` | 读取评分后的线索 |
| `email_draft_generate` | 为高意向线索生成邮件草稿（json + md） |
| `email_draft_get` | 读取单条邮件草稿 |
| `email_draft_save` | 保存/更新邮件草稿（智能体润色后） |
| `email_draft_save_zh` | 仅写入中文对照 `subject_zh`/`body_zh`（不改外文） |
| `email_draft_list` | 列出邮件草稿 |
| `site_status` | 查询桌面端管理的站点预览、构建状态和依赖状态 |
| `site_preview` / `site_open_preview` | 启动预览服务 / 在内置浏览器打开已确认的预览 |
| `site_build` | 发起站点构建检查；通过 `site_status` 查询实际结果 |
| `site_publish_prepare` | 为已确认的仓库和分支生成待审核发布快照，不直接推送 |

站点工具不需要模型传入工作区路径或业务参数，`_ticket` 由桌面运行时注入，不应由模型填写。工具只能在当前自由聊天加载 `build-website` 后调用；运行中的业务任务不可使用。调用结果为 `ok` 和 `value`，失败时为 `ok: false`、`code` 和 `message`。预览、构建是异步操作，返回启动状态不代表已完成；发布准备成功后用户仍需在独立站页面核对快照和目标并确认推送。首次发布须先在页面选择目标。

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
