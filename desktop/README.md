# 外贸获客桌面应用（desktop）

Electron + Vue 3 + **OpenCode SDK（Server + Client）**。

主进程通过 `@opencode-ai/sdk` 的 `createOpencode()` 启动本机 Server；**工作流全部在仓库 `workspace/`**（Skills / MCP / config / data）。

## 前置条件

1. **Node.js** ≥ 20
2. **OpenCode CLI** 已安装（`npm install -g opencode-ai`）
3. 配置 `workspace/.env`（至少 `TAVILY_API_KEY`）
4. 构建 workspace 内 MCP：

```powershell
cd workspace/mcp-servers/lead-store
npm install
npm run build

cd ../search-api
npm install
npm run build
```

## 开发

```powershell
cd desktop
npm install
npm run dev
```

开发默认工作区：`<repo>/workspace`。

## 环境变量

| 变量 | 说明 |
|------|------|
| `FTCS_WORKSPACE` | 覆盖工作区路径（默认：`<repo>/workspace`） |
| `FTCS_REPO_ROOT` | 覆盖仓库根 |
| `FTCS_OPENCODE_PATH` | 指定 opencode 可执行文件 |
| `FTCS_OPENCODE_PORT` | Server 端口（默认 4096） |

## 工作流维护约定

- **只改** `workspace/skills/`、`workspace/mcp-servers/`、`workspace/config/`
- 不要在仓库根维护第二套 skills / mcp-servers
