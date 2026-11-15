# 外贸获客桌面应用（desktop）

Electron + Vue 3 + **OpenCode SDK（Server + Client）**。

主进程通过 `@opencode-ai/sdk` 的 `createOpencode()` 启动本机 Server。

- **标准模板**：仓库 `workspace/`（skills / mcp / config）
- **运行时工作区**：始终为独立目录（默认 `<userData>/workspace`），开发与打包一致，**不会**直接使用仓库根下的 `workspace/`

## 前置条件

1. **Node.js** ≥ 22（跑 OpenCode / MCP / `npx`）
2. **内置浏览器**（随应用自带，用于画像抓站与探索打开网页。不需要另装 Google Chrome）
3. **OpenCode CLI** 已安装（`npm install -g opencode-ai`）
4. 首次启动后在应用「设置」中配置 API Key（或编辑运行时工作区里的 `.env`）
5. 仓库内先构建一次 MCP **预打包产物**（自包含 `dist/mcp.js`，用户工作区不再 `npm install`）：

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

## 应用图标

标题栏左上角「FT」蓝标对应 `build/icon.png` / `build/icon.ico`：
- 开发态：主进程 `BrowserWindow.icon` 读取 `build/icon.png`
- 安装包：`electron-builder` 使用 `build/icon.ico`，并额外把 `icon.png` 打入 `resources/`

更换图标：只替换 `build/icon.png`，再执行 `npm run make:icon` 生成合法 `.ico`（**不要用 PowerShell `>` 写 ico**，会变成 UTF-16 损坏文件），然后 `npm run dist`。

## 打轻量安装包（Windows）

**范围**：Electron App + `workspace-template`（skills / config / MCP `dist/mcp.js`）。  
**不包含**：OpenCode CLI（用户本机需已安装）、用户 `data/` / `.env`。

```powershell
cd desktop
npm install

# 推荐：缓存与二进制工具放到空间充足的盘（避免 C: 满盘失败）
$env:ELECTRON_BUILDER_CACHE = 'D:\workplace\electron-builder-cache'
$env:ELECTRON_BUILDER_BINARIES_MIRROR = 'https://npmmirror.com/mirrors/electron-builder-binaries/'
$env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'   # 跳过代码签名探测

npm run dist
```

`package.json` 已配置：
- `electronDist` → 复用 `node_modules/electron/dist`（避免重复下载 ~116MB）
- `electronDownload.mirror` → npmmirror（仅在需要下载时）

等价分步：

```powershell
npm run build:mcp          # 构建两个 MCP 的 dist/mcp.js
npm run prepare:template   # 生成 resources/workspace-template/
npm run build              # electron-vite
npx electron-builder --win # 产出 release/
```

| 脚本 | 说明 |
|------|------|
| `npm run dist` | 完整发版（NSIS 安装包 + portable） |
| `npm run pack` | 仅解包目录（`--dir`，便于本地试跑，不重新 build MCP） |

产物目录：`desktop/release/`，例如：

- `外贸获客-Setup-0.4.1.exe`（NSIS 安装包）
- `外贸获客-Portable-0.4.1.exe`（便携版）

### 安装包使用方前置

1. **Node.js 22+** 已安装。打开网页使用应用内置浏览器
2. 本机安装 OpenCode：`npm install -g opencode-ai`（或设置 `FTCS_OPENCODE_PATH`）
3. 启动 App → 设置页填写 API Key
4. 验收：录入 → 探索 → 线索 → 邮件

> 内嵌 OpenCode 二进制见实施计划 2.0.6，不在本轻量包范围。

### 应用内检查更新

启动后会请求官网 `{FTCS_SITE_ORIGIN}/updates/latest.json`（默认 `https://ftcs.ai-utills.com/...`）；若远程版本高于本地，标题栏下方提示并引导打开下载页，也可打开官网 [发布日志](https://ftcs.ai-utills.com/changelog/)（带当前/目标版本参数）查看区间差异。发版时请同步官网 `website/public/updates/latest.json` 与 `website/src/config/changelog.ts`，并在设置 → 关于中可手动「检查更新」。

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
| `FTCS_SITE_ORIGIN` | 产品官网根（默认 `https://ftcs.ai-utills.com`）；派生文档、下载、更新清单 |
| `FTCS_USER_ORIGIN` | 账号中心根（默认 `https://user.ai-utills.com`）；OAuth 默认 issuer |
| `FTCS_OAUTH_ISSUER` | 可选，单独覆盖 OAuth AS（未设时等于 `FTCS_USER_ORIGIN`） |
| `FTCS_OAUTH_CLIENT_ID` | 管理端登记的 Client ID（默认 `ftcs-desktop`） |
| `FTCS_OAUTH_SCOPES` | 空格分隔 scope（默认 `openid ftcs-desktop email`） |
| `FTCS_OAUTH_LOOPBACK_PORT` | 可选：强制本机回调端口；**默认不设**，每次登录动态选空闲端口 |
| `FTCS_INBOX_POLL_MS` | 站内信轮询间隔毫秒（默认 `3600000` / 1 小时）；开发自测可调小 |

开发时把上述变量写在 [`desktop/.env`](.env.example) 即可（勿提交密钥）。主进程启动时会加载该文件；渲染进程由 `electron.vite.config` 注入。修改 `.env` 后需重启 `npm run dev`。也可直接设系统环境变量，或使用 `VITE_FTCS_SITE_ORIGIN` / `VITE_FTCS_USER_ORIGIN`。

### OAuth 登录（软门禁）

- 主流程（线索 / 画像 / 探索 / 邮件）**不强制登录**。
- 「意见反馈」「退出登录」等账号能力需登录；协议为 **授权码 + PKCE**，回调为本机 loopback。
- 回调 URI 形如 `http://127.0.0.1:<port>/callback`，**端口按本机占用情况动态分配**（管理端按 loopback 任意端口策略登记即可，无需写死端口）。
- Client 须登记 scope：`openid` `ftcs-desktop` `email`；用户标识在 UI 中以**掩码邮箱**展示。

应用启动 OpenCode 时会：
- 设置 `XDG_CONFIG_HOME` 到 `<userData>/opencode-xdg`（隔离本机 `~/.config/opencode`，避免全局 MCP 如 pencil 渗入）
- 设置 `OPENCODE_CONFIG` 指向工作区配置
- **不复用**端口上已有 OpenCode 进程，始终按隔离环境重新拉起

> 说明：`OPENCODE_DISABLE_GLOBAL_CONFIG` 尚未进入当前 OpenCode 正式版，故以 XDG 隔离为准。

## 后续优化（待办）

- **OpenCode 会话管理**：当前每次画像任务 `session.create` 临时会话，结束后仅丢弃句柄（不持久化、不复用、不主动 delete）。后续可考虑：按产品绑定 session、历史回放、任务结束清理与会话列表。

## 工作流维护约定

- **只改** 仓库 `workspace/skills/`、`workspace/mcp-servers/`、`workspace/config/`（模板源）
- MCP 发布入口为自包含 `dist/mcp.js`（esbuild）；`places-api` 另将 `undici` 等生产依赖打入安装包模板 `node_modules`，同步到用户工作区，**用户机不再 npm install**
- 运行时工作区由应用同步生成，业务数据写在运行时 `data/`，不要提交用户 `userData`

### GitHub App 授权开发配置

独立站的 GitHub 连接使用 GitHub App 的 Device Flow。维护者需先注册 GitHub App、启用 Device Flow，并根据实际用途设置仓库权限。桌面端已内置 FTCS 应用的公开 Client ID 和 App 标识。开发测试其他 GitHub App 时，可在启动桌面进程前用以下环境变量覆盖：

- `FTCS_GITHUB_CLIENT_ID`：GitHub App 的 Client ID。
- `FTCS_GITHUB_APP_SLUG`：GitHub App 页面 URL 中 `/apps/` 后的标识，用于在用户授权账号后引导安装 App；更换 Client ID 时应同时设置对应标识。

Client ID 和 App 标识不是密钥。不要将 Client Secret 或 App 私钥写入应用、日志或仓库。授权所得的用户令牌仅在系统凭据加密可用时保存。用户授权账号与安装 App、授权仓库是不同步骤；安装完成后在独立站页面点击刷新检查状态。

### Cloudflare OAuth 连接

独立站使用 Cloudflare OAuth Authorization Code + PKCE。默认客户端 ID 为 FTCS 注册的公开 ID，本机回调地址为 `http://127.0.0.1:43862/callback`。可以使用 `FTCS_CLOUDFLARE_CLIENT_ID` 和 `FTCS_CLOUDFLARE_SCOPES` 环境变量覆盖默认客户端与权限；首次连接先请求账号信息权限，用获得的用户令牌查询 Cloudflare 提供的 scope 列表，再引导用户确认 Pages 权限；因此首次连接可能需要两次浏览器确认。覆盖权限时必须使用与 OAuth 客户端注册时勾选的权限一致的 scope ID。

用户在浏览器登录和选择授权账号，FTCS 自动查询账号并验证 Pages 读取权限，令牌使用 Electron safeStorage 加密保存在应用数据目录。连接成功不代表 Pages 写权限已验证。断开连接仅删除本地凭据；如需撤销 Cloudflare 端授权，请前往 Cloudflare 控制台。Cloudflare 对 GitHub 仓库的访问仍需另外完成 Git 集成。
