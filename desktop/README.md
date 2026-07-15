# 外贸获客桌面应用（desktop）

Electron + Vue 3 + **OpenCode SDK（Server + Client）**。

主进程通过 `@opencode-ai/sdk` 的 `createOpencode()` 启动本机 Server 并持有 Client；Vue 渲染进程经 IPC 查看状态。  
**当前阶段不内嵌 OpenCode 二进制**，需本机已安装并可在 PATH 中执行 `opencode`。

## 前置条件

1. **Node.js** ≥ 20
2. **OpenCode CLI** 已安装（`npm install -g opencode-ai`），`opencode --version` 可用  
   - 或设置 `FTCS_OPENCODE_PATH` 指向可执行文件（会注入其目录到 PATH）
3. 仓库根目录已配置 `.env`（至少 `TAVILY_API_KEY`；LLM Key 按 OpenCode 文档配置）
4. MCP 服务已构建：

```powershell
cd mcp-servers/lead-store
npm install
npm run build

cd ../search-api
npm install
npm run build
```

5. 同步 Skills：

```powershell
.\scripts\sync-skills.ps1
```

## 开发

### 国内环境：Electron 安装加速（推荐）

国内直接 `npm install` 会很慢，因为 Electron 要从 GitHub 拉大体积二进制。安装前先设镜像：

```powershell
$env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
$env:ELECTRON_BUILDER_BINARIES_MIRROR = "https://npmmirror.com/mirrors/electron-builder-binaries/"
```

可选：写入用户级环境变量，之后新开终端自动生效：

```powershell
[System.Environment]::SetEnvironmentVariable("ELECTRON_MIRROR", "https://npmmirror.com/mirrors/electron/", "User")
[System.Environment]::SetEnvironmentVariable("ELECTRON_BUILDER_BINARIES_MIRROR", "https://npmmirror.com/mirrors/electron-builder-binaries/", "User")
```

可选：同时换 npm 源：

```powershell
npm config set registry https://registry.npmmirror.com
```

然后安装：

```powershell
cd desktop
npm install
npm run dev
```

应用启动后会自动：

- 将仓库根目录设为工作区（`chdir`）
- 加载 `config/opencode/opencode.json` 交给 SDK
- 调用 `createOpencode()` 启动 Server + Client
- 在首页展示 Runtime / MCP 状态与日志

## 环境变量

| 变量 | 说明 |
|------|------|
| `FTCS_WORKSPACE` | 覆盖工作区路径（默认：仓库根目录） |
| `FTCS_OPENCODE_PATH` | 指定 opencode 可执行文件（注入 PATH） |
| `FTCS_OPENCODE_PORT` | Server 端口（默认 4096） |

## 常见问题

### 控制台出现 `GpuControl.CreateCommandBuffer` / `command_buffer_proxy_impl`

这是 **Electron/Chromium 硬件加速** 在 Windows Server 或无独显环境下的常见噪音，**不是 OpenCode Server 崩溃原因**。应用已在主进程默认 `disableHardwareAcceleration()`。若仍刷屏，可忽略该行，并看首页「运行日志」里的 OpenCode 实际错误。

### `ServeError` / `Server exited with code 1` / 残留 opencode

多数是 **上次退出未清干净，4096 仍被旧 `opencode.exe` 占用**。应用已修复退出清理（`before-quit` + `taskkill`）。

手动清理：

```powershell
taskkill /F /IM opencode.exe
netstat -ano | findstr :4096
```

然后重新 `npm run dev` 或点「重启 OpenCode」。

`OPENCODE_SERVER_PASSWORD is not set` 只是安全警告，不是失败原因。

### 日志出现 `ServeError` / `Server exited with code 1`

多数是 **4096 已被占用**（上次 `opencode` 未退出）。应用会优先复用健康实例；若仍失败：

```powershell
netstat -ano | findstr :4096
taskkill /F /IM opencode.exe
```

`OPENCODE_SERVER_PASSWORD is not set` 只是未加密警告，不是失败原因。

## 架构要点

```
Electron Main
  └─ createOpencode()  →  spawn PATH 上的 opencode serve
       ├─ server.close()
       └─ client（后续业务 API）

Vue3 Renderer
  └─ window.ftcs（IPC）→ 状态 / 重启 / 日志
```

内嵌二进制为后续优化项，不在 2.0 当前范围。

## 目录

```
desktop/
├── electron/
│   ├── main.ts
│   ├── preload.ts
│   └── opencode/          # SDK Runtime
├── src/                   # Vue3
└── resources/opencode-cli/  # 预留，当前未使用
```

## Phase 2.0 范围

- [x] Electron + Vue3 骨架
- [x] SDK Server+Client 启停与健康检查
- [x] 本机 OpenCode CLI 检测（PATH / FTCS_OPENCODE_PATH）
- [x] MCP 配置模板 `config/opencode/opencode.json`
- [x] Skills 同步至 `.opencode/skills/`
- [ ] 内嵌 OpenCode 二进制（延后）

业务页面见 Phase 2.1。
