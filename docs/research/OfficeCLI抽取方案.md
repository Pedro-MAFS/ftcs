# 技术预研：OfficeCLI 抽取方案

> **对象**：[iOfficeAI/OfficeCLI](https://github.com/iOfficeAI/OfficeCLI)（命令 `officecli`）  
> **状态**：预研（未编码、本机未实测）  
> **分发取向（已倾向）**：与 OpenCode 相同——**不打进主安装包**，走**首次引导 / 设置里一键安装**到 `userData`（对齐 [docs/10-OpenCode一键安装方案.md](../10-OpenCode一键安装方案.md)）  
> **对照**：总预研 [Office文本抽取-docx-xlsx-pptx.md](./Office文本抽取-docx-xlsx-pptx.md) 中的「分库 mammoth + SheetJS + pptx」方案  
> **不要混淆**：npm 上另有 [officecli/officecli](https://github.com/officecli/officecli)（偏「提示词生成文档」），**不是**本方案。

---

## 1. 结论（先看这段）

| 问题 | 结论 |
|------|------|
| 能不能覆盖三种格式 | **能。** `officecli view <file> text` 覆盖 `.docx` / `.xlsx` / `.pptx`。 |
| 要不要装本机 Office | **不要。** 自包含二进制。 |
| 许可证 | **Apache 2.0**。 |
| Windows 体积 | `officecli-win-x64.exe` 约 **32 MB**（v1.0.144）。 |
| **怎么交给用户** | 主包不内嵌；引导标「可选」一键安装；录入生成时若勾了 Office 且未装 → **安装 / 跳过 / 取消**。 |  
| 装完要重启吗 | **不要**；写 prefs + 查文件后当场刷绿（与 OpenCode 不同）。 |  
| 自动监测 env？ | **不监听系统环境变量**；以 prefs/落盘文件 + 打开弹框/点检测时的 probe 为准。 |
| 和现网架构 | 抽取仍在主进程 bootstrap；解析器路径来自 prefs / userData，不靠用户 PATH。 |
| 相对分库 | 集成简单；代价是「多一个可选依赖 + 首次要联网装」。主包保持轻量。 |
| 预研建议 | **抽取引擎优先 OfficeCLI；分发按 OpenCode 引导安装拍板。** 先做抽取质量 spike，再写安装详细设计。 |

本机 PATH 当前无 `officecli`，抽文本行为来自官方文档，**绿森样例尚未实测**。

---

## 2. 它是什么

面向 AI Agent 的 Office CLI：读/改/建 docx、xlsx、pptx。画像链路**只用读文本**。

| 项 | 事实 |
|----|------|
| 仓库 | https://github.com/iOfficeAI/OfficeCLI |
| 协议 | Apache 2.0 |
| 形态 | 单文件 native 二进制（内嵌 .NET） |
| 上游安装渠道 | GitHub Release / install.ps1 / Scoop / npm `@officecli/officecli` |
| Win 资产 | `officecli-win-x64.exe` ≈ 32MB |
| 与 Node | **运行抽取不依赖 Node**（与 OpenCode 不同）；可用 `spawn` 或 `@officecli/sdk` |

第一刀明确只用 `view text`，不做编辑/渲染/MCP。

---

## 3. 分发：对齐 OpenCode 的引导安装（产品倾向）

### 3.1 与 OpenCode 对照

| 项 | OpenCode（现网 docs/10） | OfficeCLI（本方案） |
|----|--------------------------|---------------------|
| 主安装包 | **不内嵌** | **不内嵌**（同） |
| 安装入口 | 首次引导依赖清单 + 设置可再进 | **同**：引导依赖行 + 设置依赖清单 |
| 落盘位置 | `<userData>/opencode-runtime/` | `<userData>/officecli-runtime/`（建议名） |
| 安装方式 | 合格 Node 执行 `npm install` | **下载钉死版本的 GitHub Release exe**（校验 SHA256） |
| 硬前置 | 必须先有 Node ≥22 | **无 Node 前置**；要有网络（或离线包后续再说） |
| 版本钉死 | `opencode-ai@1.18.4` | 如 `officecli v1.0.144` + SHA256 |
| 成功后 | 提示重启再「重新检测」 | **建议同**：写 prefs 路径后提示重启或当场 `probe` 刷绿（详细设计定） |
| 探测 | `env-probe` 查 opencode | `env-probe` 增一项 OfficeCLI |
| 生成时缺失 | Agent 预检失败 | 勾选含 Office 时：提示去引导安装，或整次跳过 Office 文件并说明 |

**产品原则（对齐 10 号文）**：主包保持轻量；重型可选运行时由业务员在引导里按需装；路径写入 prefs，应用只认自己装的副本。

### 3.2 安装位置与常量（草案）

```ts
export const OFFICECLI_INSTALL = {
  version: '1.0.144', // spike / 发版时锁定
  /** 相对 app.getPath('userData') */
  prefixDirName: 'officecli-runtime',
  // Windows：
  // <userData>/officecli-runtime/officecli.exe
  assetWinX64: 'officecli-win-x64.exe',
  releaseBase:
    'https://github.com/iOfficeAI/OfficeCLI/releases/download',
  // 完整 URL：`${releaseBase}/v${version}/${assetWinX64}`
  sha256WinX64: '…', // 来自 release 的 SHA256SUMS，钉死进代码
  manualDocsUrl: '…', // 官网/文档「手动下载 OfficeCLI」
} as const
```

prefs 建议字段（对齐 `FTCS_OPENCODE_PATH` 思路）：

- `officecliPath`：绝对路径  
- 或仅约定固定相对路径 + probe 是否存在  

环境变量兜底：`FTCS_OFFICECLI_PATH`（开发/企业预置）。

### 3.3 引导 UI（已确认：可选 + 文案标明）

在现有 `OnboardingOverlay` 依赖清单增加一行，与 Node / OpenCode 并列，**明确标成可选**：

| 依赖 | 说明（草案） | 操作 |
|------|--------------|------|
| OfficeCLI（可选） | 仅当资料含 Word / Excel / PPT 时需要；用于抽文本后再生成画像。不装不影响网站与 txt/md。 | 未就绪：「一键安装」；进度：下载 → 校验 → 落盘；成功后**当场 probe 刷绿**（见 §3.6） |

设置页「依赖 / 引导」入口可再次打开（与 Node/OpenCode 相同）。

**不**因未装 OfficeCLI 锁死应用或挡住「完成引导」。

### 3.3b 录入页生成弹框（已确认）

点「生成画像」时，若展开结果里含 `.docx` / `.xlsx` / `.pptx`，且 probe 显示 OfficeCLI **未就绪**，则**先出专用确认框**（可扩现有 `ConfirmDialog` 或单独弹层），不要等 bootstrap 静默 skipped：

| 要素 | 行为 |
|------|------|
| 文案 | 说明勾选中有 N 个 Office 文件；需安装 OfficeCLI 才能纳入画像；约 32MB、可稍后在引导里装 |
| 主操作 | **一键安装**（同引导安装 IPC；弹框内展示进度） |
| 次操作 | **跳过 Office 文件，继续生成**（本次只提交非 Office 的 website/file；若跳过后无可导入资料则报错） |
| 取消 | 关闭弹框，不生成 |
| 已装好 | 不弹此框，走现有生成确认（若有）或直接生成 |

安装成功后：同一弹框可变为「安装成功，继续生成（含 Office）」或自动关闭并继续生成（详细设计定一种）。

```text
点生成 → expand
  → 含 Office 且未装？
       是 →【安装 / 跳过 Office / 取消】
            ├─ 安装成功 → 含 Office 生成
            └─ 跳过 → 去掉 Office 路径后再生成（或无可生成则错误）
       否 → 现网确认 / 直接生成
```

### 3.4 安装方式（已定：下二进制，不跑官方安装脚本）

**一键安装 = 主进程下载钉死版本的 Release 资产 → SHA256 → 拷到 userData。**

| 渠道 | 用不用 | 原因 |
|------|--------|------|
| **GitHub Release 单文件** `officecli-win-x64.exe` | **用（默认）** | 即运行时本身，无 Setup；可钉版本 + SHA；落盘到应用目录 |
| 官方 `install.ps1` / Scoop / 全局 PATH | **不用** | 易装到用户机器、改 PATH；不可控、难卸载、和「仅本应用」冲突 |
| npm `@officecli/officecli` | **不用** | 又绑 Node；OpenCode 才走 npm，OfficeCLI 无此必要 |
| 传统安装向导（MSI/Setup.exe） | **无**（上游 Release 就是裸 exe） | — |

```text
点「一键安装 OfficeCLI」
  → 仅 Windows x64（首发；ARM 另说）
  → 下载钉死 URL（如 …/v1.0.144/officecli-win-x64.exe）到临时文件
  → SHA256 对照 release 的 SHA256SUMS（钉死进代码）
  → 写入 <userData>/officecli-runtime/officecli.exe
  → 写 prefs.officecliPath
  → 立刻 `probeOfficeCli()`（查文件存在 + 可选 `--version`）
  → 返回 ok；引导行 / 录入弹框当场刷绿，**不强制重启**
```
| 失败码（草案） | 含义 |
|----------------|------|
| `unsupported-platform` | 非 Win x64 |
| `network` | 下载失败 |
| `checksum` | SHA 不符 |
| `write-failed` | 落盘/权限 |
| `blocked` | 杀软隔离（能检测到则报） |

**明确不做**：

- 不把 exe 打进 NSIS 主包  
- 不要求用户 Scoop / 全局 PATH  
- **不在用户未确认时**静默联网下载（录入弹框点「一键安装」才下）  
- 不做编辑/渲染能力的引导  
- 不跑 `officecli install`（避免写系统 PATH / 装 Cursor skill）

### 3.4b 下载源：GitHub 不稳 → Gitee 镜像（倾向）

国内直连 GitHub Release 常超时。Node 一键装已有「官方 URL + 镜像兜底」（docs/09 npmmirror）。OfficeCLI 无现成公共镜像，**自建 Gitee Release/附件一份是合理做法**。

| 项 | 建议 |
|----|------|
| 主源（国内默认） | **Gitee**：团队维护的 Release，资产名与版本与上游一致（如 `officecli-win-x64.exe` @ v1.0.144） |
| 备源 | 上游 GitHub Release 原 URL |
| 策略 | **先 Gitee，失败再 GitHub**（或进度条上可重试）；两次都失败 → `network` + 手动下载说明（可同时给两个链接） |
| 校验 | **无论从哪下，都用同一份钉死 SHA256**（来自上游 SHA256SUMS）；镜像被换包也能拦 |
| 协议 | 上游 Apache 2.0，允许再分发；Gitee Release 注明来源仓库与版本 |
| 运维 | 应用发版/升钉死版本时：**同步上传** Gitee 资产；CI 或检查清单里写「升 OFFICECLI_INSTALL.version 必须更镜像」 |
| 不做 | 不镜像 install.ps1；不把「最新版」做成浮动 tag（始终钉版本号） |

常量草案：

```ts
downloadUrls: {
  primary:
    'https://gitee.com/mfs1998_admin/public-resource/releases/download/office-cli/officecli-win-x64.exe',
  fallback:
    'https://github.com/iOfficeAI/OfficeCLI/releases/download/v1.0.144/officecli-win-x64.exe',
}
```

若日后有自有 OSS/CDN，可把 primary 换成 CDN，Gitee/GitHub 作备源；SHA 规则不变。

### 3.5 与「主包内嵌」的取舍（已倾向引导）

| | 主包内嵌 ~32MB | **引导一键安装（倾向）** |
|--|----------------|---------------------------|
| 安装包体积 | 变大 | 保持轻量 |
| 离线首次生成 Office | 可以 | 需先联网装一次 |
| 版本升级 | 跟应用发版 | 可独立升 runtime（仍建议钉版本） |
| 体验一致性 | 开箱即有 | 与 Node/OpenCode 同一心智 |
| 风险 | 主包膨胀 | 弱网装失败；需文案与手动兜底 |

### 3.6 环境变化能否「自动监测」？

**结论分两层：应用内安装可以当场感知；系统环境变量变化不能指望进程自动收到。**

| 场景 | 能否自动变绿 | 做法 |
|------|--------------|------|
| 本应用「一键安装」写完 exe + prefs | **能** | 安装 IPC 结束后立刻 probe；刷新引导行 / 录入弹框状态。**不强制重启**（与 OpenCode 不同：OpenCode 依赖 Node PATH 注入，docs/10 要求重启） |
| 点引导「重新检测」 | **能** | 现网已有；再跑一次 `probeEnvironment` |
| 打开生成弹框前 | **能** | 展开含 Office 时再 probe 一次，避免状态过期 |
| 用户在系统里改了 `FTCS_OFFICECLI_PATH` / PATH（另一窗口 setx） | **运行中进程默认看不到** | Electron 启动时的 `process.env` 是快照；改系统环境变量**不会**推送给已启动进程 |
| 企业预置 / 外部拷贝 exe 到约定目录 | **可做到近实时** | 每次 probe 读 prefs + 查 `userData/officecli-runtime/officecli.exe` 是否存在（不依赖 env）；可选：引导页打开时、录入页点生成时探测 |

**不建议做的「真·环境变量监听」**：

- Windows 没有可靠的「任意 env 变更 → 通知 Electron」通用 API；轮询注册表 `HKCU\Environment` 成本高、收益低。  
- OfficeCLI 主路径应是 **prefs + 约定落盘文件**，环境变量只作开发/企业兜底；**以文件是否存在为准**，而不是盯 env。

**与 OpenCode 对比（产品文案可写清）**：

| | OpenCode | OfficeCLI（本方案） |
|--|----------|---------------------|
| 装完要重启吗 | **要**（PATH / Node 会话） | **不要**（落盘 exe + prefs 即可当场 probe） |
| 「重新检测」 | 重启后点 | 可选；装完自动刷绿已够 |

---

## 4. 抽取路径（装好之后）

```text
勾选 → expand → bootstrap
  ├─ 文本：原样拷贝
  ├─ docx/xlsx/pptx：原件拷贝 + resolveOfficeCli() → view text → 侧车 .txt
  └─ 无解析器 / 失败 / 空文本 → skipped
→ Prompt 只列侧车与普通文本
```

```bash
"<officecliPath>" view "D:\...\说明.docx" text
```

| 项 | 建议 |
|----|------|
| 侧车 | `说明.docx.txt` |
| 超时 | 单文件 30～60s |
| 并发 | 第一刀串行 |
| 路径 | 绝对路径 + 引号；中文/空格做 spike |
| Agent | **禁止**依赖 Agent 自己调 officecli |

`resolveOfficeCli()` 顺序建议：`FTCS_OFFICECLI_PATH` → prefs → `<userData>/officecli-runtime/officecli.exe` →（可选）PATH 仅开发兜底。

---

## 5. 与「分库方案」对照

| 维度 | OfficeCLI + 引导安装 | mammoth + SheetJS + pptx |
|------|----------------------|---------------------------|
| 主包体积 | 几乎不增 | 增依赖，仍远小于 32MB exe |
| 首次 Office 生成 | 需已装 runtime | 开箱可用 |
| 三种格式 | 一套 CLI | 三套库 |
| 运维 | 下载源、SHA、杀软 | npm 锁版本 |
| 心智 | 与 OpenCode 一致 | 无新依赖行 |

在「引导安装」取向下，**OfficeCLI 的体积槽点从「主包太大」变成「可选下载一次」**，更可接受。

---

## 6. 风险清单

| 风险 | 缓解 |
|------|------|
| 首次无网 / 下载失败 | 可读错误 + 手动下载说明（SHA 页）；Office 文件 skipped，其它资料仍可生成 |
| 杀软拦 exe | 文案；校验后仍失败码 `blocked`；日志勿刷敏感路径过多 |
| GitHub Release 国内慢 | 可后续加镜像（详细设计）；MVP 先官方 URL + 进度条 |
| 输出带 `[/body/p[N]]` | spike 后决定剥离规则 |
| 未装就生成 | skipped 文案指向引导，不假装成功 |
| 上游升级破坏 CLI | **钉死版本 + SHA256**，跟应用发版再升 |

---

## 7. Spike 清单

### 7.1 抽取质量（与分发无关）

| # | 动作 | 通过标准 |
|---|------|----------|
| C1–C8 | 同前：version、中文 docx、xlsx、pptx、坏文件、中文路径、耗时、对比 mammoth | 见旧表 |

### 7.2 引导安装（对齐 OpenCode 体验）

| # | 动作 | 通过标准 |
|---|------|----------|
| I1 | 模拟下载到临时目录 + SHA256 | 校验失败能拦 |
| I2 | 写入 userData 约定路径后 `view` 成功 | 不依赖 PATH |
| I3 | 删除 runtime 后 probe 为未就绪 | 录入弹框出现安装/跳过；跳过后续正确 |  
| I4 | 引导行文案标「可选」 | 不挡完成引导；与 Node/OpenCode 并列不打架 |  
| I5 | 装成功后不重启 | 引导行当场绿；生成可立刻含 Office |

---

## 8. 详细设计应写清的点（选定后）

1. `OFFICECLI_INSTALL` 常量、SHA、镜像策略。  
2. `installOfficeCli` IPC + 进度事件（照抄 OpenCode progress 形态）。  
3. `env-probe` / Onboarding / 设置依赖行。  
4. `resolveOfficeCli` + `extractOfficeText` + bootstrap 侧车。  
5. 未安装时的 skipped / 错误文案。  
6. 非目标：不内嵌主包、不编辑文档、不强制装才能用纯文本生成。

可拆故事（已写入 [docs/17 §12.4](../17-下一阶段-业务效率工具.md)）：

| 故事 | 内容 |
|------|------|
| US-I-09 | OfficeCLI 引导 / 设置一键安装 + probe |
| US-I-10 | 录入生成时：安装 / 跳过 Office / 取消 |
| US-I-11 | bootstrap 侧车抽取并参与画像 |

---

## 9. 已拍板 / 待拍板

| 项 | 状态 |
|----|------|
| 引导一键安装、不进主包 | 已拍板 |
| **可选依赖**；引导行标明「可选」 | 已拍板 |
| 录入页：检测到 Office 文件且未装 → 弹框 **安装 / 跳过 Office / 取消** | 已拍板 |
| 装完 **当场 probe 刷绿，不强制重启** | 已拍板（实现以 prefs+文件为准；不监听系统 env） |
| 下载：**Gitee 镜像优先 + GitHub 兜底 + 同一 SHA256** | 已倾向（同意自建 Gitee 一份） |
| 钉死版本号 | 待 spike 后定（试验可用 v1.0.144） |
| pdf | 另故事 |

下一步：Windows 上手工跑 §7.1 抽取 spike；通过后再写安装 + 抽取正式详细设计（含录入弹框交互）。
