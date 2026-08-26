# workspace — 标准工作流目录

本目录是本项目 **唯一** 需要维护工作流的地方。

| 路径 | 用途 | 是否手改 |
|--------|------|----------|
| `AGENTS.md` | 跨 Skill 全局约定（OpenCode 每个会话加载） | ✅ 在此维护 |
| `skills/` | Agent Skills 权威源（OpenCode 按任务加载） | ✅ 在此维护 |
| `mcp-servers/` | MCP 工具实现与构建 | ✅ 在此维护 |
| `config/` | scoring-rules、opencode.json | ✅ 在此维护 |
| `data/` | 画像、线索、邮件等业务数据 | 运行时写入 |
| `.env` | API Key | ✅ 本地配置，不提交 |

仓库根 `.opencode/`、`.cursor/` 为 IDE/工具本机目录，不进 Git。

应用壳（`desktop/`）、文档（`docs/`）不在此目录。

```powershell
# 构建 MCP 预打包产物（自包含 dist/mcp.js）
cd mcp-servers/lead-store; npm i; npm run build
cd ../search-api; npm i; npm run build
```
