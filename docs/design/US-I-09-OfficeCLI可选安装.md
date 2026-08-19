# US-I-09 OfficeCLI 可选安装设计

> **用户故事**：[../17-需求-业务效率工具.md](../17-需求-业务效率工具.md) · US-I-09  
> **状态**：编码已落地  
> **范围**：引导 / 设置中把 OfficeCLI 标为**可选依赖**；一键下载钉死版本 exe 到 `userData`；probe；装完当场刷绿  
> **依赖**：现网引导、`env-probe`、Node MSI 下载/校验形态（docs/09）、OpenCode 一键安装 IPC/进度形态（docs/10）；无 US-I 硬依赖  
> **预研**：[../research/OfficeCLI抽取方案.md](../research/OfficeCLI抽取方案.md)  
> **不做**：录入生成弹框（I-10）；docx/xlsx/pptx 侧车抽取（I-11）；pdf；打进主包；执行 `officecli install`；监听系统环境变量  
> **文档位置**：`docs/design/`

---

## 0. 相对现网

| 现网 | **本期** |
|------|----------|
| 引导依赖：Node / OpenCode / Chrome；`probe.ok` = 三项全绿 | 增加 **OfficeCLI（可选）**；`probe.ok` **只看必选项**，缺 OfficeCLI 仍可「继续」且文案不施压 |
| OpenCode：npm 装到 `userData/opencode-runtime`，成功要重启 | OfficeCLI：下 Release **裸 exe** 到 `userData/officecli-runtime`，成功 **不强制重启**，当场 probe 绿 |
| Node：官方 MSI + npmmirror 兜底 + SHA256 | OfficeCLI：**Gitee 优先 + GitHub 兜底** + 同一 SHA256（可复用/抽离现有下载工具） |
| prefs 有 `opencodePath` | 增加 `officecliPath` |
| 设置页 hint 只提 Node / OpenCode / Chrome | hint 补一句可选 OfficeCLI |

本故事结束后，主进程已能 `resolveConfiguredOfficeCli()`；**I-11 再**在 bootstrap 里 spawn。本故事不改生成画像链路。

---

## 1. 已确认选型

| 项 | 决定 |
|----|------|
| **Q1 安装物** | GitHub/Gitee 上的 **`officecli-win-x64.exe` 单文件**（即 CLI 本体，非 Setup）。落盘后命名为 **`officecli.exe`** |
| **Q2 落盘** | `<userData>/officecli-runtime/officecli.exe`；prefs 写绝对路径 `officecliPath` |
| **Q3 下载源** | **先 Gitee 镜像，失败再 GitHub**；校验用**同一**钉死 SHA256 |
| **Q4 版本** | 钉死 **v1.0.144**（与预研一致；升版随发版改常量 + 同步 Gitee 资产） |
| **Q5 可选语义** | `EnvProbeItem` 增加 `optional?: boolean`；OfficeCLI `optional: true`。`EnvProbeResult.ok` = **非 optional** 项全部 `status === 'ok'` |
| **Q6 重启** | **`needsRestart: false`**。安装 IPC 返回后 UI 立刻 `runProbe()` |
| **Q7 解析顺序** | `FTCS_OFFICECLI_PATH`（文件存在）→ `prefs.officecliPath` → `<userData>/officecli-runtime/officecli.exe`。**不**扫 PATH 冒充就绪（避免误用全局旧版）；开发兜底只用环境变量 |
| **Q8 平台** | 首发仅 **win32 + x64**。其它：probe `missing` + detail 说明；一键按钮禁用 |
| **Q9 重装** | 未就绪：一键安装。已就绪：提供次要「重新安装」（覆盖同路径，再校验），满足故事「可重装」 |
| **Q10 与 Node/OpenCode 互斥** | 任一 runtime 安装进行中，禁用其它一键按钮（沿用现网互斥习惯，并纳入 OfficeCLI） |
| **Q11 手动说明** | `installUrl` / 失败 `manualUrl` 指向产品文档安装页（`getDocsInstallUrl()`）；文档后续补 OfficeCLI 段。Gitee/GitHub 直链也可在失败文案中写出 |
| **Q12 不跑** | **禁止** `officecli install` / 裸跑触发自助装 PATH / skill |

### 1.1 钉死常量（编码用）

```ts
export const OFFICECLI_INSTALL = {
  version: '1.0.144',
  prefixDirName: 'officecli-runtime',
  /** 落盘文件名 */
  binaryFileName: 'officecli.exe',
  /** Release 资产名（下载用） */
  assetWinX64: 'officecli-win-x64.exe',
  /** 来自上游 v1.0.144 SHA256SUMS */
  sha256WinX64:
    'e780cc6a5385f84b4d54d71b0c179904ed534125ec33fe39b1a8711fa80e387e',
  /**
   * 团队维护镜像（须与钉死 SHA256 为同一文件内容，对应上游 v1.0.144）。
   * Release：https://gitee.com/mfs1998_admin/public-resource
   */
  urlGitee:
    'https://gitee.com/mfs1998_admin/public-resource/releases/download/office-cli/officecli-win-x64.exe',
  urlGitHub:
    'https://github.com/iOfficeAI/OfficeCLI/releases/download/v1.0.144/officecli-win-x64.exe',
  downloadTimeoutMs: 120_000,
  installTimeoutMs: 10 * 60 * 1000,
} as const
```

> **运维**：Gitee 主源已定为  
> `https://gitee.com/mfs1998_admin/public-resource/releases/download/office-cli/officecli-win-x64.exe`  
> 升钉死版本时更换该 Release 资产，并更新代码内 `sha256WinX64`（须与上游 v1.0.144 SHA256SUMS 为同一内容）。

---

## 2. 目标与非目标

### 2.1 目标

1. 引导环境步出现 **OfficeCLI（可选）**，说明只服务 Word/Excel/PPT。  
2. Windows x64 可一键装到应用目录，Gitee→GitHub，SHA 不过则失败。  
3. 装完当场绿；不装也能走完引导 / 使用非 Office 生成（I-08 现网）。  
4. 设置可重新打开引导并安装 / 重装。  
5. 对外提供稳定的 `resolveConfiguredOfficeCli()`，供 I-10 / I-11 复用。

### 2.2 非目标

| 不做 | 归属 |
|------|------|
| 生成画像时「安装 / 跳过 / 取消」弹框 | US-I-10 |
| 侧车抽文本、改 bootstrap / Skill | US-I-11 |
| pdf / `.doc` | 另故事 |
| 主包 extraResources 内嵌 exe | 明确不做 |
| macOS / Linux / Win ARM 一键装 | 非首发；probe 标明即可 |
| 自动监听系统 env 变更 | 预研已否决 |

---

## 3. 界面

### 3.1 引导 · 环境步文案

`OnboardingOverlay` 环境步 subtitle 在现有 Node/OpenCode 说明后**补半句**（勿整段重写）：

> …另有 **OfficeCLI（可选）**：仅当资料含 Word / Excel / PPT 时需要，可稍后安装。

依赖清单多一行，由 `probe.items` 驱动（与 Node/OpenCode 同结构）：

| UI | 内容 |
|----|------|
| 徽章 | 就绪 / 缺失 / 异常（同现网 `statusLabel`） |
| 标题 | `OfficeCLI（可选）`（`label` 已含「可选」） |
| 详情 | probe `detail`（版本·路径·source，或缺失原因） |
| 主按钮 | 未就绪且 win32 x64：`一键安装 OfficeCLI 1.0.144` |
| 次按钮 | 已就绪：`重新安装`（btn-secondary） |
| 外链 | `打开安装说明`（`installUrl`） |

安装中：进度文案来自 `runtime:install-officecli-progress`（如下载百分比、校验中、落盘中）。

成功：展示结果短文案（**不要**「请重启」）；并自动 `runProbe()`。  
失败：`error` + 结果里的 `manualUrl` / 日志路径。

### 3.2 `probe.ok` 与「继续」按钮

- `envOk` 仍绑定 `probe.ok`。  
- 因 OfficeCLI 为 optional，**仅缺 OfficeCLI 时 `envOk` 可为 true**（若 Node/OpenCode/Chrome 已绿）。  
- 「继续（仍有缺失）」仅在缺**必选**依赖时出现——与现网一致，不被可选行拖累。

### 3.3 设置页

「首次引导」hint 增补：可检测并一键安装可选 OfficeCLI（装完无需重启）。入口仍是「打开环境与配置引导」，**不**另做设置页独立安装条（减少分叉；I-10 会再暴露安装能力）。

---

## 4. 行为细则

### 4.1 探测 `probeOfficeCli`

```text
resolveConfiguredOfficeCli()
  → 无路径 → status: missing
       detail: 未安装。可选：用于 Word/Excel/PPT 抽文本后再生成画像。
  → 有路径，execFile(exe, ['--version']) 成功
       → status: ok；detail: `{version} · {exe}（{source}）`
  → 有路径但 --version 失败
       → status: error；detail: 文件存在但无法运行（杀软？）；可重新安装
```

非 win32 或非 x64：

- `status: missing`（或 `error`）  
- detail：`当前仅支持 Windows 64 位一键安装`  
- 无一键按钮

### 4.2 安装 `installOfficeCliRuntime`

```text
若 busy → busy
若非 win32 x64 → unsupported-platform
emit checking
下载顺序：urlGitee → urlGitHub
  临时文件：userData/tmp/officecli-download-{ts}.exe
  进度：downloading（字节 / 百分比）
SHA256 ≠ 钉死值 → checksum（删临时文件）
mkdir officecli-runtime
写/覆盖 officecli.exe（可先写 .tmp 再 rename）
writeUserPrefs({ officecliPath: abs })
可选：exec --version 作 verifying
emit done
返回 ok + needsRestart: false + binaryPath + version
```

| 失败码 | 含义 |
|--------|------|
| `unsupported-platform` | 非 Win x64 |
| `network` | 两源均下载失败 |
| `checksum` | SHA 不符 |
| `write-failed` | 落盘 / rename / prefs |
| `verify-failed` | 落盘后 `--version` 失败（可能杀软） |
| `busy` | 已有安装在跑 |
| `unknown` | 其它 |

成功文案示例：`OfficeCLI 1.0.144 已安装到本应用目录，可立即使用（生成 Word/Excel/PPT 资料时需要）。`

日志：`userData/logs/officecli-install-*.log`（对齐 OpenCode 习惯）。

### 4.3 解析 `resolveConfiguredOfficeCli`

供 probe、I-10、I-11：

```ts
type OfficeCliResolution = { exe: string; source: string } | null
// source: 'FTCS_OFFICECLI_PATH' | 'prefs.officecliPath' | 'userData/officecli-runtime'
```

仅 `fs.existsSync` 为文件时返回；**不**把目录误当 exe。

### 4.4 下载实现

优先：**抽离** Node 的 `msi-download.ts` 为通用 `downloadBinary(urls[], dest, onProgress)` + `verifySha256(path, expected)`，Node 与 OfficeCLI 共用。若改动面大，可本故事先复制一份 `officecli-download.ts`，注明后续合并——**详细设计允许两种，编码选改动更小的**。

---

## 5. IPC / 类型 / 文件清单

### 5.1 IPC

| 通道 | 方向 | 载荷 |
|------|------|------|
| `runtime:install-officecli` | invoke | `() => OfficeCliInstallResult` |
| `runtime:install-officecli-progress` | event | `{ phase, message }` |
| `onboarding:probe-env` | 现有 | `EnvProbeResult` 含新 item |

### 5.2 类型（主进程 + 渲染镜像）

```ts
// EnvProbeItem 扩展
id: 'node' | 'opencode' | 'chrome' | 'officecli'
optional?: boolean

// 结果
needsRestart: false  // 成功分支固定 false，便于 UI 与 OpenCode 分支区分
```

### 5.3 建议新增 / 修改文件

| 文件 | 动作 |
|------|------|
| `electron/runtime/officecli-install-types.ts` | 新增常量与结果类型 |
| `electron/runtime/officecli-paths.ts` | 新增 prefix + resolve |
| `electron/runtime/install-officecli-service.ts` | 新增安装编排 |
| `electron/runtime/officecli-download.ts` 或扩 `msi-download.ts` | 下载 + SHA |
| `electron/onboarding/env-probe.ts` | `probeOfficeCli`；`ok` 忽略 optional |
| `electron/config/user-prefs.ts` | `officecliPath?: string` |
| `electron/ipc/types.ts` + `main.ts` + preload | IPC 注册 |
| `src/types/onboarding.ts` + `electron.d.ts` | 类型同步 |
| `OnboardingOverlay.vue` | 行按钮、进度、成功不提示重启、互斥 |
| `SettingsView.vue` | hint 一句 |
| 产品文档 `docs/install`（网站） | 可另 PR；失败链到现有 install URL 即可先上 |

单测（可选但建议）：`officecli-paths` 解析顺序；SHA 校验纯函数；`probe.ok` 在缺 optional 时仍为 true（若其它为 ok）。

---

## 6. 与 OpenCode / Node 对照（实现时勿抄错）

| | Node | OpenCode | **OfficeCLI（本故事）** |
|--|------|----------|-------------------------|
| 产物 | MSI → 系统安装 | npm prefix 下的 bin | **单文件 exe** |
| 前置 | — | 要 Node ≥22 | **无** |
| 成功后 | 要重启 | 要重启 | **不要重启** |
| 是否可选 | 否（主路径） | 否（主路径） | **是** |
| 默认下载 | 官方→镜像 | npm 官方→npmmirror | **Gitee→GitHub** |

---

## 7. 验收对照（手工）

| # | 步骤 | 期望 |
|---|------|------|
| A1 | 全新 userData，开引导环境步 | 见 OfficeCLI（可选）；缺失；可点一键（Win x64） |
| A2 | 不装 OfficeCLI，Node/OpenCode/Chrome 皆绿 | `继续` 为就绪态（或至少不被 Office 拦住）；可完成引导 |
| A3 | 一键安装（Gitee 可达） | 进度可见 → 成功 → 徽章就绪；**无**重启文案；prefs 有路径；目录有 `officecli.exe` |
| A4 | 断网或 Gitee 挂、GitHub 通 | 仍能装成功（走 fallback） |
| A5 | 两源皆失败 | `network` + 手册链接；目录无半截 exe（或临时已清） |
| A6 | 故意改坏 SHA 常量（开发验证） | `checksum`，不覆盖旧好文件（若已有） |
| A7 | 装成功后点「重新检测」 | 仍绿 |
| A8 | 设置打开引导 → 已就绪点「重新安装」 | 可覆盖安装并仍绿 |
| A9 | 设置 `FTCS_OFFICECLI_PATH` 指向手工拷贝的 exe 后探测 | 显示就绪，source 为环境变量（可先删 runtime 目录验证优先级） |
| A10 | 非 Win 或非 x64（若有测试机） | 无一键或失败码清晰 |

---

## 8. 实现顺序建议

1. types + prefs + `officecli-paths` + 下载/SHA  
2. `install-officecli-service` + IPC  
3. `env-probe`（optional + ok 计算）  
4. OnboardingOverlay + Settings hint  
5. Gitee 资产已就绪（见常量 `urlGitee`）后联调 A3/A4  
