# 安装与前置

本文说明如何安装 FTCS 外贸获客系统，以及桌面智能体运行所需的本机环境。

## 系统要求

在安装本应用之前，客户电脑需已具备：

| 依赖 | 要求 | 用途 |
|------|------|------|
| Windows | 10 / 11，x64 | 运行桌面安装包或便携版 |
| **Node.js** | **22 及以上** | 运行 MCP、`npx` 等（应用内可一键准备到私有目录） |
| **Google Chrome** | 已安装并可正常启动 | 画像抓站、广撒网打开客户官网（社媒发现不打开社媒真页；Electron 内置浏览器不能替代） |
| **OpenCode CLI** | 本机 PATH 可执行 `opencode`，或应用内一键准备 | 应用通过 SDK 拉起 `opencode serve`（轻量包不内嵌） |
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

下载入口：[下载页](/download)。国内用户建议优先选 **Gitee**（通常更快），也可使用 GitHub。若按钮暂时不可用，请稍后重试，或通过页脚联系方式向我们索取安装包。

## Node.js 22+

本应用运行 MCP 等能力需要 **Node.js 22 及以上**。推荐在应用内 **一键准备** 到私有目录（不写系统 PATH、无需 UAC）。

### Windows 一键准备（推荐）

1. 启动应用，打开首次引导「环境监测」（或在 **设置** 中重新打开引导）
2. 若 Node 显示缺失或过旧，点击 **一键准备 Node.js 24.18.0**
3. 等待下载与校验完成；成功后引导会 **自动重新检测**，一般 **无需退出应用**
4. Node 应变为就绪；若仍异常可点「重新准备」或查看日志

一键准备会从 Gitee 镜像（失败时回退 GitHub）下载官方 zip，解压到应用数据目录的 `node-runtime/`。日志在用户数据目录的 `logs/node-install-*.log`。

若你 **尚未** 在应用内一键准备，且本机已自行安装合格 Node（≥22），引导也会识别为就绪。

### 手动安装

从 [Node.js 官网](https://nodejs.org/) 安装 **22 LTS 或更新** 版本（推荐 24.18.0），安装时勾选将 Node 加入 PATH。

装好后**重启本应用**，再验证：

```powershell
node -v
npm -v
```

> **说明**：完成应用内一键准备后，环境检测 **只认应用私有 Node**，不再回退系统 PATH。

## Google Chrome

请安装正式版 [Google Chrome](https://www.google.com/chrome/)。画像抓站、广撒网打开客户官网仍依赖本机 Chrome；社媒发现不打开领英 / 脸书真页，但核对公司官网时仍可能用到 Chrome。仅安装本应用**不够**。

## OpenCode CLI

轻量安装包**不内嵌** OpenCode。推荐在引导中 **一键准备** 到应用目录（**不依赖 npm**）。

### Windows 一键准备（推荐）

1. 在引导「环境监测」中点击 **一键准备 OpenCode 1.18.4**
2. 等待下载与校验完成；成功后引导会 **自动重新检测**，一般 **无需退出应用**
3. OpenCode 应变为就绪；若仍异常可点「重新准备」或查看日志

一键准备会把 `opencode.exe` 下载到应用数据目录的 `opencode-runtime/`。日志在用户数据目录的 `logs/opencode-install-*.log`。

若你 **尚未** 在应用内一键准备，且本机 PATH 上已有 `opencode`，引导也会识别为就绪。

### 手动安装

在已安装 Node 22+ 的前提下：

```powershell
npm install -g opencode-ai
opencode --version
```

也可在环境变量中指定可执行文件路径：`FTCS_OPENCODE_PATH`。

> **说明**：完成应用内一键准备后，环境检测 **只认应用私有 OpenCode**，不再回退 npm 或系统 PATH。

<h2 id="officecli">OfficeCLI（可选）</h2>

若要用 **Word / Excel / PPT**（`.docx` / `.xlsx` / `.pptx`）生成产品画像，可在首次引导或生成提示中**一键安装 OfficeCLI**（装到应用数据目录，不进入主安装包）。未安装时仍可用官网与文本文件生成；遇 Office 文件时可选择安装、跳过该文件或取消。

当前不覆盖 PDF、老格式 `.doc` 的抽取。

## 首次启动

1. 启动应用，等待 Sidecar / 运行时就绪  
2. 在 **设置 → 模型通道** 选择：  
   - **官方通道（推荐）**：登录并开通后即可使用模型与搜索，无需再填搜索 Key  
   - **自定义**：填写自备模型 Key，并配置 Tavily 搜索 Key  
3. 工作区默认在用户数据目录下的 `workspace`；可在设置中更改  
4. **可选**：若计划使用 **R3 地图发现**，在设置 → 探索填写 [Google Places API Key](/docs/places-api-key)（须合法合规访问 Google）  
5. **可选**：若计划 **补全联系人**，在设置 → 集成填写 [Hunter API Key](/docs/hunter-api-key)

模板会同步 skills、MCP 预打包产物与配置；你的 `data/` 与 `.env` 不会被模板覆盖。

## 卸载

使用系统「应用和功能」卸载 Setup 版即可。便携版删除目录即可。用户工作区数据默认保留在 `%APPDATA%` 下。
