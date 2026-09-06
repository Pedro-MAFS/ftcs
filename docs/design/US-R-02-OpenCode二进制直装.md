# US-R-02 OpenCode 二进制直装设计

> **用户故事**：[../19-需求-简化运行环境安装.md](../19-需求-简化运行环境安装.md) · US-R-02  
> **状态**：编码已落地  
> **范围**：Windows x64 下一键下载官方 OpenCode CLI zip → 校验 → 落盘 `userData/opencode-runtime/opencode.exe`；**停用** npm `install`；扩展绑定 / 探测  
> **依赖**：现网 `install-opencode-service.ts`（将被替换）、[US-R-01-私有Node运行时.md](./US-R-01-私有Node运行时.md)（运行期 MCP 仍要 Node，**安装 OpenCode 本身不依赖 npm**）、OfficeCLI / Node portable 下载形态  
> **不做**：OpenCode 大版本升级策略（随发版 bump）；Desktop GUI 安装包；引导全文案（US-R-03）；macOS/Linux  
> **文档位置**：`docs/design/`

---

## 0. 相对现网

| 现网 | **US-R-02** |
|------|-------------|
| 硬门禁 **need-node** → `npm install opencode-ai@1.18.4 --prefix` | **Gitee → GitHub** 下 zip；**无 npm、无 Node 前置** |
| 落盘 `userData/opencode-runtime/node_modules/...` | **扁平** `userData/opencode-runtime/opencode.exe` |
| 装完 **needsRestart: true** | **needsRestart: false**，当场 probe 绿 |
| 解析含 npm 前缀树 | **已绑定**仅 flat + prefs；**未绑定**可认 PATH 上 `opencode` |
| 引导「需先就绪 Node 再装 OpenCode」 | **安装按钮不再**因 Node 未就绪而禁用（运行 Agent 仍要 Node） |
| 失败暗示 npm / 全局安装 | 失败 **仅**重试 zip / 手动下同一资产 |

---

## 1. 已确认选型

| 项 | 决定 |
|----|------|
| **Q1 安装物** | 官方 GitHub Release **`opencode-windows-x64.zip`**（v1.18.4）；zip 根目录 **仅 `opencode.exe`**（Bun standalone，已 spike 验证） |
| **Q2 落盘** | `<userData>/opencode-runtime/opencode.exe`；`prefs.opencodePath` = 上述绝对路径 |
| **Q3 下载源** | **Gitee 团队镜像 → GitHub Release**；两源 **同一 zip**，钉死 **zip 级 SHA256** |
| **Q4 版本** | **1.18.4**（与桌面 `@opencode-ai/sdk` ^1.18.x 同主版本） |
| **Q5 私有绑定** | 用户 **成功完成** 本故事一键准备（写入 `prefs.opencodePath` 且路径位于 `userData/opencode-runtime/opencode.exe`，或写入标记文件）→ **永久绑定**（[需求 R10](../19-需求-简化运行环境安装.md)） |
| **Q6 系统已有 OpenCode** | **未绑定**且 PATH 上 `opencode` 可运行 → probe **`ok`**，**不强制**下载 |
| **Q7 安装与 Node** | **安装阶段不需要 Node/npm**；**运行期** `opencode serve` 用 standalone exe；**MCP / npx** 仍依赖 US-R-01 / 系统 Node |
| **Q8 重启** | 成功 **`needsRestart: false`**；UI 安装 IPC 返回后 **`runProbe()`** |
| **Q9 平台** | 首发 **win32 + x64**；其它平台 probe 说明 + 禁用一键 |
| **Q10 重装** | 已绑定且 probe ok：次要 **「重新准备」**（`forceReinstall: true`，覆盖 exe，可选清理旧 `node_modules` 遗留） |
| **Q11 互斥** | 与 Node / OfficeCLI 安装互斥 |
| **Q12 失败** | 不回退 npm；文案含 Gitee/GitHub 直链 + `getDocsInstallUrl()` |
| **Q13 旧 npm 前缀** | **不再扫描** `node_modules/opencode-ai`；若仅有旧 npm 树且无 flat exe → **missing**，引导一键准备 |

### 1.1 钉死常量（编码用）

```ts
/** 见 opencode-binary-install-types.ts */
export const OPENCODE_BINARY_INSTALL = {
  version: '1.18.4',
  prefixDirName: 'opencode-runtime',
  binaryFileName: 'opencode.exe',
  zipAssetName: 'opencode-windows-x64.zip',
  /** zip 根目录即 exe，无内层目录 */
  zipEntryExe: 'opencode.exe',
  markerFileName: '.ftcs-opencode-portable',
  /**
   * GitHub Release v1.18.4 digest
   * Gitee 镜像须与此 hash 一致
   */
  sha256Zip:
    '814dae5724dfa396a43b6408703d0929625483e2fac135623f10f0fa8db04a96',
  expectedZipBytes: 59_388_435,
  urlGitee:
    'https://gitee.com/mfs1998_admin/public-resource/releases/download/opencodev1.18.4/opencode-windows-x64.zip',
  urlGitHub:
    'https://github.com/anomalyco/opencode/releases/download/v1.18.4/opencode-windows-x64.zip',
  downloadTimeoutMs: 180_000,
  installTimeoutMs: 15 * 60 * 1000,
  get manualDocsUrl(): string {
    return getDocsInstallUrl()
  },
} as const
```

> **运维**：Gitee Release 标签 `opencodev1.18.4`，资产 `opencode-windows-x64.zip`。升版时同步镜像并更新常量。

### 1.2 Spike 结论（US-R-00 · OpenCode 部分）

| 项 | 结论 |
|----|------|
| 官方资产 | `opencode-windows-x64.zip` @ [v1.18.4](https://github.com/anomalyco/opencode/releases/tag/v1.18.4) |
| zip 结构 | **根目录单文件** `opencode.exe`（非 Desktop 安装包 `opencode-desktop-win-x64.exe`） |
| 体积 | 59,388,435 字节（约 56.6 MB） |
| CLI 自包含 | **是**（Bun standalone）；`opencode serve` **不依赖**外部 Node |
| 与 npm 包关系 | `opencode-ai@1.18.4` optional 依赖 `opencode-windows-x64@1.18.4` 为同一二进制；**本方案不跑 npm** |

---

## 2. 目标与非目标

### 2.1 目标

1. 引导中 OpenCode **缺失**时可一键下载到应用目录，**不被 npm 卡住**。  
2. 装完 **当场** probe 变绿；`ensureOpenCodeOnPath()` 注入 flat exe。  
3. **PATH 上已有 opencode** 的用户 **不必下载**。  
4. **绑定后** 只认 `userData/opencode-runtime/opencode.exe`，**不**回退 npm 前缀 / PATH。  
5. 提供 **`isOpenCodePortableBound()`** / 更新 **`resolveConfiguredOpenCodeBin()`** 供 probe、runtime 复用。

### 2.2 非目标

| 不做 | 归属 |
|------|------|
| 私有 Node zip | US-R-01（已落地） |
| 引导 subtitle、官网文档大改 | US-R-03 |
| npm / 全局安装并列或失败回退 | 需求 R9/R11 |
| 自动清理用户全局 opencode | — |
| macOS / Linux CLI zip | 后续 |

---

## 3. 目录与 prefs

```text
<userData>/
  opencode-runtime/
    opencode.exe              ← prefs.opencodePath
    .ftcs-opencode-portable   ← 一行版本号 "1.18.4"
    node_modules/ ...         ← 旧 npm 装遗留；新装后可删，解析不再读
  ftcs-prefs.json
    opencodePath: "...\\opencode-runtime\\opencode.exe"
  logs/
    opencode-install-{iso}.log
```

**绑定判定** `isOpenCodePortableBound()`（满足任一即为 true）：

1. `prefs.opencodePath` 已设置，且路径等于 `getOpenCodeRuntimeBinaryPath()`（或在 `getOpenCodeRuntimeDir()` 下）；或  
2. `getOpenCodeRuntimeDir()/opencode.exe` 存在，且同目录有 **`.ftcs-opencode-portable`**。

> 仅有旧 npm `--prefix` 树、**无** flat exe / 标记 → **未绑定**；若 PATH 也无 opencode → **missing**。

---

## 4. 解析与 PATH 注入

### 4.1 `resolveConfiguredOpenCodeBin()`（改 `opencode-paths.ts`）

**私有链**（绑定后 **仅**此链 + 装完验证）：

```text
FTCS_OPENCODE_PATH（文件存在）
  → prefs.opencodePath（文件存在）
  → <userData>/opencode-runtime/opencode.exe（文件存在）
  → null
```

**删除** `resolveOpenCodeBinFromPrefix()` 在 **默认解析** 中的调用（函数可保留一版供迁移工具或删除 dead code）。

### 4.2 探测 `probeOpenCode()`（改 `env-probe.ts`）

```text
if isOpenCodePortableBound():
  configured = resolveConfiguredOpenCodeBin()
  无 exe → missing（应用内 OpenCode 未就绪或已删除，请重新准备）
  有 exe，--version 失败 → error
  否则 → ok（detail 含版本·路径·source）
else:
  configured = resolveConfiguredOpenCodeBin()   // prefs / env / flat，不含 npm 树
  若 configured → ok（同现网）
  否则 findOnPath('opencode')
  无 → missing（文案：可一键准备到应用目录；不提 npm）
  有 → ok
```

### 4.3 `ensureOpenCodeOnPath()`（改 `opencode/resolver.ts` 或等价）

- **已绑定**：仅 `resolveConfiguredOpenCodeBin()`；prepend `dirname(opencode.exe)` 到 PATH。  
- **未绑定**：configured 优先，否则 PATH 解析结果（与现网一致）。

### 4.4 运行期 Node

- OpenCode **安装 IPC** 不调用 `resolveBestNode` / `need-node`。  
- 启动 `OpenCodeRuntime` / MCP 前仍 `ensurePreferredNodeOnPath()`（US-R-01）。

---

## 5. 安装编排 `installOpenCodeBinaryRuntime()`

实现文件：**`install-opencode-binary-service.ts`**；`main.ts` 改调此函数；**删除** `install-opencode-service.ts` 中 npm 全路径（或整文件替换为 re-export）。

### 5.1 流程

```text
busy? → busy
非 win32 x64 → unsupported-platform
emit checking

若 !forceReinstall && isOpenCodePortableBound() && resolveConfiguredOpenCodeBin() 且 --version 可读
  → already-ok（needsRestart: false）

emit downloading
urls = [urlGitee, urlGitHub]
下载到 <temp>/ftcs-opencode-binary/opencode-download-{ts}.zip

emit verifying
SHA256(zip) !== sha256Zip → checksum（删临时 zip，不覆盖已有 exe）

emit installing
1. staging = <temp>/ftcs-opencode-binary/extract-{ts}/
2. tar.exe -xf zip → staging（或复用 node-portable-extract 薄封装）
3. 校验 staging/opencode.exe 存在
4. targetDir = getOpenCodeRuntimeDir()
   destExe = getOpenCodeRuntimeBinaryPath()
   destTmp = destExe + '.tmp'
   mkdir targetDir
   copy staging/opencode.exe → destTmp → rename destExe
5. 写 targetDir/.ftcs-opencode-portable = version
6. writeUserPrefs({ opencodePath: destExe })
7. （可选）异步或同步 rm targetDir/node_modules 若存在 — 减少占盘；失败不挡成功

emit verifying
execFile(destExe, ['--version'])

emit done
return ok, method: 'portable' | 'reinstall' | 'already-ok', needsRestart: false, binaryPath, version
```

> 与 Node 不同：zip **无内层目录**，不必 `copyDirContents` 展平；与 OfficeCLI 不同：需 **先解压 zip** 再取 exe。

### 5.2 失败码

| 码 | 含义 |
|----|------|
| `unsupported-platform` | 非 Win x64 |
| `busy` | 并发安装 |
| `network` | Gitee + GitHub 均失败 |
| `checksum` | SHA256 不符 |
| `extract-failed` | 解压失败或 zip 内无 `opencode.exe` |
| `write-failed` | 落盘 / prefs / 标记 |
| `verify-failed` | 落盘后 `--version` 失败 |
| `already-ok` | 已绑定且就绪（误点） |
| `unknown` | 其它 |

**移除**：`need-node`、`npm-failed`。

成功文案示例：

`OpenCode CLI 1.18.4 已准备到本应用目录，可立即使用。`

### 5.3 日志

`<userData>/logs/opencode-install-{iso}.log`（与现网文件名一致）。

---

## 6. 下载模块

新增 **`opencode-binary-download.ts`**：

- `downloadOpenCodeBinaryZip(destPath, onProgress)`：Gitee → GitHub。  
- `verifyOpenCodeBinaryZipSha256(filePath)`。

逻辑 **对齐** `node-portable-download.ts` / `officecli-download.ts`（redirect、timeout、失败删半成品）。

解压可 **复用** `node-portable-extract.ts` 中 `extractZipWithTar()`（抽到 `runtime-zip-extract.ts` 可选；本故事允许复制 tar 调用 10 行）。

---

## 7. IPC / 类型

### 7.1 IPC（**通道名不变**）

| 通道 | 说明 |
|------|------|
| `runtime:install-opencode` | invoke `(options?: { forceReinstall?: boolean })` |
| `runtime:install-opencode-progress` | `{ phase, message }` |
| `onboarding:probe-env` | §4.2 |

### 7.2 类型变更（`opencode-binary-install-types.ts` 或扩展 `opencode-install-types.ts`）

```ts
export type OpenCodeInstallMethod = 'portable' | 'reinstall' | 'already-ok'
// 移除 'npm-prefix'

export type OpenCodeInstallErrorCode =
  | 'unsupported-platform'
  | 'busy'
  | 'network'
  | 'checksum'
  | 'extract-failed'
  | 'write-failed'
  | 'verify-failed'
  | 'already-ok'
  | 'unknown'
// 移除 need-node, npm-failed

export type OpenCodeInstallProgressPhase =
  | 'checking'
  | 'downloading'
  | 'verifying'
  | 'installing'
  | 'done'
  | 'failed'

// 成功分支
needsRestart: false
```

同步：`electron/ipc/types.ts`、`src/types/onboarding.ts`、`src/types/electron.d.ts`、preload。

---

## 8. 界面（本故事最小改动）

| 位置 | 改动 |
|------|------|
| `OnboardingOverlay.vue` | 按钮：**一键准备 OpenCode 1.18.4** |
| 同上 | **移除** `nodeReady` 对 OpenCode 按钮的 disabled / title（安装不依赖 Node） |
| 同上 | 成功 **不**展示「退出应用」；`runProbe()`（对齐 Node US-R-01 / OfficeCLI） |
| 同上 | 已绑定 + ok：**重新准备**（`forceReinstall: true`） |
| 同上 | OpenCode 成功块改为与 Node 相同纯文案（去掉 restart 区） |
| 失败外链 | 「查看安装说明」，**不提** npm |

subtitle 中「先 Node 再 OpenCode / 重启」句 **US-R-03** 统一改；本故事仅保证 OpenCode 安装链路不依赖重启。

---

## 9. 文件清单

| 文件 | 动作 |
|------|------|
| `electron/runtime/opencode-binary-install-types.ts` | **新增** 常量与类型 |
| `electron/runtime/opencode-paths.ts` | **修改** flat exe、`isOpenCodePortableBound`、去掉 npm 树默认解析 |
| `electron/runtime/opencode-path-utils.ts` | **可选** `isOpenCodePathUnderRuntimeDir`（单测用，对齐 node-path-utils） |
| `electron/runtime/opencode-binary-download.ts` | **新增** |
| `electron/runtime/opencode-binary-extract.ts` | **新增** zip → 取 exe（或复用 node extract） |
| `electron/runtime/install-opencode-binary-service.ts` | **新增** |
| `electron/runtime/install-opencode-service.ts` | **删除** 或 re-export binary |
| `electron/runtime/opencode-install-types.ts` | **改为** re-export 或删除（类型迁到 binary-types） |
| `electron/onboarding/env-probe.ts` | **修改** `probeOpenCode` |
| `electron/opencode/resolver.ts` | **修改** 绑定分支（若有 `ensureOpenCodeOnPath`） |
| `electron/main.ts` | 接线 + `forceReinstall` |
| `electron/ipc/types.ts` + preload + 渲染类型 | 同步 |
| `OnboardingOverlay.vue` | §8 |
| `electron/runtime/opencode-binary-download.test.ts` | **新增** SHA256 钉死 |
| `electron/runtime/opencode-path-utils.test.ts` | **可选** |

---

## 10. 与 US-R-01 / OfficeCLI 对照

| | OfficeCLI | Node US-R-01 | **OpenCode US-R-02** |
|--|-----------|--------------|----------------------|
| 产物 | 单 exe 直下 | zip → 目录 | **zip → 单 exe** |
| 体积 | ~32 MB | zip ~35.5 MB | zip ~56.6 MB |
| 安装要 Node | 否 | 否 | **否** |
| 运行要 Node | 否 | MCP 要 | **MCP 要；CLI serve 不要** |
| 系统已有 | 不扫 PATH | 未绑定可认系统 Node | **未绑定可认 PATH opencode** |
| 主下载源 | Gitee → GitHub | Gitee → 官方 → npmmirror | **Gitee → GitHub** |
| zip 内结构 | — | 内层目录展平 | **根目录即 exe** |

---

## 11. 验收对照（手工）

| # | 步骤 | 期望 |
|---|------|------|
| B1 | 无 OpenCode | missing；可点「一键准备」；**不要求** Node 已绿才能点 |
| B2 | Gitee 可达，一键准备 | 进度 → 成功 → **当场** OpenCode 绿；prefs + `opencode.exe` |
| B3 | 成功后不重启 | 再探测仍绿；可启动 Agent（仍需 Node 就绪） |
| B4 | Gitee 失败、GitHub 可达 | 仍成功 |
| B5 | 两源皆失败 | `network` |
| B6 | SHA 改坏（开发） | `checksum`，不覆盖旧 exe |
| B7 | PATH 已有 opencode，未绑定 | ok，无按钮；不创建 flat exe |
| B8 | 绑定后删 `opencode.exe` | missing；**不**回退 PATH；可重新准备 |
| B9 | 仅旧 npm `node_modules` 树 | **missing**（不再解析 npm 路径） |
| B10 | 绑定 ok → 重新准备 | 覆盖成功 |
| B11 | `opencode serve` smoke | SDK 能连上（与 1.18.4 联调） |

---

## 12. 实现顺序建议

1. `opencode-binary-install-types.ts` + `opencode-paths.ts`（绑定 + 解析）  
2. `opencode-binary-download.ts` + extract  
3. `install-opencode-binary-service.ts`  
4. `env-probe.ts` + `resolver.ts` + `main.ts`  
5. `OnboardingOverlay.vue`  
6. 删除 npm install 代码；`npm run test:library` + 手工 B1–B11  

---

## 13. 升版 checklist

1. 从 [anomalyco/opencode Releases](https://github.com/anomalyco/opencode/releases) 下载新 `opencode-windows-x64.zip`  
2. 记录 GitHub `digest` / 自算 SHA256  
3. 上传 Gitee `public-resource` 新 Release  
4. 更新 `OPENCODE_BINARY_INSTALL` 与 `@opencode-ai/sdk` 主版本对齐  
5. 回归 B2/B7/B11  

---

## 14. 修订记录

| 日期 | 说明 |
|------|------|
| 2026-09-06 | 初稿：Gitee `opencodev1.18.4`；zip 根目录单 exe；停用 npm；对齐 US-R-01 绑定模型 |
