# US-GH-01 详细设计：GitHub 门面第一刀

> **用户故事**：作为第一次打开 [Pedro-MAFS/ftcs](https://github.com/Pedro-MAFS/ftcs) 的访客，我想在仓库首页看懂产品、看到三步演示、点到最新安装包，并确认协议是 Apache-2.0。  
> **来源**：[Issue #99](https://github.com/Pedro-MAFS/ftcs/issues/99) · US-GH-01 · **Related #99**  
> **状态**：待开发（本文只定 README / LICENSE / About 规格与分镜；不改产品行为）  
> **范围**：README 单文件中英并列；主路径 GIF 或三张静帧；Setup / Portable 链到最新 Release；官网；根目录 Apache-2.0 `LICENSE`；About 的 homepage、Topics、description  
> **依赖**：马丰顺 2026-10-26 锁定 homepage 与协议；素材录屏由马丰顺出（见 §6）  
> **不做**：Release 笔记模板、CI/Action 自动贴 Release、与 `latest.json` 自动同源、演示工作区 / 案例卡、官网大改、把 Discussions 当作本刀必做  
> **文档位置**：`docs/design/`

开发按本文改仓库门面。桌面端功能、发版流水线、官网页面都不在本刀。

---

## 0. 相对现网

| 现网（`dev-0.6.0` 的 `README.md`） | 本刀 |
|-----------------------------------|------|
| 标题下两句内部介绍，接着「文档导航」大表 | 开篇改为访客卖点：英文约 5 行，中文约 5 行 |
| 无演示图 | 主路径三步：录入 → 探索 → 线索 |
| 无下载入口 | Setup、Portable 都链到最新 Release；另给官网 |
| 无 License 行；仓库根目录无 `LICENSE` | 根目录 Apache-2.0 全文；README 标明协议 |
| About 无 homepage、无 Topics；description 空或偏内部 | homepage、≥3 个 Topics、中英短句 description |
| 「当前阶段」仍写 **v0.5.4**；Phase 清单末尾有一条空的 `- [ ]` | 这两块下沉到「开发者」折叠；版本号不再写死；删掉空勾选 |

---

## 1. 目标与非目标

### 1.1 目标

1. 不打开 `docs/`，也能用中文或英文说清产品是什么。
2. 首页能看到录入 → 探索 → 线索（GIF，或三张静帧）。
3. 点 Setup 或 Portable，都能到达**最新** GitHub Release。
4. About：`homepage` 为已锁定官网；Topics 至少 3 个；description 是访客能懂的中英短句。
5. 根目录 `LICENSE` 被 GitHub 识别为 Apache License 2.0；图和文里没有真实客户邮箱、真实客户域名。

### 1.2 非目标

| 不做 | 说明 |
|------|------|
| Release 笔记模板 | 另刀 |
| Action 自动写 Release、自动贴资产说明 | 另刀 |
| README 下载链接与 `website/public/updates/latest.json` 自动同源 | 另刀。本刀用「最新 Release 页」，不写死版本号 |
| 产品内演示工作区、案例卡导出 | 录屏用一次性假数据即可，不做产品功能 |
| 官网改版、社媒投放节奏 | 本刀只在 README 放官网链接 |
| 打开 GitHub Discussions | 可做可不做，不作为验收 |
| 给全部源文件补 Apache 文件头、新增 `NOTICE` | 见 §6 |
| #7 / #41 读图、#86 扫街 | 已搁置，与本刀无关 |

---

## 2. 已锁定口径

| 项 | 决定 |
|----|------|
| README 形态 | **一个** `README.md`。访客段落英文在上、中文在下，不另建 `README.zh.md` |
| homepage | `https://ftcs.ai-utills.com`（马丰顺 2026-10-26 已确认，按此字符串写入 About，不加路径） |
| 协议 | Apache-2.0 |
| 资产目录 | `docs/assets/github/`（素材到位后再提交；本详设不附二进制） |
| GIF | 宽 1280、体积 ≤ 8MB、时长约 15～25 秒，一条片覆盖三步 |
| 静帧 | PNG，三步各一张，宽 1280，作 GIF 备用 |
| 方图 | 1080×1080 **可选**，不挡验收 |
| 录屏窗口 | 建议 1280×720 |

---

## 3. README 段落骨架

文件仍是仓库根目录 `README.md`。顺序固定如下。开发者折叠之前的每一段都是中英并列（英文一段，紧接中文一段）。

### 3.1 标题

```markdown
# 外贸获客智能体（FTCS）
```

标题下不放 Phase、OpenCode、MCP、版本号。

### 3.2 开篇卖点

英文约 5 行，中文约 5 行。下面是可粘贴草案，**待马丰顺定稿**。定稿前实现就用这段，PR 描述里注明「卖点为草案，待马丰顺定稿」。

**English（待马丰顺定稿）**

```text
FTCS is a Windows desktop agent for foreign-trade teams.
Hand it your product pages and documents.
It builds a product profile, looks through public web pages, and returns scored leads.
Outreach starts as a draft you can edit. You decide when to send.
Business data stays on your computer.
```

**中文（待马丰顺定稿）**

```text
外贸获客（FTCS）是跑在 Windows 上的外贸获客智能体。
把产品官网和说明书交给它。
它生成产品画像，在公开网页里寻找潜在客户，并给出带评分的线索。
开发信先写成可改的草稿，由你确认后再用。
业务数据留在你的电脑上。
```

这五句只复述现有对外口径（本机、画像、公开网页线索、可改稿开发信）。不写「一键群发」，不写定时探索已可用。

### 3.3 三步演示

紧接卖点。图在上，图注中英各一行。

素材文件名（放到 `docs/assets/github/`，相对 README 的路径如下）：

| 用途 | 路径 |
|------|------|
| 主 GIF（优先） | `docs/assets/github/main-path.gif` |
| 静帧 1 录入 | `docs/assets/github/step-1-library.png` |
| 静帧 2 探索 | `docs/assets/github/step-2-explore.png` |
| 静帧 3 线索 | `docs/assets/github/step-3-leads.png` |
| 方图（可选，不必进 README） | `docs/assets/github/square-1080.png` |

**GIF 已在仓库时**，README 使用：

```markdown
## See it in 3 steps

![Add materials, discover leads, review the list](docs/assets/github/main-path.gif)

1. Add materials. 2. Discover leads. 3. Review the list.

## 三步看看

1. 录入资料。2. 探索客户。3. 查看线索。

演示公司、域名和邮箱都是虚构的。
```

中文标题「三步看看」与英文标题成对；GIF 只嵌一次，避免双倍体积。

**GIF 尚未提交时**，用三张静帧顶上，验收仍算「首页可见主路径截图」：

```markdown
## See it in 3 steps

| 1. Add materials | 2. Discover leads | 3. Review the list |
| --- | --- | --- |
| ![Add materials](docs/assets/github/step-1-library.png) | ![Discover leads](docs/assets/github/step-2-explore.png) | ![Review the list](docs/assets/github/step-3-leads.png) |

## 三步看看

1. 录入资料。2. 探索客户。3. 查看线索。

演示公司、域名和邮箱都是虚构的。
```

GIF 与三张静帧都还没有时：实现 PR 先不要写「见下图」空链。骨架和其余验收可以先合；「首页可见 GIF/截图」等素材 PR 补上再勾。本详设不生产 GIF。

分镜、假数据和脱敏见 §4。

### 3.4 下载：Setup / Portable → 最新 Release

两条链接都指向：

`https://github.com/Pedro-MAFS/ftcs/releases/latest`

README **不写死** `0.5.10` 或任何版本号，也 **不** 写 `releases/download/<tag>/...exe`。资产文件名带版本，写死会在下次发版后失效；和 `latest.json` 自动保持同一条链接不属于本刀。

现网 GitHub 资产名形态（只作访客提示，不写进死链）：

- 安装包：`foreign-trade-Setup-<版本>.exe`
- 便携版：`foreign-trade-Portable-<版本>.exe`

建议文案（链接文字可随定稿微调，URL 不要改）：

```markdown
## Download

- [Windows Setup](https://github.com/Pedro-MAFS/ftcs/releases/latest) — on the latest release, download the asset whose name contains `Setup`.
- [Windows Portable](https://github.com/Pedro-MAFS/ftcs/releases/latest) — same page; asset name contains `Portable`.

## 下载

- [Windows 安装包（Setup）](https://github.com/Pedro-MAFS/ftcs/releases/latest)：在最新 Release 页下载文件名含 `Setup` 的安装包。
- [Windows 便携版（Portable）](https://github.com/Pedro-MAFS/ftcs/releases/latest)：同一页，下载文件名含 `Portable` 的程序。
```

Gitee 镜像、官网下载按钮的主次，本刀不改。访客要国内镜像，走下一节官网。

### 3.5 官网

单独一节，链到已锁定 homepage：

```markdown
## Website

Product site: https://ftcs.ai-utills.com

## 官网

产品站：https://ftcs.ai-utills.com
```

`https://ftcs.ai-utills.com/download/` 可以加作第二句「安装说明与国内下载」，不代替 §3.4 的 Release 链接。

### 3.6 License 行

放在开发者折叠之前，中英各一句，链到根目录文件：

```markdown
## License

Licensed under the [Apache License, Version 2.0](./LICENSE).

## 许可

以 [Apache License 2.0](./LICENSE) 授权。
```

`LICENSE` 文件要求见 §5。版权主体未定时，不要在这句话里写「Copyright © 某人」。

### 3.7 原导航与 Phase 清单下沉

自现 README「## 文档导航」起，到文末，整段搬进折叠。折叠放在 License 之后：

```markdown
<details>
<summary>开发者 / For developers</summary>

Developer docs below are in Chinese.

<!-- 此处原样放入：文档导航表、技术原则、仓库状态 Phase 清单 -->

</details>
```

搬迁规则：

1. **文档导航表**现有各行（01–12、15–17、20，以及表后「Token 网关已迁出」那句）原样保留，链接仍指向 `docs/`。不补表里没有的序号。
2. **技术原则**五条原样保留。
3. **仓库状态** Phase 勾选原样保留，删掉末尾空的 `- [ ]`。不在本刀新增 Phase，不改 `docs/04-实施计划.md`。
4. **当前阶段**那一段不要再写 `v0.5.4`。改成下面这一句（能力列举与现文一致，版本改由 Release 说话）：

   > 桌面端已可跑通录入工程树与 Office 抽取、画像、关键词、广撒网 / 社媒发现 / 地图发现、任务编排、线索、开发信草稿。版本以 [最新 Release](https://github.com/Pedro-MAFS/ftcs/releases/latest) 与官网发布日志为准。发信 / 定时探索暂非主线。本期需求见 [docs/17-需求-业务效率工具.md](docs/17-需求-业务效率工具.md)。任务清单见 [docs/04-实施计划.md](docs/04-实施计划.md)。

5. 「标准工作流目录」那一句（`workspace/`、`desktop/`、`website/`、Token 网关、`.cursor/` 不进 Git）跟在当前阶段后面，原样保留。
6. 访客区不再重复「项目目标」和流程箭头。那条 `产品信息输入 → … → 发送` 若还要留，只放进本折叠，不放回开篇。

折叠默认收起。GitHub 渲染 `<details>` 即可，不必再做脚本。

### 3.8 访客区禁用词

开篇、图注、下载、官网、License 这几段不出现：

- Phase、US-、v0.5.x、实施计划、验收勾选
- OpenCode、MCP、Token 网关、electron-updater
- 真实客户邮箱、真实客户域名

开发者折叠里可以继续出现文档原有用语。

---

## 4. GIF / 截图分镜与脱敏

一条 GIF 约 15～25 秒，宽 1280。窗口按 1280×720 录，再裁成这条宽度。建议日间主题，让 GitHub 白底上更清楚。画面里只留步骤数字，中英说明放在 README 图注（§3.3），避免字幕挡住界面。

### 4.1 三镜

假数据只用下表。公司名、域名、邮箱、联系人都是虚构的。

| 项 | 假数据 |
|----|--------|
| 资料夹 | `Example Lighting` / `示例照明` |
| 文件 | `product-sheet.md`（虚构的庭院太阳能灯卖点，不用资料库里的地板样本） |
| 线索公司 | `Harbor Loom` |
| 域名 | `harbor-loom.example` |
| 邮箱 | `buyer@example.com` |
| 联系人 | `Alex Example` |
| 市场 | `Germany`（不写真实街道门牌） |

| 镜 | 时间 | 画面 | 图注 |
|----|------|------|------|
| 1 录入 | 0–7 秒 | 资料树里只有「示例照明」。勾选 `product-sheet.md`，能看出可以生成画像 | 1. Add materials / 录入资料 |
| 2 探索 | 7–16 秒 | 探索页上是已准备好的假关键词或假结果，出现 2～3 条，且都来自上表 | 2. Discover leads / 探索客户 |
| 3 线索 | 16–25 秒 | 线索列表：`Harbor Loom`、评分、一句破冰。邮箱只显示 `buyer@example.com`，或整格不出现邮箱 | 3. Review the list / 查看线索 |

静帧与这三镜同一画面，各导出一张 PNG。方图 1080×1080 若做，用第 3 镜，文件名 `square-1080.png`，不放进 README 也可以。

体积：GIF ≤ 8MB。超时或超大时减到约 12～15 帧/秒再导出，不放宽 8MB。

### 4.2 脱敏清单（出图前逐项看）

- [ ] 没有真实客户邮箱（含 Hunter 结果、发件人、抄送）
- [ ] 没有真实客户域名；域名只用 `harbor-loom.example` 或 `example.com`
- [ ] 没有真实客户公司名、真实联系人姓名
- [ ] 不用 `docs/testdata/` 里的资料入镜（例如绿森塑木、`lvsenwpc.com`）
- [ ] 不录设置页上的 Key、余额、手机号、维护者邮箱
- [ ] 任务栏、其它窗口、浏览器标签不入画
- [ ] 第 2 镜不展示实网搜回来的真实商家。探索会打到公开网页；这一镜只用事先放进本地的假线索，或停在假关键词上

图注里写明「演示数据为虚构」。

---

## 5. LICENSE / 元数据验收清单

### 5.1 根目录 LICENSE

| 项 | 要求 |
|----|------|
| 路径与文件名 | 仓库根目录 `LICENSE`（无扩展名） |
| 正文 | [Apache License 2.0 官方全文](https://www.apache.org/licenses/LICENSE-2.0.txt) 原样落入。不改条款，不在文件开头加版权前言 |
| 识别 | 仓库 About 显示 **Apache License 2.0** |
| README | 有 §3.6 的 License 行，链到 `./LICENSE` |

版权主体、源文件头里的 SPDX、`NOTICE` 都不在本刀。需要版权行时，主体 **待马丰顺定稿**，另刀再加，避免改坏 License 识别。

### 5.2 About

需要有仓库设置权限的账号改。本地文件改完后，About 仍要单独设一次。

| 字段 | 写入值 |
|------|--------|
| homepage | `https://ftcs.ai-utills.com` |
| Topics | 至少 3 个。建议六个都挂：`electron`、`vue`、`typescript`、`b2b`、`lead-generation`、`foreign-trade` |
| description | 下面草案，单字段里中英各一句。**待马丰顺定稿** |

**description 草案（待马丰顺定稿，低于 GitHub 350 字限制）：**

```text
Windows desktop agent that turns product materials into public-web leads and editable outreach drafts. 把产品资料变成公开网页线索和可改稿的开发信。
```

可选 Topics（不强制）：`windows`、`desktop-app`。

不要挂会让人以为发信或 CRM 已是主功能的词（例如把本仓库标成完整 CRM、邮件群发）。description 里不用 Phase、OpenCode、MCP、US-、网关、v0.5.x。

可用（有权限时）：

```bash
gh repo edit Pedro-MAFS/ftcs \
  --homepage "https://ftcs.ai-utills.com" \
  --description "Windows desktop agent that turns product materials into public-web leads and editable outreach drafts. 把产品资料变成公开网页线索和可改稿的开发信。" \
  --add-topic electron --add-topic vue --add-topic typescript \
  --add-topic b2b --add-topic lead-generation --add-topic foreign-trade
```

description 定稿后，把命令里的句子换成定稿。

### 5.3 与 #99 验收对齐

| #99 验收 | 本刀怎么算通过 |
|----------|----------------|
| 不进 `docs/` 也能说出产品一句话（中或英） | §3.2 开篇在折叠之外 |
| 首页可见主路径 GIF/截图（装或录入 → 探索 → 线索） | §3.3 + §4。无素材时此项不勾 |
| 可一键到达最新 Setup 或 Portable | §3.4 两个链接都是 `releases/latest` |
| About 有 homepage + ≥3 Topics；description 非内部黑话 | §5.2 |
| 根目录存在 Apache-2.0 `LICENSE`，GitHub 识别为 Apache License 2.0 | §5.1 |
| 图/文无真实客户邮箱与域名 | §3.8 + §4.2 |

---

## 6. 实现边界

| 谁 | 本刀做什么 |
|----|------------|
| 开发实现 PR | 只改根目录 `README.md`、新增根目录 `LICENSE`、设置 GitHub About（homepage、description、Topics） |
| 素材 | 马丰顺按 §4 录屏或导出静帧，提交到 `docs/assets/github/`。详设只定规格，**不要求本阶段产出 GIF 文件** |
| 详设 PR | 只加本文。不改 README 正文，不改 `desktop/`，不往 `docs/assets/` 放二进制 |

实现 PR 不要顺手改：`desktop/`、`website/`、`workspace/`、`docs/04`、发版 workflow、`latest.json`。

About 改完后，用无登录的仓库首页看一遍：卖点、图、两个下载链接、官网、License、About 侧栏、折叠默认收起。

---

## 7. 未决与风险

| 项 | 处理 |
|----|------|
| 开篇英文五行、中文五行 | **待马丰顺定稿**。未定稿前用 §3.2 草案 |
| About description | **待马丰顺定稿**。未定稿前用 §5.2 草案 |
| 版权主体（文件头 / NOTICE） | **待马丰顺定稿**。本刀不写进 `LICENSE` |
| GIF 晚于 README 骨架 | 有三张脱敏静帧就可以勾「首页可见截图」。两样都没有时，该项留空，不放坏图 |
| 实网探索会带出真实公司 | 第 2 镜只用本地假线索。本刀不做演示工作区功能 |
| About 需要仓库权限 | 无权限时 README 与 `LICENSE` 仍可先合；Topics / homepage / description 由有权限的人按 §5.2 补，并在该 PR 写明已设或未设 |
| 折叠里的 Phase 未完成项（审核发送、定时探索） | 原样保留，本刀不改状态 |
