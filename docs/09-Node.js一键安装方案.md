# 09 - Node.js 一键安装方案

> **决策日期**：2026-07-20（修订：2026-07-21）  
> **状态**：已确认（已实现）  
> **范围**：仅 Node.js；不含 OpenCode、Chrome 一键安装  
> **关联**：`desktop/electron/onboarding/env-probe.ts`、首次引导 Onboarding、设置页依赖清单

---

## 1. 决策摘要

不将 Node.js 内置进 Electron 安装包，改为**应用内一键安装**：由主进程编排，调用 winget 或官方 MSI。

| 项 | 决定 |
|----|------|
| 一键安装目标版本 | **Node.js 24.18.0**（钉死补丁版本，长久支持线） |
| 环境探测合格线 | **major ≥ 22** 即视为 `ok`（宽松，兼容已有 22.x 用户） |
| 首发平台 | **Windows x64**（Win10 / Win11） |
| 安装主路径 | **winget** 指定 `24.18.0`；失败或无 winget 时 **自动回退官方 MSI** |
| 成功后的感知 | **以安装进程成功为准**；UI **提醒用户完全退出并重启应用**，再点「重新检测」变绿 |
| 明确不做 | 不在同一会话内刷新 PATH、不强制当场把 Node 行刷成绿勾 |
| 最终兜底 | 仍保留「打开 Node 官网」手动安装 |
| 非目标 | 不内置 Node 二进制；不做 macOS/Linux 一键装（可预留接口） |

**产品原则**：降低内测安装摩擦，应用包保持轻量；安装成功与环境生效解耦——重启后由现有 `probeEnvironment()` 自然探测。

---

## 2. 背景与动机

当前引导仅探测并引导用户打开 [nodejs.org](https://nodejs.org/)，业务员需自行完成下载、勾选 PATH、重启等步骤，转化损耗大。

已有能力：

- `probeEnvironment()` / `probeNode()`：PATH 查找、版本解析、状态 `ok | missing | outdated | error`
- Onboarding「环境」阶段展示依赖清单
- IPC：`onboarding:probe-env`

缺口：无安装执行链路；装完后当前 Electron 进程 PATH 往往未刷新，易出现「已装上但仍显示缺失」。

---

## 3. 目标与非目标

### 3.1 目标

- 用户在引导或设置中点击一次，即可安装 **Node.js 24.18.0**
- 安装进程成功（winget / msiexec 退出码正常）后，明确提示：**请完全退出应用并重新打开，再点重新检测**
- 失败时给出可读错误码/文案、安装日志路径，并保留官网手动安装入口

### 3.2 非目标（本方案不做）

- 不安装 OpenCode CLI、Google Chrome
- 不将 Node 打进主安装包 / Portable 包
- 不绕过 UAC、不对抗企业禁用安装策略
- 不强制已有 22.x / 23.x 用户必须升级才继续使用产品

### 3.3 成功标准

| 场景 | 期望 |
|------|------|
| 无 Node | 一键安装成功 → 提示重启；重启后探测应变 `ok` |
| 已有 ≥ 22 | 探测 `ok`；可不强制安装 |
| 已有 &lt; 22 | 一键升级到 24.18.0；或失败时原因清晰 |
| 已有 ≥ 22 且 &lt; 24 | 探测仍为 `ok`；可提供「升级到 24.18.0（推荐）」弱提示 |
| 用户拒绝 UAC / 无权限 | `elevation-denied` + 官网按钮 |
| 无 winget | 自动走 MSI 回退；两者皆失败则官网手动装 |
| 非 Windows | `unsupported-platform`，不提供一键按钮或灰显说明 |

---

## 4. 版本策略（已拍板）

```text
安装目标：24.18.0   ← 一键安装始终指向此版本
探测合格：major ≥ 22  ← 已有 22+ 即绿勾，不挡主流程
```

### 4.1 常量建议（实现时集中配置）

```ts
export const NODE_INSTALL = {
  version: '24.18.0',
  minMajorForOk: 22,
  preferredMajor: 24,
  wingetPackageId: 'OpenJS.NodeJS.LTS',
  msiUrl: 'https://nodejs.org/dist/v24.18.0/node-v24.18.0-x64.msi',
  msiUrlMirror: 'https://npmmirror.com/mirrors/node/v24.18.0/node-v24.18.0-x64.msi',
  msiSha256: 'e30cd4ca15529583afe0efc978f1ae3ab3a93c2400c222d0752d17900552ebb3',
} as const
```

### 4.2 按钮与状态映射

| `probeNode` 状态 | UI 主操作 | 说明 |
|------------------|-----------|------|
| `ok`（≥22） | 无强制安装；可选「升级到 24.18.0（推荐）」若 major &lt; 24 | 不报红 |
| `missing` | **一键安装 Node.js 24.18.0** | 主路径 |
| `outdated`（&lt;22） | **一键安装 / 升级到 24.18.0** | 与 missing 同流程 |
| `error` | 一键安装 + 官网兜底 | 视错误详情 |

次按钮始终保留：**打开 Node 官网**（或安装文档）。

### 4.3 发版时改版本 checklist

1. 修改 `NODE_INSTALL.version`
2. 核对 winget 包 ID 是否提供该版本
3. 若启用 MSI 回退：更新 URL 与 SHA256
4. 同步 `website/content/docs/install.md` 与本方案文档中的版本号

---

## 5. 安装路径设计

### 5.1 主路径：winget

```text
winget install OpenJS.NodeJS.LTS --version 24.18.0 ^
  --accept-package-agreements --accept-source-agreements
```

实现时在常见路径查找 `winget.exe`（不仅依赖当前 PATH）。

### 5.2 自动回退：官方 MSI

当 `winget-missing` 或 `winget-failed` 时：

1. 下载固定 URL（官方优先，失败可试 npmmirror）
2. SHA256 校验（见 §4.1）
3. 提权运行 `msiexec /i ... /qn /norestart`
4. 以 msiexec 退出码判断成功与否

### 5.3 成功后的产品行为（已拍板，并含防假成功）

```text
安装进程结束
  → 必须在磁盘常见路径找到 node.exe，且 node -v 的 major ≥ 22
  → 才提示「安装成功，请完全退出并重启」
  → 仅 msiexec/winget 退出码为 0、但磁盘上没有 node → 报失败（曾出现 UAC 未弹出仍假成功）
  → 不在本会话刷新 PATH，不强制把 Node 行刷绿
```

PowerShell 提权脚本须处理：`Start-Process -Verb RunAs` 在取消/失败时 `$p` 为 `$null`，`exit $null` 会变成退出码 0，导致假成功。

### 5.4 明确不做

- Chocolatey / Scoop
- 用户自行下载并双击未说明的 ps1
- 同一会话内注册表 PATH 热刷新后「自动变绿」

---

## 6. 架构与模块

```text
Renderer（Onboarding / 设置→引导）
  └─「一键安装 Node.js」
        │ IPC: runtime:install-node
        ▼
Main
  ├─ install-node-service.ts     # 编排、单飞锁、日志、结果
  ├─ winget-node.ts              # winget 探测与执行
  ├─ msi-download.ts + msiexec   # 下载校验 + 提权静默安装
  └─ 成功 → needsRestart + 文案；不刷新 PATH、不重探测变绿
        │
        ▼ 事件
  runtime:install-node-progress
  app:quit（用户确认退出以便重启）
```

由 **Electron 主进程编排**；内部可调用 `resources/scripts/install-node.ps1` 便于单独调试，但用户入口必须在应用内按钮，而不是文档里的裸脚本。

### 6.1 IPC 草案

| Channel | 类型 | 用途 |
|---------|------|------|
| `runtime:install-node` | invoke | 执行安装，返回 `NodeInstallResult` |
| `runtime:install-node-progress` | event | 进度阶段文案 |
| `onboarding:probe-env` | invoke（已有） | 安装前后探测 |

### 6.2 结果类型草案

```ts
type NodeInstallResult =
  | {
      ok: true
      version: string
      method: 'winget' | 'msi' | 'already-ok'
      pathRefreshed: boolean
    }
  | {
      ok: false
      code: NodeInstallErrorCode
      message: string
      logPath?: string
      manualUrl: string
    }

type NodeInstallErrorCode =
  | 'unsupported-platform'
  | 'already-ok'
  | 'winget-missing'
  | 'winget-failed'
  | 'download-failed'
  | 'msiexec-failed'
  | 'elevation-denied'
  | 'verify-failed'
  | 'busy'
  | 'cancelled'
```

---

## 7. 成功感知与多 Node 并存

安装完成后**不**要求当前会话 PATH 立刻变绿；成功判定为：

1. winget / msiexec 退出码表示成功，**且**
2. 能解析到 major ≥ 22 的 `node.exe`（注册表 `InstallPath`、常见目录、PATH 均扫描）

### 7.1 用户环境与开发机相同的情况（nvm 旧版抢 PATH）

典型现象：

- 官网/MSI 已装 24.x（注册表 `HKLM\SOFTWARE\Node.js\InstallPath`）
- PATH 上 `where node` 优先命中 nvm 的 18/20

**产品侧处理（已实现）：**

| 环节 | 行为 |
|------|------|
| 环境探测 | 扫描全部候选，选用 ≥22 的最佳版本；detail 可提示 PATH 上另有旧版 |
| OpenCode / MCP 启动 | `ensurePreferredNodeOnPath()` 把合格 Node 目录插到 PATH 最前 |
| 可选覆盖 | 环境变量 `FTCS_NODE_PATH` 指向指定 `node.exe` |

不要求用户卸载 nvm 或手改系统 PATH；应用进程内优先使用合格版本即可。

---

## 8. 交互说明

### 8.1 Onboarding「环境」阶段

- Node 行：主按钮「一键安装 Node.js 24.18.0」（或「升级到 24.18.0」）
- 安装中：按钮 loading，展示进度（检查中 / 可能需要权限确认 / 正在安装 / 正在验证）
- 事先提示：可能弹出 Windows 用户账户控制（UAC），请点击「是」
- 成功：自动 `probeEnvironment()`，Node 行变绿
- 失败：展示 `message`，可打开日志目录，保留官网链接

### 8.2 设置页

依赖清单提供同一入口，避免关闭引导后无法再装。

### 8.3 并发与生命周期

- 全局单飞：同时只允许一次 Node 安装
- 应用退出：尽量终止子进程；日志标记 `cancelled`

---

## 9. 实现分期

### Phase 0 — 设计冻结

- [x] 安装版本：24.18.0
- [x] 探测合格线：≥ 22
- [x] 成功后仅提醒重启（不做 PATH 热刷新 / 当场变绿）
- [x] winget 优先 + MSI 自动回退
- [x] MSI SHA256：`e30cd4ca15529583afe0efc978f1ae3ab3a93c2400c222d0752d17900552ebb3`

### Phase 1 — 主进程内核

- [x] `desktop/electron/runtime/*` 安装服务
- [x] IPC：`runtime:install-node` / progress / `app:quit`
- [x] 单飞锁与日志（`userData/logs/node-install-*.log`）

### Phase 2 — UI

- [x] Onboarding Node 行一键安装 + 进度 + 成功退出提醒
- [x] 设置页说明可从引导进入
- [x] ≥22 且 &lt;24 时「升级到 24.18.0（推荐）」

### Phase 3 — 文档

- [x] 更新 `website/content/docs/install.md`
- [x] 本方案文档与实现对齐

### 后续（可选）

- [ ] 非 Windows 一键安装
- [ ] OpenCode 一键安装（依赖本能力）

---

## 10. 测试计划

| 用例 | 准备 | 期望 |
|------|------|------|
| 干净机无 Node | 卸载 Node、清理 PATH | 一键成功，探测 ok，版本为 24.18.0 或可接受的已装 24.18.0 |
| Node 18 | 保留旧版 | 升到 24.18.0 或失败原因清晰 |
| Node 22 | 已有 22.x | 探测 ok；升级按钮可选 |
| 已有 24.18.0 | — | already-ok / 不重复折腾 |
| 拒绝 UAC | 点否 | elevation-denied |
| 无 winget | 精简环境 | winget-missing + 官网 |
| 装完不重启 | — | PATH 刷新后应 ok；否则重启文案 |
| 断网 | — | 失败可读 |
| 重复点击 | 安装中再点 | busy |
| 非 Windows | — | unsupported-platform |

验收建议使用**无开发环境的 Win10/11 虚拟机**。

---

## 11. 风险与缓解

| 风险 | 缓解 |
|------|------|
| winget 无 24.18.0 或 ID 变更 | Phase 0 核对；改 ID 或提前上 MSI |
| 装完探测仍红 | 注册表 PATH + 默认路径 + 重启文案 |
| 企业禁装 / 无管理员 | 明确错误；内测人工协助 |
| 用户不信任脚本 | UI 写明调用 Windows winget / Node 官方包 |
| 多份 Node 共存 | detail 打印实际路径；文档说明 PATH 优先级 |

---

## 12. 工作量粗估

| 范围 | 人天 |
|------|------|
| MVP：winget + PATH 刷新 + Onboarding | 3–5 |
| + 设置页 + 文档 + 测试 | +1–2 |
| + MSI 自动回退 | +2 |

---

## 13. 与后续工作的边界

| 主题 | 关系 |
|------|------|
| OpenCode 一键安装 | **另案**；依赖本方案装好的 Node/`npm` |
| Chrome | 仍探测 + 官网链接，本方案不覆盖 |
| 运行时内置进安装包 | 明确不做；与本文「轻量包 + 一键脚本/编排」一致 |
| 垂直应用脚手架 | 「运行时 bootstrap」可沉淀为可复用模块，但实现先服务 FTCS |

---

## 14. 相关代码与文档

- 探测：`desktop/electron/onboarding/env-probe.ts`
- 引导 UI：`desktop/src/components/onboarding/OnboardingOverlay.vue`
- 用户文档：`website/content/docs/install.md`
- 产品形态决策：[08-产品架构决策-Electron-OpenCode.md](./08-产品架构决策-Electron-OpenCode.md)
