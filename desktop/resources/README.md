# desktop/resources

| 路径 | 说明 |
|------|------|
| `workspace-template/` | **构建产物**（`npm run prepare:template` 生成），由 electron-builder 打入安装包；勿手改、勿提交 |
| `opencode-cli/` | 预留：第二步内嵌 OpenCode CLI |

发版请用 `npm run dist`（会先 build MCP → 生成模板 → 打包）。
