# 08 - 产品架构决策：Electron + OpenCode CLI

> **决策日期**：2026-07-12（修订：2026-07-15）  
> **状态**：已确认  
> **替代方案**：纯 Web SaaS、Cursor 绑定、自研独立 Agent 引擎（暂不采用）

---

## 1. 决策摘要

**产品形态**：桌面应用（Electron）+ **OpenCode JS SDK（`createOpencode` Server + Client）** + 自研外贸业务 Web UI（Vue 3）。

业务用户通过桌面 App 完成全流程，无需安装 Cursor、无需在 IDE 里对话。

### 1.1 2026-07-15 集成方式修订

| 项 | 决定 |
|----|------|
| 集成 API | 官方 `@opencode-ai/sdk` 的 **Server + Client**（`createOpencode`） |
| 前端 | Vue 3（Electron Renderer） |
| OpenCode 二进制 | **暂不内嵌**；开发/试用期要求本机 PATH 已安装 `opencode` |
| 内嵌二进制 | 延后（产品安装包优化阶段再做） |

SDK 仍会本机 `spawn opencode serve`；与手动 Sidecar 的差别是生命周期由 SDK 托管，Client 类型安全。

---

## 2. 为什么选择这个方案

| 考量 | Electron + OpenCode CLI |
|------|-------------------------|
| 学习成本 | 用户只见按钮和表单，不见 MCP/Skill |
| 与 Phase 1 复用 | Skills、MCP、`data/` 约定可直接沿用 |
| 智能体引擎 | 复用 OpenCode 成熟的 Agent + MCP 调度，不自研 |
| 数据与隐私 | 默认本地 `data/`，API Key 存本机 |
| 探索能力 | 本机可接 chrome-devtools-mcp、Playwright |
| 产品化 | 单安装包，类似 OpenCode Desktop 模式 |
| 开源生态 | OpenCode 可自托管、可定制，不绑 Cursor 商业 IDE |

---

## 3. 目标架构

```mermaid
flowchart TB
    subgraph ElectronApp["Electron 桌面应用"]
        subgraph Renderer["渲染进程：Vue3 外贸 UI"]
            Pages["产品录入 │ 线索库 │ 邮件审核 │ 设置"]
        end
        subgraph Main["主进程"]
            Lifecycle["应用生命周期 / 窗口"]
            SDK["@opencode-ai/sdk createOpencode"]
            Config["本地配置 / API Key"]
        end
        Renderer -->|IPC| SDK
        SDK -->|client| OCServer
        SDK -->|spawn PATH 上的 opencode| OCServer
    end

    subgraph OCServer["OpenCode Server"]
        Agent["Agent 调度 / LLM"]
        MCP["MCP 客户端"]
        Skills["Skills 加载"]
    end

    subgraph Local["本机资源"]
        CLI["本机已安装 opencode CLI"]
        LS["lead-store MCP"]
        SA["search-api MCP"]
        CD["chrome-devtools MCP（可选）"]
        Data["data/ 工作区"]
    end

    SDK -.-> CLI
    MCP --> LS
    MCP --> SA
    MCP --> CD
    LS --> Data
    SA --> Data
    Agent --> Skills
```

### 3.1 各层职责

| 层 | 职责 | 技术 |
|----|------|------|
| **外贸 Web UI** | 产品录入、探索触发、线索展示、邮件审核 | Vue 3 + Vite（Electron Renderer） |
| **Electron 主进程** | `createOpencode` 启停、IPC、配置、健康检查 | Electron Main + `@opencode-ai/sdk` |
| **OpenCode Server** | Agent 循环、LLM、MCP、Skill | SDK 拉起的本机 `opencode serve` |
| **MCP 服务** | lead-store、search-api 等确定性工具 | Phase 1 已有 `mcp-servers/` |
| **Skills** | 业务流程编排说明 | Phase 1 已有 `skills/` |
| **data/** | 画像、线索、邮件持久化 | JSON 文件（Phase 2 可迁 SQLite） |

### 3.2 与 OpenCode Desktop 的关系

OpenCode 官方桌面版也是：**Electron + 内嵌 CLI Server + Web UI**。

本项目的差异在于：

- **UI 不是通用编程界面**，而是外贸获客专用控制台
- **Skills 是领域工作流**（extract-product-profile、discover-leads 等）
- **MCP 是外贸工具链**（lead-store、search-api）

引擎用 OpenCode，产品是自研 UI。

---

## 4. 运行时序（典型操作）

### 4.1 应用启动

```
1. 用户双击 App
2. Electron Main：检测 PATH 上的 opencode → createOpencode({ port, config })
3. SDK 拉起 Server 并返回 client
4. Renderer 经 IPC 查询状态；业务调用后续可走 Main 持有的 client
5. UI 显示「就绪」；退出时 server.close()
```

> 当前阶段若本机未安装 OpenCode，启动失败并给出安装指引（不自动下载二进制）。

### 4.2 用户点击「提取产品画像」

```
1. UI 收集网站 URL
2. UI → OpenCode API：创建 Session / 发送 Prompt（或调用预置 Skill 触发语）
3. OpenCode Agent 执行 extract-product-profile Skill
4. Agent 调用 lead-store、chrome-devtools MCP
5. 结果写入 data/products/{id}/profile.json
6. UI 轮询或订阅事件，读取 profile 展示（经 lead-store API 或直接读 data/）
```

### 4.3 用户点击「开始 R1 探索」

```
1. UI 触发 discover-leads Skill（带 product_id、max_queries）
2. OpenCode 编排：search-api → chrome-devtools → lead-store
3. UI 展示进度（queries_executed、leads_found）
4. 完成后跳转线索库页
```

---

## 5. 后端在哪里？客户端还是服务端？

**结论：Phase 2 后端在客户端（本机）。**

| 组件 | 运行位置 |
|------|---------|
| OpenCode Server | 本机（SDK `createOpencode` 拉起） |
| lead-store / search-api | 本机（MCP 子进程） |
| chrome-devtools | 本机（用户 Chrome） |
| LLM API | 云端（OpenAI / Anthropic 等，由 OpenCode 配置） |
| Tavily | 云端（Key 存本机配置） |
| 外贸 Web UI | Electron 渲染进程（本质本地） |

**不是**纯浏览器 SaaS；**是**本地 Desktop + 云端 LLM/搜索 API。

未来若做多租户 SaaS，可再增加**远程 OpenCode Server** 模式，与本地模式并存。

---

## 6. 项目目录规划（Phase 2 新增）

```
foreign-trade-customer-search/
├── mcp-servers/          # 不变
├── skills/               # 不变
├── data/                 # 运行时工作区（App 可配置路径）
├── docs/
├── desktop/              # 新增：Electron 应用
│   ├── package.json
│   ├── electron/
│   │   ├── main.ts              # 主进程
│   │   ├── preload.ts
│   │   └── opencode/runtime.ts  # createOpencode 封装
│   ├── src/                     # Vue 3 渲染进程
│   └── resources/opencode-cli/  # 预留捆绑目录（当前未用）
└── config/
    └── opencode/
        └── opencode.json        # MCP / Skills 配置
```

---

## 7. OpenCode 集成要点

### 7.1 SDK Server + Client（当前方案）

```ts
import { createOpencode } from '@opencode-ai/sdk'

// Main 进程：先 chdir 到仓库根，再：
const { client, server } = await createOpencode({
  hostname: '127.0.0.1',
  port: 4096,
  timeout: 60_000,
  config: /* config/opencode/opencode.json */,
})

// 退出时
server.close()
```

工作区为含 `data/`、`config/`、`skills/`、`mcp-servers/` 的项目根目录。  
前提：本机 PATH 可执行 `opencode`（暂不捆绑二进制）。

### 7.2 MCP 配置

OpenCode 读取 workspace 下的 MCP 配置，指向：

- `mcp-servers/lead-store/dist/index.js`
- `mcp-servers/search-api/dist/index.js`
- `user-chrome-devtools`（本机已安装的 MCP，或 App 引导安装）

### 7.3 Skills 加载

将 `skills/` 同步或链接至 OpenCode 可识别的 Skills 目录（具体路径依 OpenCode 版本配置而定）。

### 7.4 UI 与 Agent 的协作方式

| 方式 | 说明 |
|------|------|
| **A. Prompt 触发 Skill** | UI 发送固定触发语，如「请对 prod_xxx 执行 R1 探索」 |
| **B. OpenCode API 直接调 Tool** | 若 OpenCode 暴露 MCP 代理 API，UI 绕过对话直接调 lead-store |
| **C. 混合** | 展示/列表用 B（读 data）；执行流程用 A（Agent 编排） |

Phase 2 MVP 推荐 **C**：列表与表单直接读 `lead-store`；「一键探索」等长流程走 Agent + Skill。

---

## 8. Phase 2 实施阶段（修订）

### 2.0 桌面壳 + OpenCode 集成（P0，新增）

| # | 任务 | 说明 |
|---|------|------|
| 2.0.1 | 初始化 `desktop/` Electron 项目 | Vite + Vue 3 |
| 2.0.2 | Main：`createOpencode` Server+Client 启停 | `@opencode-ai/sdk` |
| 2.0.3 | 本机 OpenCode CLI 检测（暂不捆绑） | PATH / `FTCS_OPENCODE_PATH` |
| 2.0.4 | OpenCode MCP 配置模板 | `config/opencode/opencode.json` |
| 2.0.5 | Skills 同步至 OpenCode 可加载路径 | `scripts/sync-skills.ps1` |
| 2.0.6 | （延后）安装包内嵌 opencode 二进制 | 产品化打包阶段 |

### 2.1 外贸 Web UI（P0）

| # | 任务 | 说明 |
|---|------|------|
| 2.1.1 | 产品录入页 | URL → 触发 extract-product-profile |
| 2.1.2 | 产品画像页 | 展示/编辑 profile |
| 2.1.3 | 探索页 | 一键 R1 + 进度 |
| 2.1.4 | 线索库页 | scored.json 表格 |
| 2.1.5 | 邮件审核页 | draft 编辑 + 通过 |
| 2.1.6 | 设置页 | Tavily Key、LLM Provider |

### 2.2 引擎增强（P1，原 Phase 2）

- email-sender、scheduler、R2/R3 探索、SQLite 等（见 [04-实施计划.md](04-实施计划.md)）

---

## 9. 风险与应对

| 风险 | 应对 |
|------|------|
| OpenCode 版本升级 breaking change | 锁定 CLI 版本；抽象 UI 与 Server 的 API 层 |
| Sidecar 启动失败 | Main 进程健康检查 + 用户可读错误提示 |
| 本机未装 OpenCode | UI 明确错误提示与安装命令；后续再做内嵌 |
| chrome-devtools 依赖用户 Chrome | 探索页检测环境；Phase 2 备选 Playwright MCP |
| Windows 防火墙拦截本地端口 | 固定 localhost + 文档说明 |

---

## 10. 明确不做的（本阶段）

- 不做纯浏览器 SaaS（无本地 Server）
- 不要求用户安装 Cursor
- 不自研完整 Agent 引擎（复用 OpenCode）
- **暂不**在安装包内嵌 OpenCode 二进制（开发期用本机安装）
- 不在 Phase 2 做移动端

---

## 11. 相关文档

- [Phase 1 复盘](retrospective/phase-1.md)
- [04-实施计划.md](04-实施计划.md)
- [02-系统架构.md](02-系统架构.md)（待更新 Electron 层）
