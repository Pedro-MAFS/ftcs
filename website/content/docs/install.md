# 安装与前置

## 系统要求

在安装本应用之前，客户电脑需已具备：

| 依赖 | 要求 | 用途 |
|------|------|------|
| Windows | 10 / 11，x64 | 运行桌面安装包或便携版 |
| **Node.js** | **22 及以上** | 安装 OpenCode、用 `node` 启动 MCP、`npx` 拉取工具 |
| **Google Chrome** | 已安装并可正常启动 | `chrome-devtools` 浏览网站、探索打开页面（Electron 内置浏览器不能替代） |
| **OpenCode CLI** | 本机 PATH 可执行 `opencode` | 应用通过 SDK 拉起 `opencode serve`（轻量包不内嵌） |
| API Key | 大模型（推荐 DeepSeek）+ 搜索（Tavily） | 画像 / 探索 / 邮件起草 |

请先确认：

```powershell
node -v          # 应显示 v22.x 或更高
```

并从开始菜单能正常打开 **Google Chrome**（Windows 上一般没有 `google-chrome` 命令）。
## 安装方式

| 产物 | 说明 |
|------|------|
| Setup（NSIS） | 安装向导，可创建桌面快捷方式 |
| Portable | 便携目录，不写系统安装位置 |

下载入口：[下载页](/download)。国内用户建议优先选 **Gitee**（通常更快），也可使用 GitHub。若按钮显示「链接待配置」，表示分发地址尚未公布。

## Node.js 22+

本应用需要本机 **Node.js 22 及以上**（MCP / `npx` / 安装 OpenCode 依赖它）。

### Windows 一键安装（推荐）

1. 启动应用，打开首次引导「环境监测」（或在 **设置** 中重新打开引导）
2. 若 Node 显示缺失或过旧，点击 **一键安装 Node.js 24.18.0**
3. 若弹出系统权限（UAC）请点「是」
4. 看到安装成功提示后，**完全退出应用并重新打开**
5. 再点「重新检测」，Node 应变为就绪

一键安装会优先使用 Windows winget；若不可用则自动下载官方 MSI（失败时可改用 npmmirror 镜像）。安装日志在用户数据目录的 `logs/node-install-*.log`。

### 手动安装

从 [Node.js 官网](https://nodejs.org/) 安装 **22 LTS 或更新** 版本（推荐 24.18.0），安装时勾选将 Node 加入 PATH。

装好后**重启本应用**，再验证：

```powershell
node -v
npm -v
```

## Google Chrome

请安装正式版 [Google Chrome](https://www.google.com/chrome/)。画像抓站、探索阶段打开客户网页依赖本机 Chrome；仅安装本应用**不够**。

## OpenCode CLI

轻量安装包**不内嵌** OpenCode。在已安装 Node 22+ 的前提下：

```powershell
npm install -g opencode-ai
opencode --version
```

也可在环境变量中指定可执行文件路径：`FTCS_OPENCODE_PATH`。

## 首次启动

1. 启动应用，等待 Sidecar / 运行时就绪  
2. 在 **设置** 中填写模型与搜索 Key  
3. 工作区默认在用户数据目录下的 `workspace`；可在设置中更改  

模板会同步 skills、MCP 预打包产物与配置；你的 `data/` 与 `.env` 不会被模板覆盖。

## 卸载

使用系统「应用和功能」卸载 Setup 版即可。便携版删除目录即可。用户工作区数据默认保留在 `%APPDATA%` 下。
