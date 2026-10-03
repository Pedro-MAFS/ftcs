---
name: ftcs-release
description: >-
  外贸获客（FTCS）桌面发版的人机协作流程：AI 升版本、对照帮助文档、写发布日志、打 Windows 安装包并提交源码；人上传 Gitee/GitHub Release，并跑阿里云流水线发布官网。
  Use when the user asks to 发版, release, 升版本, bump version, npm run dist, 更新 latest.json / changelog / 官网下载链接, 或同步安装说明。
---

# FTCS 桌面发版

人机协作。AI 准备版本元数据、说明和桌面安装包；人把安装包发到 Release 仓，并用阿里云流水线发布官网。

## 分工

| 谁 | 做什么 |
| --- | --- |
| **AI** | 归纳本版用户可见改动；升版本号；按需改帮助文档；写 changelog 与 `latest.json`；改 `site.ts` 下载文件名与 URL；在 `desktop/` 执行 `npm run dist`；用户要求时提交并推送**源码仓** |
| **人** | 把两个 exe 上传到 Gitee / GitHub **发版仓**（创建 tag）；抽查下载链接；在阿里云跑官网发布流水线 |

安装包不进源码仓 git。AI 不代替人上传 Release。

发版对象是**已经完成、准备给用户用的能力**。版本号、说明、安装包、官网下载与检查更新清单属于发版；新功能实现走各自的开发流程。

## 步骤

用户说「发版」时，先确认目标版本号（如 `0.5.0`），再按序做。每一步做完再进入下一步；需要人动手的步骤，AI 给出清单后停下等对方完成。

### 1. 本版说明与帮助文档（AI）

从已落地改动里写出用户能看懂的更新条目（给 changelog / `latest.json` 用）。

对照这些条目，检查帮助是否仍准确；行为有变再改对应页：

| 涉及 | 文件 |
| --- | --- |
| 录入、资料树、勾选、官网书签 | `website/content/docs/workflow.md`、`getting-started.md`；必要时首页录入文案 |
| Word / Excel / PPT、OfficeCLI | `website/content/docs/install.md`、`faq.md` |
| 安装前置、一键安装 | `install.md` |

发布日志从 **0.5.0** 起按版本追加。更早版本没有条目。

若本版对应某份需求文档的交付，把该文档文头状态写成已交付，并在 `docs/04-实施计划.md`「下一步行动」写上版本号。需求文档随该需求走，不是每版都改。

改文本用 Cursor 写入或 UTF-8 工具（见仓库 `AGENTS.md`）。

### 2. 官网内容是否要改（AI）

发版时必须对照本版用户可见改动，检查官网对外页面还准不准：

- 首页产品介绍
- 下载页说明
- 帮助文档：`website/content/docs/install.md`、`getting-started.md`、`workflow.md`、`faq.md`，以及这些页面上仍写着旧行为的文案

官网不再有支持计划页，进度看 GitHub Issues（https://github.com/Pedro-MAFS/ftcs/issues）。不要把该页列入必查对外页。

changelog、`latest.json`、`site.ts` 的版本号和下载地址不算这一步，仍走后面的发布日志和下载 URL 步骤。

有过时描述就改对应页；没有就在发版回报里明确写「官网内容无需调整」，并写出看过哪些页。

不为此新开路由，不改阿里云流水线。

### 3. 升版本号（AI）

同一号写进：

- `desktop/package.json` → `version`（安装包文件名跟这个）
- `website/package.json` → `version`
- `website/src/config/site.ts` → `version` 和两个 `filename`
- `website/public/updates/latest.json` → `version`、`title`、`releasedAt`（当天）

`minVersion` 仅在有兼容性下限变化时改。

### 4. 发布日志与检查更新清单（AI）

两处 `notes` 用同一组句子：

1. `website/src/config/changelog.ts`：`changelogReleases` **数组头部**追加 `{ version, releasedAt, title, notes }`
2. `website/public/updates/latest.json`：同一组 `notes`（桌面「检查更新」读这个文件）

改了帮助或 changelog 时，更新 `website/public/sitemap.xml` 相关 `<lastmod>`。新官网路由才改 `website/vite.config.ts` 的 `includedRoutes`。

### 5. 写好下载 URL（AI）

在 `website/src/config/site.ts` 按下面约定填 tag 与文件名。人上传 Release 之后，用这四条 URL 抽查。

| | Gitee | GitHub |
| --- | --- | --- |
| 发版仓 | `gitee.com/mfs1998_admin/ftcs` | `github.com/Pedro-MAFS/ftcs` |
| tag | `V{version}`（例 `V0.5.0`） | `{version}`（例 `0.5.0`） |
| Setup | `外贸获客-Setup-{version}.exe` | `foreign-trade-Setup-{version}.exe` |
| Portable | `外贸获客-Portable-{version}.exe` | `foreign-trade-Portable-{version}.exe` |

Gitee 中文文件名在 URL 中编码：`外贸获客` → `%E5%A4%96%E8%B4%B8%E8%8E%B7%E5%AE%A2`。

源码仓是 `foreign-trade-customer-search`；安装包发到上面的 **ftcs** 仓。

### 6. 打安装包（AI，用户要求时执行）

```powershell
cd desktop
npm run dist
```

产物在 `desktop/release/`：

- `外贸获客-Setup-{version}.exe`
- `外贸获客-Portable-{version}.exe`

打完告诉人这两个路径。`desktop/release/`、`desktop/out/`、`desktop/resources/workspace-template/` 留在本地。

### 7. 提交源码（AI，用户要求时执行）

提交版本号、文档、changelog、`site.ts`、`latest.json`。提交说明写本版为什么发布。推送到源码仓 `origin`。

### 8. 上传 Release（人）

1. Gitee `ftcs`：tag `V{version}`，上传**中文文件名**两个 exe（与 dist 产物同名）。
2. GitHub `ftcs`：tag `{version}`，上传前把文件改名为 `foreign-trade-Setup-{version}.exe` 与 `foreign-trade-Portable-{version}.exe`。
3. 打开 `site.ts` 里四条下载链接，确认能下。

### 9. 发布官网（人）

源码推到 `origin` 之后，提醒人去 **阿里云流水线** 执行官网发布。AI 不在本地 `npm run build` 官网，也不拷 `website/dist/`。

流水线跑完后，桌面端才能读到新的 `latest.json`。下载链接抽查可与第 8 步一起做。
