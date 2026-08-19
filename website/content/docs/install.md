# 安装与前置

## 系统要求

在安装本应用之前，客户电脑需已具备：

| 依赖 | 要求 | 用途 |
|------|------|------|
| Windows | 10 / 11，x64 | 运行桌面安装包或便携版 |
| **Node.js** | **22 及以上** | 安装 OpenCode、用 `node` 启动 MCP、`npx` 拉取工具 |
| **Google Chrome** | 已安装并可正常启动 | `chrome-devtools` 浏览网站、探索打开页面（Electron 内置浏览器不能替代） |
| **OpenCode CLI** | 本机 PATH 可执行 `opencode`，或应用内一键安装 | 应用通过 SDK 拉起 `opencode serve`（轻量包不内嵌） |
| 模型 / 搜索 | **官方通道**（登录开通即可）或 **自定义**（自备模型 Key + Tavily） | 画像 / 探索 / 邮件起草 |

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

轻量安装包**不内嵌** OpenCode。OpenCode **依赖 Node.js 22+**，请先完成上一节 Node 安装并重启应用。

### Windows 一键安装（推荐）

1. 确认引导里 Node.js 已显示就绪（≥22）
2. 点击 **一键安装 OpenCode 1.18.4**
3. 安装成功后**完全退出并重新打开应用**
4. 再点「重新检测」，OpenCode 应变为就绪

一键安装会把 CLI 装到应用数据目录（`opencode-runtime`），不使用 `npm -g`，避免与 nvm 等全局环境冲突。日志在用户数据目录的 `logs/opencode-install-*.log`。

### 手动安装

在已安装 Node 22+ 的前提下：

```powershell
npm install -g opencode-ai
opencode --version
```

也可在环境变量中指定可执行文件路径：`FTCS_OPENCODE_PATH`。

## OfficeCLI（可选）

若要用 **Word / Excel / PPT**（`.docx` / `.xlsx` / `.pptx`）生成产品画像，可在首次引导或生成提示中**一键安装 OfficeCLI**（装到应用数据目录，不进入主安装包）。未安装时仍可用官网与文本文件生成；遇 Office 文件时可选择安装、跳过该文件或取消。

当前不覆盖 PDF、老格式 `.doc` 的抽取。

## 首次启动

1. 启动应用，等待 Sidecar / 运行时就绪  
2. 在 **设置 → 模型通道** 选择：  
   - **官方通道（推荐）**：登录并开通后即可使用模型与搜索，无需再填搜索 Key  
   - **自定义**：填写自备模型 Key，并配置 Tavily 搜索 Key  
3. 工作区默认在用户数据目录下的 `workspace`；可在设置中更改  

模板会同步 skills、MCP 预打包产物与配置；你的 `data/` 与 `.env` 不会被模板覆盖。

## 卸载

使用系统「应用和功能」卸载 Setup 版即可。便携版删除目录即可。用户工作区数据默认保留在 `%APPDATA%` 下。
