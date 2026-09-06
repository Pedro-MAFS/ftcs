# US-R-01 私有 Node 运行时设计

> **用户故事**：[../19-需求-简化运行环境安装.md](../19-需求-简化运行环境安装.md) · US-R-01  
> **状态**：编码已落地  
> **范围**：Windows x64 下一键下载官方 Node zip → 校验 → 解压到 `userData/node-runtime`；扩展 prefs / 解析 / 探测；**停用** winget/MSI 安装编排  
> **依赖**：现网 `env-probe`、`install-node-service`（将被替换）、OfficeCLI 下载形态（`officecli-download.ts`）、[09-Node.js一键安装方案.md](../09-Node.js一键安装方案.md)（历史参考）  
> **不做**：OpenCode 二进制直装（US-R-02）；引导全文案大改（US-R-03）；macOS/Linux 私有 Node；打进主包  
> **文档位置**：`docs/design/`

---

## 0. 相对现网

| 现网 | **US-R-01** |
|------|-------------|
| winget → MSI 回退；UAC；装完 **needsRestart: true** | **Gitee → 官方 → npmmirror** 下 zip；无 UAC；**needsRestart: false**，当场 probe 绿 |
| 无 `prefs.nodePath` | 增加 **`nodePath`**；私有装完写入绝对路径 |
| `resolveBestNode` 扫注册表 + PATH | **未绑定私有**：仍用现网 `resolveBestNode`（系统 Node ≥22 即 ok，**不必下载**） |
| 同上 | **已绑定私有**：**仅** env → prefs → `userData/node-runtime`；**不**再扫系统 |
| 按钮「一键安装 Node.js 24.18.0」 | **缺失/过旧**时「**一键准备 Node.js 24.18.0**」；**已就绪**无按钮（系统或私有均可） |
| 失败可暗示官网 / MSI | 失败 **仅**重试私有 zip / 手动下同一资产；**不回退** winget/MSI |

---

## 1. 已确认选型

| 项 | 决定 |
|----|------|
| **Q1 安装物** | Node 官方 **`node-v24.18.0-win-x64.zip`**（内含 `node.exe`、`npm.cmd`、`npx.cmd`、`node_modules/npm` 等），**原样镜像**，不重打包 |
| **Q2 落盘** | 解压 **内层目录** `node-v24.18.0-win-x64/*` 到 `<userData>/node-runtime/`（展平一层）；`prefs.nodePath` = `<userData>/node-runtime/node.exe` |
| **Q3 下载源** | **Gitee 团队镜像 → nodejs.org → npmmirror**；三源 **同一文件**，钉死 **zip 级 SHA256** |
| **Q4 版本** | **24.18.0**；探测合格线 **major ≥ 22**（与现网一致） |
| **Q5 私有绑定** | 用户 **成功完成** 本故事的一键准备（写入 `prefs.nodePath` 且路径位于 `userData/node-runtime`）→ **永久绑定私有**（[需求 R10](../19-需求-简化运行环境安装.md)） |
| **Q6 系统已有 Node** | **未绑定**且 `resolveBestNode` 得 **≥22** → probe **`ok`**，**不展示**一键按钮，**不强制**下载 |
| **Q7 重启** | 成功 **`needsRestart: false`**；UI 安装 IPC 返回后 **`runProbe()`** |
| **Q8 平台** | 首发 **win32 + x64**；其它平台 probe 说明 + 禁用一键 |
| **Q9 重装** | 已绑定且 probe ok：次要 **「重新安装」**（覆盖 `node-runtime`，再校验）；未绑定且系统 ok：可选 **「安装到应用目录」** 放 US-R-03，本故事 **不强制** |
| **Q10 互斥** | 与 OpenCode / OfficeCLI 安装互斥（沿用 `anyRuntimeInstalling`） |
| **Q11 失败** | 不自动改走 winget/MSI/npm；文案给 Gitee/官方直链 + `getDocsInstallUrl()` |
| **Q12 子进程 PATH** | `ensurePreferredNodeOnPath()`：绑定后 **只** prepend 私有目录；未绑定时行为与现网一致 |

### 1.1 钉死常量（编码用）

```ts
/** 见 node-portable-install-types.ts */
export const NODE_PORTABLE_INSTALL = {
  version: '24.18.0',
  minMajorForOk: 22,
  prefixDirName: 'node-runtime',
  zipAssetName: 'node-v24.18.0-win-x64.zip',
  /** zip 内顶层目录名，解压时需展平 */
  zipInnerDirName: 'node-v24.18.0-win-x64',
  nodeExeName: 'node.exe',
  /**
   * 官方 SHASUMS256.txt（v24.18.0 win-x64.zip）
   * Gitee 镜像须与此 hash 一致
   */
  sha256Zip:
    '0ae68406b42d7725661da979b1403ec9926da205c6770827f33aac9d8f26e821',
  expectedZipBytes: 37_176_245,
  urlGitee:
    'https://gitee.com/mfs1998_admin/public-resource/releases/download/nodev24.18.0/node-v24.18.0-win-x64.zip',
  urlOfficial:
    'https://nodejs.org/dist/v24.18.0/node-v24.18.0-win-x64.zip',
  urlMirror:
    'https://npmmirror.com/mirrors/node/v24.18.0/node-v24.18.0-win-x64.zip',
  downloadTimeoutMs: 180_000,
  installTimeoutMs: 15 * 60 * 1000,
  get manualDocsUrl(): string {
    return getDocsInstallUrl()
  },
} as const
```

> **运维**：Gitee Release 标签 `nodev24.18.0`，资产 `node-v24.18.0-win-x64.zip`。升版时同步三源之一校验 SHA256 后更新常量。

---

## 2. 目标与非目标

### 2.1 目标

1. 引导 / 设置中，Node **缺失或过旧**（&lt;22）时可一键下载到应用目录，**无 UAC**。  
2. 装完 **当场** probe 变绿；spawn MCP / npx 时 PATH 含私有 `node-runtime`。  
3. **系统已具备 Node ≥22** 的用户 **无需下载** 即可过引导。  
4. **绑定私有后** 运行期与重装 **只认** `userData/node-runtime`，系统 PATH 上的其它 Node **不参与**。  
5. 提供稳定 **`resolveConfiguredNode()`** / **`isNodePortableBound()`** 供 probe、OpenCode、MCP 复用。

### 2.2 非目标

| 不做 | 归属 |
|------|------|
| OpenCode 直装 | US-R-02 |
| 引导 subtitle 全文案、支持计划状态 | US-R-03 |
| winget/MSI 并列入口或失败回退 | 需求 R9/R11 |
| 强制所有用户下载（系统 ok 仍要 zip） | 需求 §7 + Q6 |
| macOS / Linux zip | 后续 |
| 内置 zip 进主包 | 需求 |

---

## 3. 目录与 prefs

```text
<userData>/
  node-runtime/                 ← NODE_PORTABLE_INSTALL.prefixDirName
    node.exe                    ← prefs.nodePath
    npm.cmd
    npx.cmd
    node_modules/npm/ ...
  ftcs-prefs.json
    nodePath: "C:\\...\\node-runtime\\node.exe"
  logs/
    node-install-{iso}.log
  tmp/                          ← 可选：下载 zip 临时目录
    node-download-{ts}.zip
```

**绑定判定** `isNodePortableBound()`（满足任一即为 true）：

1. `prefs.nodePath` 已设置，且解析后路径位于 `getNodeRuntimeDir()` 下；或  
2. `getNodeRuntimeDir()/node.exe` 存在，且同目录存在安装器写入的标记文件 **`.ftcs-node-portable`**（内容为 `24.18.0`，便于重装识别）。

> 仅有系统 Node、**无**上述 prefs/标记 → **未绑定**，probe 可走系统解析。

---

## 4. 解析与 PATH 注入

### 4.1 `resolveConfiguredNode()`（新增，`node-paths.ts`）

**仅私有链**，供 **已绑定** 或 **装完后验证** 使用：

```text
FTCS_NODE_PATH（文件存在）
  → prefs.nodePath（文件存在）
  → <userData>/node-runtime/node.exe（文件存在）
  → null
```

返回 `{ exe, source } | null`；**不**查注册表、**不**查 PATH。

### 4.2 `resolveBestNode()`（改 `resolve-node.ts`）

```text
if isNodePortableBound():
  configured = resolveConfiguredNode()
  if configured && major >= minMajor → bestOk = configured（仅此一份）
  else → bestOk = null（missing/error，不回退系统）
else:
  现网逻辑：FTCS_NODE_PATH → 注册表 → 常见路径 → PATH
```

### 4.3 `ensurePreferredNodeOnPath()`

- **已绑定**：仅当 `resolveConfiguredNode()` 且 major ≥ minMajor 时，prepend `dirname(node.exe)` 到 `PATH` / `Path`。  
- **未绑定**：与现网相同（`resolveBestNode` 的 bestOk）。

### 4.4 `findAcceptableInstalledNode()`

- 安装 **verify** 阶段：**必须**在 `resolveConfiguredNode()` 或刚写入的 `nodePath` 上读到 ≥22，**禁止**用系统 PATH 冒充 portable 装成功。

---

## 5. 探测 `probeNode()`（改 `env-probe.ts`）

```text
if isNodePortableBound():
  configured = resolveConfiguredNode()
  无 exe → missing（detail：应用内 Node 未安装或已删除，请重新准备）
  有 exe，node -v 失败 → error
  major < 22 → outdated
  major >= 22 → ok（detail 含版本·路径·source）
else:
  现网 resolveBestNode({ minMajor: 22 })
  无 → missing
  有但 <22 → outdated
  有且 >=22 → ok（detail 可含「系统安装」source）
```

**不**在「未绑定 + 系统 ok」时展示一键按钮（`canOneClickInstallNode` 保持 `status !== 'ok'`）。

**移除** `canUpgradeNode` 对 winget/MSI「升级到 24.18.0」的引导；系统 22.x/23.x 保持 **ok** 即可。可选「安装到应用目录」按钮留 **US-R-03**。

---

## 6. 安装编排 `installNodePortableRuntime()`

实现文件：**`install-node-portable-service.ts`**（编码完成后 **`main.ts` 改调此函数**；`install-node-service.ts` 中 winget/MSI 逻辑 **删除** 或整文件替换）。

### 6.1 流程

```text
busy? → busy
非 win32 → unsupported-platform
emit checking

若 isNodePortableBound() 且 resolveConfiguredNode() 可读且 major>=22
  → 可选：返回 already-ok（needsRestart: false），或继续重装流程（见 Q9「重新安装」）

emit downloading
urls = [urlGitee, urlOfficial, urlMirror]
下载到 <temp>/ftcs-node-portable/node-download-{ts}.zip
  进度 phase=downloading（字节/MB 或 %）

emit verifying
SHA256(zip) !== sha256Zip → checksum（删临时 zip，不覆盖已有 node-runtime）

emit installing（解压）
1. staging = <temp>/ftcs-node-portable/extract-{ts}/
2. 解压 zip 到 staging（见 §6.2）
3. inner = staging/node-v24.18.0-win-x64/
4. 校验 inner/node.exe 存在
5. target = getNodeRuntimeDir()
   - 若存在旧目录：rename 为 node-runtime.bak-{ts} 或 rm -rf（Windows 用 fs.rm recursive）
   - mkdir target
   - 将 inner/* 复制/移动到 target（保留 npm、node_modules）
6. 写 target/.ftcs-node-portable = version 一行
7. writeUserPrefs({ nodePath: path.join(target, 'node.exe') })

emit verifying
execFile(nodePath, ['-v']) → major >= 22，否则 verify-failed

emit done
return ok, method: 'portable' | 'reinstall', needsRestart: false, binaryPath, version, logPath
```

### 6.2 解压实现

**首选（Win10+）**：`tar.exe -xf zipPath -C stagingDir`（系统自带，零依赖）。

**回退**：新增 devDependency **`extract-zip`**（electron 生态已有 transitive），或复制 `officecli-download` 同层薄封装。

**禁止**：PowerShell `Expand-Archive` 写项目脚本文件（AGENTS.md 编码约定）；若 spawn `tar` 失败再试 `extract-zip`。

### 6.3 失败码

| 码 | 含义 |
|----|------|
| `unsupported-platform` | 非 Win（或未支持架构） |
| `busy` | 并发安装 |
| `network` | 三源均下载失败 |
| `checksum` | zip SHA256 不符 |
| `extract-failed` | 解压失败或 zip 内结构不符 |
| `write-failed` | 落盘 / prefs / 标记文件 |
| `verify-failed` | 落盘后 `node -v` 失败或 major &lt; 22 |
| `already-ok` | 已绑定且已就绪（误点安装时可选返回） |
| `unknown` | 其它 |

成功文案示例：

`Node.js 24.18.0 已准备到本应用目录，可立即使用（MCP / npx 将使用此副本）。`

失败文案须含：**Gitee 直链**、官方 dist 页、日志路径；**不得**出现 winget/MSI。

### 6.4 日志

路径：`<userData>/logs/node-install-{iso}.log`（与现网文件名一致，便于用户习惯）。

记录：开始时间、各 URL 尝试、下载字节、SHA256 结果、解压路径、prefs 写入、`node -v` 输出。

---

## 7. 下载模块

新增 **`node-portable-download.ts`**：

- `downloadNodePortableZip(destPath, onProgress)`：顺序尝试三 URL，逻辑 **对齐** `officecli-download.ts`（redirect、timeout、失败删半成品）。  
- `verifyNodePortableZipSha256(filePath)`：对比 `NODE_PORTABLE_INSTALL.sha256Zip`。

**可选重构**：将 `officecli-download.ts` / `msi-download.ts` 抽成通用 `runtime-download.ts`；本故事 **允许** 先复制一份，减少 diff 面。

---

## 8. IPC / 类型

### 8.1 IPC（**通道名不变**）

| 通道 | 说明 |
|------|------|
| `runtime:install-node` | invoke → `installNodePortableRuntime()` |
| `runtime:install-node-progress` | `{ phase, message }` |
| `onboarding:probe-env` | probe Node 逻辑按 §5 |

### 8.2 类型变更（`node-install-types.ts` 或 `node-portable-install-types.ts`）

```ts
export type NodeInstallMethod = 'portable' | 'reinstall' | 'already-ok'
// 移除 'winget' | 'msi'

export type NodeInstallErrorCode =
  | 'unsupported-platform'
  | 'busy'
  | 'network'
  | 'checksum'
  | 'extract-failed'
  | 'write-failed'
  | 'verify-failed'
  | 'already-ok'
  | 'unknown'
// 移除 elevation-denied, winget-*, msiexec-failed, download-failed（合并为 network/checksum）

export type NodeInstallProgressPhase =
  | 'checking'
  | 'downloading'
  | 'verifying'
  | 'installing'
  | 'done'
  | 'failed'
// 移除 'winget'

// 成功分支
needsRestart: false  // 固定 false
```

同步：`electron/ipc/types.ts`、`src/types/onboarding.ts`、`src/types/electron.d.ts`。

---

## 9. 界面（本故事最小改动）

| 位置 | 改动 |
|------|------|
| `OnboardingOverlay.vue` | 按钮文案：**一键准备 Node.js 24.18.0**；成功 **不**展示「请完全退出重启」；`result.needsRestart` 为 false 时直接 `runProbe()` |
| 同上 | **删除** `canUpgradeNode` 按钮分支（或 US-R-03 改为「安装到应用目录」） |
| 同上 | 已绑定 + ok：增加 **重新安装**（`btn-secondary`，对齐 OfficeCLI） |
| 安装结果 | `nodeInstallResult` 成功且 `!needsRestart` → 自动 probe（与 OfficeCLI 一致） |

环境步 subtitle 中「装 Node 后重启」句 **US-R-03** 再改；本故事仅保证行为不依赖重启。

---

## 10. 文件清单

| 文件 | 动作 |
|------|------|
| `electron/runtime/node-portable-install-types.ts` | **新增** 常量与类型 |
| `electron/runtime/node-paths.ts` | **新增** `getNodeRuntimeDir`、`resolveConfiguredNode`、`isNodePortableBound` |
| `electron/runtime/node-portable-download.ts` | **新增** 下载 + SHA256 |
| `electron/runtime/node-portable-extract.ts` | **新增** zip → staging（tar / extract-zip） |
| `electron/runtime/install-node-portable-service.ts` | **新增** 安装编排 |
| `electron/runtime/install-node-service.ts` | **删除或改为 re-export portable**（不再含 winget/MSI） |
| `electron/runtime/resolve-node.ts` | **修改** 绑定分支 + verify 专用路径 |
| `electron/runtime/node-install-types.ts` | **修改** 类型；MSI 常量可迁到 legacy 注释或删除 |
| `electron/runtime/msi-download.ts` | **停用**（无引用后可删，或保留文件待清理 PR） |
| `electron/runtime/winget-node.ts` | **停用** |
| `electron/config/user-prefs.ts` | **增加** `nodePath?: string` |
| `electron/onboarding/env-probe.ts` | **修改** `probeNode` |
| `electron/main.ts` | 注册 portable 安装 |
| `electron/ipc/types.ts` + preload + 渲染类型 | 同步类型 |
| `OnboardingOverlay.vue` | §9 |
| `electron/runtime/node-paths.test.ts` | **新增** 绑定判定、解析顺序 |
| `electron/runtime/node-portable-download.test.ts` | **可选** SHA256 纯函数 |

---

## 11. 与 OfficeCLI 对照

| | OfficeCLI | **Node（本故事）** |
|--|-----------|-------------------|
| 产物 | 单 exe | **zip → 解压目录** |
| 体积 | ~32 MB | zip ~35.5 MB，解压后 ~90 MB 级 |
| 前置 | 无 | 无（安装本身） |
| 系统已有 | 不扫 PATH | **未绑定**时认系统 Node ≥22 |
| 绑定后 | 只认 userData | 只认 userData |
| 成功重启 | 否 | **否** |
| 主下载源 | Gitee → GitHub | **Gitee → 官方 → npmmirror** |

---

## 12. 验收对照（手工）

| # | 步骤 | 期望 |
|---|------|------|
| A1 | 全新 userData，无 Node | Node 行 missing；可点「一键准备」 |
| A2 | Gitee 可达，一键准备 | 进度 → 成功 → **当场** Node 绿；`ftcs-prefs.json` 有 `nodePath`；目录有 `node.exe`、`npx.cmd` |
| A3 | 成功后 **不重启** 应用 | 再点「重新检测」仍绿；MCP 子进程 `node -v` 为 24.18.0（私有路径） |
| A4 | Gitee 失败、官方可达 | 仍安装成功 |
| A5 | 三源皆失败 | `network` + 手册链接 |
| A6 | 改坏 SHA256 常量（开发） | `checksum`，不破坏已有 `node-runtime` |
| A7 | 系统已有 Node 22+，未点一键 | Node **ok**，**无**一键按钮；**不**创建 `node-runtime` |
| A8 | 私有装完后，系统另有 Node 20 | FTCS 只用私有 24.x（spawn PATH 验证） |
| A9 | 绑定后手动删 `node.exe` | probe **missing**；**不**回退系统 Node；可重新安装 |
| A10 | 已绑定 ok → 重新安装 | 覆盖成功，仍绿 |
| A11 | 装完执行 `npx --version`（经 FTCS 触发 MCP） | 使用私有 runtime 下 npm |

---

## 13. 实现顺序建议

1. `node-portable-install-types.ts` + `user-prefs.nodePath` + `node-paths.ts`  
2. `node-portable-download.ts` + `node-portable-extract.ts`  
3. `install-node-portable-service.ts` + 单测（mock fs/下载）  
4. `resolve-node.ts` 绑定分支 + `findAcceptableInstalledNode`  
5. `env-probe.ts` + `main.ts` 接线  
6. `OnboardingOverlay.vue` 文案 / 重启逻辑 / 重新安装  
7. 删除 winget/MSI 安装路径；跑 `npm run test:library` + 手工 A1–A11  

---

## 14. 升版 checklist（运维 + 开发）

1. 从 https://nodejs.org/dist/v{VERSION}/ 下载 `node-v{VERSION}-win-x64.zip`  
2. 核对 `SHASUMS256.txt`  
3. 上传 Gitee `public-resource` 新 Release（如 `nodev{VERSION}`）  
4. 更新 `NODE_PORTABLE_INSTALL`：`version`、`zipAssetName`、`zipInnerDirName`、`sha256Zip`、`expectedZipBytes`、三 URL  
5. 回归 A2/A7/A8  

---

## 15. 修订记录

| 日期 | 说明 |
|------|------|
| 2026-09-06 | 初稿：Gitee 路径 `nodev24.18.0`；绑定/未绑定双模式探测；停用 winget/MSI |
