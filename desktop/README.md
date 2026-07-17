# 外贸获客桌面应用（desktop）

Electron + Vue 3 + **OpenCode SDK（Server + Client）**。

主进程通过 `@opencode-ai/sdk` 的 `createOpencode()` 启动本机 Server。

- **标准模板**：仓库 `workspace/`（skills / mcp / config）
- **运行时工作区**：始终为独立目录（默认 `<userData>/workspace`），开发与打包一致，**不会**直接使用仓库根下的 `workspace/`

## 前置条件

1. **Node.js** ≥ 20
2. **OpenCode CLI** 已安装（`npm install -g opencode-ai`）
3. 首次启动后在应用「设置」中配置 API Key（或编辑运行时工作区里的 `.env`）
4. 仓库内先构建一次 MCP **预打包产物**（自包含 `dist/mcp.js`，用户工作区不再 `npm install`）：

```powershell
cd workspace/mcp-servers/lead-store
npm install
npm run build

cd ../search-api
npm install
npm run build
```

改 MCP 源码后须重新 `npm run build`，再启动桌面端（开发态若缺产物也会在模板源自动构建一次）。

## 开发

```powershell
cd desktop
npm install
npm run dev
```

默认运行时工作区：`%APPDATA%/@ftcs/desktop/workspace`（具体以 Electron `userData` 为准）。  
可用设置页「更改…」或环境变量 `FTCS_WORKSPACE` 覆盖。

## 工作区初始化

启动 OpenCode 前会执行 `initializeWorkspace`：

| 场景 | 行为 |
|------|------|
| 首次启动 / 新工作区 | 从模板同步 `skills/`、`mcp-servers/`、`config/` |
| 模板版本升级 | 重新同步托管目录（保留 `.env` 与 `data/`） |
| MCP 缺 `dist/mcp.js`（开发态） | 在仓库模板源 build，再拷贝产物到用户工作区 |
| MCP 缺 `dist/mcp.js`（打包态） | 报错：安装包不完整 |

发版时须先构建两个 MCP，再将含 `dist/mcp.js` 的 `workspace/` 打入 `resources/workspace-template`。

模板路径：未打包时为仓库 `workspace/`；打包后为 `resources/workspace-template`（可用 `FTCS_WORKSPACE_TEMPLATE` 覆盖）。

## 环境变量

| 变量 | 说明 |
|------|------|
| `FTCS_WORKSPACE` | 覆盖运行时工作区路径（默认：`<userData>/workspace`） |
| `FTCS_WORKSPACE_TEMPLATE` | 覆盖标准工作区模板路径 |
| `FTCS_REPO_ROOT` | 覆盖仓库根（仅用于定位开发态模板） |
| `FTCS_OPENCODE_PATH` | 指定 opencode 可执行文件 |
| `FTCS_OPENCODE_PORT` | Server 端口（默认 4096） |

应用启动 OpenCode 时会：
- 设置 `XDG_CONFIG_HOME` 到 `<userData>/opencode-xdg`（隔离本机 `~/.config/opencode`，避免全局 MCP 如 pencil 渗入）
- 设置 `OPENCODE_CONFIG` 指向工作区配置
- **不复用**端口上已有 OpenCode 进程，始终按隔离环境重新拉起

> 说明：`OPENCODE_DISABLE_GLOBAL_CONFIG` 尚未进入当前 OpenCode 正式版，故以 XDG 隔离为准。

## 后续优化（待办）

- **OpenCode 会话管理**：当前每次画像任务 `session.create` 临时会话，结束后仅丢弃句柄（不持久化、不复用、不主动 delete）。后续可考虑：按产品绑定 session、历史回放、任务结束清理与会话列表。

## 工作流维护约定

- **只改** 仓库 `workspace/skills/`、`workspace/mcp-servers/`、`workspace/config/`（模板源）
- MCP 发布入口为自包含 `dist/mcp.js`（esbuild），运行时工作区不依赖 `node_modules`
- 运行时工作区由应用同步生成，业务数据写在运行时 `data/`，不要提交用户 `userData`
