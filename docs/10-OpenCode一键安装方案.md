# 10 - OpenCode CLI 一键安装方案

> **决策日期**：2026-07-21  
> **状态**：已确认（已实现）  
> **范围**：仅 OpenCode CLI（npm 包 `opencode-ai`）；不含 Chrome  
> **前置文档**：[09-Node.js一键安装方案.md](./09-Node.js一键安装方案.md)（**必须先读**）  
> **关联**：`desktop/electron/onboarding/env-probe.ts`、`opencode/resolver.ts`、`runtime/resolve-node.ts`

---

## 1. 决策摘要

不将 OpenCode 打进 Electron 主安装包，改为**应用内一键安装**到 **userData 本地前缀**（方案 A），由合格 Node 执行 `npm install`。

| 项 | 决定 |
|----|------|
| 安装形态 | **方案 A**：`npm install opencode-ai@<版本> --prefix <userData>/opencode-runtime` |
| 钉死版本 | **opencode-ai@1.18.4**（与桌面 `@opencode-ai/sdk` ^1.18.x 同主版本；发版可改） |
| **硬前置** | **必须先有合格 Node.js（major ≥ 22）**；无 Node 则禁止安装 OpenCode |
| 首发平台 | Windows x64 |
| 成功后的感知 | 校验本地 bin 存在后，**提醒完全退出并重启**，再点「重新检测」 |
| 明确不做 | 不内嵌进主包；不 `npm -g`（避免与 nvm/全局前缀打架）；不做当场刷绿 |
| 兜底 | 保留文档中的手动安装说明与 `FTCS_OPENCODE_PATH` |

**产品原则**：OpenCode 是 npm 生态工具，**天然依赖 Node**；一键安装链路必须把「先 Node、后 OpenCode」做成产品规则，而不是假定用户环境已齐全。

---

## 2. 关键前提：OpenCode 依赖 Node（必读）

```text
合格 Node（≥22）──npm──► 安装 opencode-ai ──► 得到 opencode.exe
         │
         └── 运行期：OpenCode Server / MCP / npx 同样需要这份 Node
```

| 事实 | 对产品的含义 |
|------|----------------|
| `opencode-ai` 通过 **npm** 安装 | 没有可用 `node`/`npm`，一键安装**无法执行** |
| SDK 通过 PATH 拉起命令名 `opencode` | 装完还要让应用找得到 bin（本地前缀 + PATH/`FTCS_OPENCODE_PATH`） |
| 用户可能 PATH 上是 nvm 旧 Node | 安装与运行都必须走已实现的 `ensurePreferredNodeOnPath()`，**禁止**用到 v20 去装包 |

### 2.1 硬门禁（实现必须遵守）

1. **安装前**：调用 `resolveBestNode()` / `ensurePreferredNodeOnPath()`  
   - 若无 major ≥ 22 → 立即返回错误码 **`need-node`**，**不调用 npm**  
   - UI：禁用或点击后提示「请先一键安装 / 就绪 Node.js」，并引导 Node 行操作  
2. **安装中**：子进程 `env` 必须带已注入的合格 Node PATH（同一会话内）  
3. **运行期**（已有）：OpenCodeRuntime 启动前再次 `ensurePreferredNodeOnPath()`  
4. **文案**：引导页、安装文档、错误提示均写明依赖关系，避免用户只装 OpenCode  

### 2.2 是否自动串联「先装 Node 再装 OpenCode」

**MVP 不自动串联。**  

理由：Node 安装常涉及 UAC/重启；与 OpenCode 的 npm 安装生命周期不同，绑在一个按钮里失败态难解释。  

MVP 行为：

- Node 未就绪 → OpenCode 一键按钮禁用或失败码 `need-node` + 明确文案  
- 用户完成 Node → **重启应用** → Node 绿 → 再点 OpenCode 一键安装  

后续可选：提供「一键准备运行时（Node → 重启提示 → OpenCode）」向导，不在本方案 MVP 范围。

---

## 3. 背景与动机

当前探测仅提示 `npm install -g opencode-ai` 或打开安装文档，业务员操作成本高，且全局安装易与 nvm 冲突。

已有能力：

- Node 一键安装 + 多版本解析（[docs/09](./09-Node.js一键安装方案.md)）  
- `ensurePreferredNodeOnPath()`、`probeEnvironment()`  
- `ensureOpenCodeOnPath()` / `FTCS_OPENCODE_PATH`  

缺口：无应用内 OpenCode 安装编排；全局 `-g` 路径不可控。

---

## 4. 目标与非目标

### 4.1 目标

- Windows 上，在 **Node 已就绪** 的前提下，一点安装 **opencode-ai@1.18.4** 到 userData 前缀  
- 校验 `opencode.exe`（或平台对应 bin）存在后，提示重启再探测  
- 失败可读：`need-node` / 网络 / npm 失败 / 校验失败 + 日志路径  

### 4.2 非目标

- 不修改用户系统全局 npm 前缀、不强制 `npm -g`  
- 不捆绑进 NSIS/Portable 主包（`resources/opencode-cli` 仍预留）  
- 不处理 Chrome  
- 不在本会话强制把 OpenCode 探测刷绿  

### 4.3 成功标准

| 场景 | 期望 |
|------|------|
| Node ok，无 OpenCode | 一键成功 → 提示重启 → 重启后探测 ok，OpenCode 能 start |
| Node 缺失/过旧 | **不能**开始 npm；`need-node` + 引导装 Node |
| PATH 为 nvm v20，注册表/磁盘有 Node ≥22 | 用合格 Node 执行 npm；装到 userData，不依赖全局 |
| 已有 PATH 上的 opencode | 探测可 ok；一键可跳过或提供「安装推荐本地副本」 |
| npm 失败 | 镜像重试后仍失败 → 可读错误 + 手动文档 |

---

## 5. 安装位置与常量（方案 A）

```ts
export const OPENCODE_INSTALL = {
  packageName: 'opencode-ai',
  version: '1.18.4',
  /** 相对 app.getPath('userData') */
  prefixDirName: 'opencode-runtime',
  // Windows 典型 bin：
  // <userData>/opencode-runtime/node_modules/opencode-ai/bin/opencode.exe
  // 或以 package.bin 解析为准
  registryOfficial: 'https://registry.npmjs.org',
  registryMirror: 'https://registry.npmmirror.com',
  manualDocsUrl: 'https://ftcs.ai-utills.com/docs/install',
} as const
```

安装命令（示意）：

```text
"<resolved-node-dir>\npm.cmd" install opencode-ai@1.18.4 --prefix "<userData>\opencode-runtime"
```

可选失败重试：

```text
... --registry https://registry.npmmirror.com
```

安装成功后：

- 解析 bin 绝对路径  
- 写入用户偏好（建议）：`opencodePath` → 供下次启动与探测使用  
- 运行时等价于设置 `FTCS_OPENCODE_PATH`（prefs 优先于环境变量亦可，实现时定一种并文档化）

### 5.1 探测与 PATH 优先级（安装后）

1. 用户偏好 / `FTCS_OPENCODE_PATH`  
2. userData `opencode-runtime` 下的 bin  
3. 系统 PATH 上的 `opencode`  

`ensureOpenCodeOnPath()` 按此顺序查找，并 `prependPathDir`。

---

## 6. 成功感知

与 Node 方案对齐：

```text
npm 退出成功
  → 目标路径存在可执行文件
  → （推荐）opencode --version 可执行
  → UI：成功 + 「请完全退出后重开，再重新检测」+「退出应用」
  → 不在本会话强行 probe 变绿
```

禁止：仅凭 npm exit 0 报成功（假成功）。

---

## 7. 架构

```text
Renderer（Onboarding）
  OpenCode 行「一键安装」
        │ 若 Node 未 ok → 禁用或提示
        │ IPC: runtime:install-opencode
        ▼
Main
  install-opencode-service.ts
    1. ensurePreferredNodeOnPath()  → 失败 need-node
    2. npm install --prefix userData/opencode-runtime
    3. resolve bin + 可选 --version
    4. 写 prefs.opencodePath
    5. 返回 needsRestart
        │
        ▼ progress
  runtime:install-opencode-progress
```

建议新增/修改：

| 路径 | 职责 |
|------|------|
| `runtime/opencode-install-types.ts` | 常量与结果类型 |
| `runtime/install-opencode-service.ts` | 编排 |
| `ipc/types.ts` + preload + main | IPC |
| `onboarding/env-probe.ts` | 认本地前缀 / prefs |
| `opencode/resolver.ts` | 同序查找 |
| `OnboardingOverlay.vue` | 按钮与 `need-node` 文案 |
| `user-prefs` | 持久化 `opencodePath` |
| `website/content/docs/install.md` | 用户文档 |

---

## 8. UI 规则

| Node 状态 | OpenCode 状态 | OpenCode 主按钮 |
|-----------|---------------|-----------------|
| 非 ok | 任意 | **禁用**；旁注「需先就绪 Node.js 22+」 |
| ok | missing / error | **一键安装 OpenCode 1.18.4** |
| ok | ok | 无强制；可选「重装推荐版本」 |

进度文案需提及 Node，例如：「正在使用本机 Node 24 安装 OpenCode…」。

`need-node` 错误示例：

> OpenCode 依赖 Node.js。请先完成 Node.js 一键安装（或确保已安装 ≥22），完全退出并重启本应用后，再安装 OpenCode。

---

## 9. 错误码草案

| code | 含义 |
|------|------|
| `need-node` | 无合格 Node，未执行 npm |
| `unsupported-platform` | 非 Windows（MVP） |
| `npm-failed` | npm install 失败 |
| `verify-failed` | 装完找不到/跑不起 opencode |
| `busy` | 已有安装在进行 |
| `cancelled` | 用户取消（若有） |

---

## 10. 实现分期

### Phase 0 — 设计冻结（本文档）

- [x] 方案 A（userData 前缀）  
- [x] 版本 1.18.4  
- [x] **硬依赖 Node；MVP 不自动串联安装**  
- [x] 成功 = 校验 bin + 提醒重启  

### Phase 1 — 主进程

- [x] `install-opencode-service` + 类型  
- [x] IPC / 进度 / 日志（`userData/logs/opencode-install-*.log`）  
- [x] prefs 写入 `opencodePath`  
- [x] 扩展 `ensureOpenCodeOnPath` + `probeOpenCode`  

### Phase 2 — UI

- [x] Onboarding：Node 门禁 + 一键安装 + 重启提示  
- [x] 设置页可通过引导进入（既有入口）  

### Phase 3 — 文档

- [x] `install.md`：依赖 Node、本地前缀、一键流程  

---

## 11. 测试计划

| 用例 | 期望 |
|------|------|
| 仅缺 OpenCode，Node 24 可用（含 PATH=v20 场景） | 安装成功；用的是合格 Node 的 npm；重启后 ok |
| 无 Node | 按钮禁用或 `need-node`，日志无 npm 调用 |
| 断网 | npm-failed；镜像重试行为符合设计 |
| 重复点击 | busy |
| 装完不重启直接开 OpenCode | 允许尽力而为，但产品文案仍要求重启；不保证探测绿 |

---

## 12. 工作量粗估

| 范围 | 人天 |
|------|------|
| Phase 1–2 MVP | 2–3 |
| 文档与测试 | +0.5–1 |

---

## 13. 与 Node 方案的边界

| 主题 | 归属 |
|------|------|
| Node 安装 / 多版本 PATH | [docs/09](./09-Node.js一键安装方案.md) |
| OpenCode 安装 / 本地前缀 | **本文档** |
| 二者顺序 | **永远先 Node，后 OpenCode**；引导 UI 与错误码强制体现 |

---

## 14. 相关代码（实现时）

- Node 解析：`desktop/electron/runtime/resolve-node.ts`  
- OpenCode 解析：`desktop/electron/opencode/resolver.ts`  
- 探测：`desktop/electron/onboarding/env-probe.ts`  
- 运行时：`desktop/electron/opencode/runtime.ts`  
