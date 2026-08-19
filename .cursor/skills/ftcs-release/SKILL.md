---
name: ftcs-release
description: >-
  执行外贸获客（FTCS）桌面端与官网发版：对照用户可见改动更新帮助文档、升版本号、同步发布日志与 latest.json、改 site.ts 下载链接、打 Windows 安装包、提交推送（不含二进制）并核对 Gitee/GitHub Release。
  Use when the user asks to 发版, release, 升版本, bump version, npm run dist, 更新 latest.json / changelog / 官网下载链接, 或同步安装说明。
---

# FTCS 桌面发版

按本流程发版，不要把「下一阶段规划」里未纳入本版的功能一并实现。

## 范围（先锁死）

发版默认只做：版本号、用户说明、帮助文档、发布日志、安装包、上传与网站部署。

- **不要**因为用户附了旧计划或 todos 就去改探索轮次、人员画像、未评审通道。
- **不要**改 Cursor plan 文件。
- 已有 todos 若属于探索/人员等非本版范围：标 cancelled，不要接着做。
- 用户说「只改版本号/说明/文档」时，禁止顺手改产品代码。

对照本版**用户能感知到的**改动，再决定改哪些说明；没变的页面不要为发版而改。

## 流程

复制并勾选：

```
发版进度:
- [ ] 确认版本号与本版用户可见改动
- [ ] 帮助文档 / 首页文案是否过时
- [ ] 升 desktop + website 版本号
- [ ] changelog 头部追加 + latest.json 同步 notes
- [ ] site.ts 文件名与 Gitee/GitHub 下载 URL
- [ ] 规划文档基线版本（若本版已交付某条主线）
- [ ] desktop：npm run dist
- [ ] 提交推送（不含安装包二进制）——仅当用户要求
- [ ] 上传 Gitee + GitHub Release
- [ ] 构建并部署 website
```

未要求 commit / push / dist 时，做到文档与版本号即可，然后停下来问。

改文本文件用 Cursor 写入或 UTF-8 工具，**禁止**用 PowerShell `Set-Content` / `Out-File` / `>` 回写（见仓库 `AGENTS.md`）。

## 1. 确认本版改了什么

从已落地提交归纳**用户可见**条目（录入、Office、设置引导等），不要写研发内部编号当唯一说明。`latest.json` / changelog 的 `notes` 用业务员能读懂的句子。

帮助文档对照（有行为变化才改）：

| 用户行为变了？ | 改 |
| --- | --- |
| 录入方式、资料树、勾选文件夹、官网书签进目录 | `website/content/docs/workflow.md`、`getting-started.md`、首页录入文案 |
| Word/Excel/PPT、OfficeCLI | `install.md`、`faq.md` |
| 安装前置、一键安装 | `install.md` |
| 仅内部实现、界面无变化 | 不必改帮助 |

发布日志从 **0.5.0** 起记，**不要补更早版本**。

## 2. 升版本号

同一版本号写进：

- `desktop/package.json` → `version`（安装包文件名跟这个走）
- `website/package.json` → `version`
- `website/src/config/site.ts` → `siteConfig.version` 以及两个 `filename`
- `website/public/updates/latest.json` → `version` / `title` / `releasedAt`（当天日期）

`minVersion` 无兼容性断裂时保持不动。

## 3. 发布日志与更新清单

`notes` 必须两处一致（可微调标点，不要各写一套）：

1. `website/src/config/changelog.ts`：在 `changelogReleases` **数组头部**追加一条（`version`、`releasedAt`、`title`、`notes`）。
2. `website/public/updates/latest.json`：同一组 `notes`。桌面端检查更新只读这个文件。

## 4. 下载链接（先写上，上传后再核对）

`website/src/config/site.ts` 习惯：

| | Gitee | GitHub |
| --- | --- | --- |
| Release tag | `V{version}` 如 `V0.5.0` | `{version}` 如 `0.5.0`（无 `V`） |
| Setup 文件名 | `外贸获客-Setup-{version}.exe` | `foreign-trade-Setup-{version}.exe` |
| Portable 文件名 | `外贸获客-Portable-{version}.exe` | `foreign-trade-Portable-{version}.exe` |
| 仓库 | `gitee.com/mfs1998_admin/ftcs` | `github.com/Pedro-MAFS/ftcs` |

Gitee 的中文文件名在 URL 里用百分号编码（`外贸获客` → `%E5%A4%96%E8%B4%B8%E8%8E%B7%E5%AE%A2`）。

本地 `npm run dist` 产物是中文名（`productName` = 外贸获客）。上传 GitHub 时**改名为** `foreign-trade-Setup-*.exe` / `foreign-trade-Portable-*.exe`，与 `site.ts` 一致。

若本版改了帮助或 changelog，同步 `website/public/sitemap.xml` 相关 `<lastmod>`；新路由才改 `vite.config.ts` 的 `includedRoutes`。

规划文档仅当本版交付了某条主线时改基线版本：`docs/17-下一阶段-业务效率工具.md` 文头、`docs/04-实施计划.md`「下一步行动」。不要借发版改写探索语义。

## 5. 打安装包

在 `desktop/`：

```powershell
npm run dist
```

会 `build:mcp`、准备 workspace 模板、electron-vite build、electron-builder `--win`。产物在 `desktop/release/`：

- `外贸获客-Setup-{version}.exe`
- `外贸获客-Portable-{version}.exe`

**不要**把以下路径加入 git：`desktop/release/`、`desktop/release-*`、`desktop/out/`、`desktop/resources/workspace-template/`、`推广/`（除非用户点名要提交推广稿）。

## 6. 提交与推送

仅在用户明确要求时 commit / push。不要提交安装包或 `.env`。

说明写「为什么发这版」，例如：同步 0.5.0 版本号与录入优化说明。

推送到当前跟踪的 `origin`（代码仓多为 Gitee `foreign-trade-customer-search`）。安装包上传的是 **ftcs** 发版仓，不是这个代码仓。

## 7. Release 与网站

1. Gitee `mfs1998_admin/ftcs`：创建 tag `V{version}`，上传中文文件名两个 exe。
2. GitHub `Pedro-MAFS/ftcs`：创建 tag `{version}`，上传英文文件名两个 exe。
3. 用浏览器打开 `site.ts` 里四条 URL，确认都能下。
4. `website/`：`npm run build`，把 `website/dist/` 部署到 nginx `html/ftcs/`（`base` 为 `/ftcs/`）。部署后桌面端才能读到新的 `latest.json`。

## 常见错法

- 把「发版」做成「把计划 todos 全部实现」。
- 只改 `desktop/package.json`，漏了 `latest.json` / changelog / `site.ts`。
- changelog 与 `latest.json` 的 notes 不一致。
- 把 `desktop/release/` 打进提交。
- Gitee/GitHub 的 tag 或文件名和 `site.ts` 对不上（尤其 GitHub 英文名、Gitee 的 `V` 前缀）。
