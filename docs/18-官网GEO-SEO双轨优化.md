# 18 - 官网 GEO / SEO 双轨优化执行计划

本文档是本次官网优化的**逐步执行清单**。每完成一步，把 `[ ]` 改成 `[x]`。

- **UI 稿**：[design/官网UI设计效果图.pen](design/官网UI设计效果图.pen)（主站左、子站右）
- **实现仓库**：本仓库 `website/` → 线上 [https://ftcs.ai-utills.com/](https://ftcs.ai-utills.com/)
- **主站仓库**：`ai-utills.com` **不在本仓库**。Step 7 只列协同口径，实现时在主站项目做。

---

## 0. 已拍板的原则

1. **双轨不变**：主站 `ai-utills.com` 做品牌与产品矩阵；子站 `ftcs.ai-utills.com` 做外贸获客垂直站。词权集中在子站。
2. **AI 驱动定位不变**：本机外贸获客智能体（Agent）。Hero 结果句保留。
3. **宣称对齐现网产品**：画像 → 获客探索（公开网页广撒网，以及按社媒公开摘要发现公司并核对官网）→ 评分 → 开发信**草稿**。不写海关数据库、决策人挖掘、CRM、群发、当前可发送；不宣称登录领英或打开社媒真页。
4. **词簇，不堆砌**：同一套名词在 Title / 第一段 / FAQ / `llms.txt` 自然出现；各页 Title 分工，避免全站同一句。
5. **「外贸」单字不当主攻词**。可抢的是「外贸 + 获客 / 系统 / 智能体 / Agent」。

### 0.1 明确不做

| 不做 | 原因 |
|------|------|
| Title / 首页写「海关数据」 | 产品未交付；与帮助文档冲突 |
| 主站预留空的 ERP / 视频卡片 | 空卡片会被当成能力承诺 |
| 帮助 / 下载做成第二套营销首页 | 这两页各打一个搜索意图 |
| 为排「外贸」两个字改公司名或堆关键词 | 头词不可争，且伤害可读性 |
| 把 `website/` 改成多语言站 | 本期只做中文 |

---

## 1. 词簇与页面分工

| 用户 / AI 可能搜的 | 承接页 | 出现位置 |
|-------------------|--------|----------|
| 外贸获客 | 子站首页 | Title、第一段、JSON-LD `name`、页脚 |
| 外贸获客系统 | 子站首页 | Title、H1 附近产品名 |
| 外贸获客智能体 | 首页 + FAQ「是什么」 | 眉标、第一段、`llms.txt` |
| 外贸获客 Agent | 首页 + `llms.txt` | 眉标括号、`alternateName` |
| 外贸获客软件 / 下载 | **下载页** | 该页 Title + H1 |
| 外贸获客怎么用 / 教程 | **帮助 / 快速开始** | 该页 Title + 开篇 |
| 外贸 | 不主攻 | 仅「专为外贸企业」陪衬 |

首页结构（两层都留，不二选一）：

- **眉标**：`FTCS  ·  外贸获客智能体（Agent）`
- **H1**：`告别盲目开发，用AI精准锁定全球买家。`
- **第一句**：点明「外贸获客系统 / 本机 AI 智能体」
- **Title**（见 §2）

---

## 2. 冻结文案（实现时直接用，不临场改口径）

改字前先对照本节。若要改口径，先改本文再改代码。

### 2.1 子站首页

| 项 | 文案 |
|----|------|
| `<title>` | `FTCS 外贸获客系统 \| AI获客智能体（Agent）与开发信草稿` |
| `description` | `FTCS 是专为外贸企业打造的本机 AI 获客系统（智能体 / Agent）。把官网与说明书交给它，生成产品与买家画像，在公开网页广撒网，也可按社媒公开摘要发现公司并核对官网，再评分去重、写出可改稿的开发信草稿。数据与密钥留在本机。` |
| 眉标 | `FTCS  ·  外贸获客智能体（Agent）` |
| H1 | `告别盲目开发，用AI精准锁定全球买家。` |
| Hero 正文 | `FTCS 是跑在你电脑上的外贸获客智能体。把官网与说明书交给它，由 AI 生成产品与买家画像，再从公开网页广撒网（也可按社媒公开摘要发现公司），评分去重，并写出可改稿的开发信草稿。数据与密钥留在本机。` |

JSON-LD / `llms.txt` 别名（必须一致）：

```text
Name: FTCS
Aliases: 外贸获客, 外贸获客系统, 外贸获客智能体, 外贸获客 Agent, FTCS Agent
```

### 2.2 下载页

| 项 | 文案 |
|----|------|
| `<title>` | `下载外贸获客系统 \| FTCS Windows 桌面智能体` |
| `description` | `下载 FTCS 外贸获客系统 Windows 安装包或便携版。本机 AI 智能体：产品画像、公开网页与社媒公开摘要探索、开发信草稿。国内建议 Gitee，海外可用 GitHub。` |
| H1 | `下载外贸获客桌面智能体` |
| 首段 | 先说是什么，再写 Node / Chrome / OpenCode。前置链到 `/docs/install`。 |

### 2.3 帮助

| 页 | `<title>` 方向 | H1 / 开篇 |
|----|----------------|-----------|
| `/docs` | `外贸获客智能体帮助 \| 安装、获客流程与常见问题` | H1：`外贸获客智能体 · 帮助`。一句：如何安装并使用 FTCS 这套外贸获客系统。 |
| 快速开始 | `外贸获客智能体快速开始 \| 一次获客闭环` | 先定义产品，再步骤。探索写「广撒网 / 社媒发现」；若出现界面上的 R1 / R2，须紧跟中文名称。 |
| 安装与前置 | `外贸获客系统安装 \| Node、Chrome 与 OpenCode` | Title 带产品名；技术前置放正文。 |
| 推荐流程 | `外贸获客标准路径 \| 录入到开发信草稿` | `录入 → 画像 → 探索 → 评分 → 开发信`。 |
| FAQ | `外贸获客常见问题 \| 智能体、数据与发信边界` | **GEO 三问在前**，排障问答在后。 |

FAQ 必须包含的三问（问句尽量等于用户搜法）：

1. FTCS / 外贸获客智能体是什么？
2. 外贸获客系统和海关数据、领英开发有什么不同？
3. 数据会上传到官网吗？现在能直接发开发信吗？

答案口径：本机智能体、公开网页广撒网与社媒公开摘要发现、人审后出信。对比类问题先讲我们做什么，再点出和其他工具是不同环节。不登录领英、不代替领英开发。

### 2.4 主站（Step 7，外仓库）

- 公司定位：垂直软件服务商，不做泛工具箱。
- 产品矩阵只放 **一张 FTCS 活卡片**，链到 `https://ftcs.ai-utills.com/`。
- 不把「外贸获客系统」当主站 Title 主词（避免和子站抢词）。
- 下线或 `noindex` MFS / 开发者工具。

---

## 3. 分步实现

建议严格按步，每步可单独发版。Step 1–6 都在本仓库 `website/`。

### Step 1 — 口径与 SEO 底座

**目标**：所有页面的 Title / Description 模板能承载词簇，并补 canonical、Open Graph 图、JSON-LD 钩子。先改数据，不大改版式。

**改哪些**

- [x] `website/src/config/site.ts`：补 `siteUrl`、`brandSiteUrl`、`tagline`、别名列表（供 JSON-LD / llms 复用）
- [x] `website/src/composables/usePageSeo.ts`：首页可用「完整 title」（不再强制 `页名 · FTCS · 外贸获客`）；内页仍 `页名 · 产品名`；补 `canonical`、`og:url`、`og:locale`、`og:image`
- [x] 首页 / 下载 / 帮助 / 各文档的 `usePageSeo` 换成 §2 冻结文案
- [x] 新增 JSON-LD 组件或 composable：`SoftwareApplication` + `Organization`（`sameAs` 含主站）+ 别名 `alternateName`

**验收**

- [ ] `npm run build` 后 `node scripts/check-ssg-seo.mjs`：首页 title 含「外贸获客系统」与「智能体」或「Agent」
- [ ] 源码 HTML 有 `rel=canonical`、JSON-LD
- [ ] 无「海关数据」出现在 title / description

**依赖**：无。可先于改版首页发版。

---

### Step 2 — AI 名片：`llms.txt` 与 robots

**目标**：主动告诉爬虫和模型「我是谁、别名叫什么、不能做什么」。

**改哪些**

- [x] 新增 `website/public/llms.txt`（短版：身份、别名、能力、限制、权威 URL）
- [x] 可选 `website/public/llms-full.txt`（把 FAQ 三问 + 五步流水线写全）
- [x] `website/public/robots.txt`：保持 `Allow: /`；增加 `llms.txt` 注释或 Sitemap 旁说明；继续 `Disallow: /updates/`
- [x] `website/public/sitemap.xml` 增加 `https://ftcs.ai-utills.com/llms.txt`（若搜索引擎忽略也无妨，模型爬虫能发现）

**`llms.txt` 怎么写边界**

面向模型和用户都先写能力与适用场景。和其他工具的关系写成「不同环节、互相补位」，不要用「无 / 不 / 非」清单暴露短板。事实仍要准确：获客从产品画像和公开网页出发，开发信经人审后由用户发出。

**验收**

- [ ] 发布后 `https://ftcs.ai-utills.com/llms.txt` 可访问、UTF-8、含别名与限制
- [ ] 与首页 JSON-LD 别名一致

**依赖**：Step 1 的 `siteUrl` / 别名最好已有，避免两套字符串。

---

### Step 3 — 子站首页按效果图改版

**目标**：`HomeView` 对齐效果图信息结构；截图保留；词簇按 §2.1 落地。

**页面块（从上到下）**

1. 深色 Hero：眉标 + H1 + 正文 +「下载桌面版 / 查看流水线」
2. 主视觉：现有产品截图（`public/screenshots/` 或 `docs/design/screenshots/pipeline.png` 拷入 website）
3. 五步流水线：录入 / 画像 / 探索 / 评分 / 开发信草稿（场景文案用效果图；探索用「广撒网 / 社媒发现」，不写未解释的 R1）
4. 闭环三步：资料进本机 → 获客探索 → 人审出信
5. 适合谁 / 从产品出发的优势
6. FAQ 三问（可与 `/docs/faq` 锚点互链，正文不要两套矛盾答案）
7. CTA：下载

**改哪些**

- [x] `website/src/views/HomeView.vue` + `website/src/styles/main.css`
- [x] 角标「META TITLE」**不要做进页面**（只是设计注释）
- [x] Hero 主视觉用真实产品 UI，不用氛围图冒充产品

**验收**

- [ ] 首屏 150 字内同时出现：外贸获客、智能体（或 Agent）、开发信草稿、本机
- [x] 首屏讲清能力与本机优势，对比类问答先讲差异化再点环节分工
- [ ] 无 R1、无 `.env`、无「十分钟」时效承诺
- [ ] 窄屏可读、主 CTA 可点到 `/download`

**依赖**：Step 1 文案；视觉可与 Step 1 同 PR，也可拆开。

---

### Step 4 — 顶栏 / 页脚双轨链接

**目标**：子站露出品牌站，不把下载从主按钮拿走。

**改哪些**

- [x] `website/src/components/SiteHeader.vue`：导航 `功能`（锚到首页流水线）/ `场景`（锚到适合谁）/ `品牌站`（外链 `https://ai-utills.com/`）/ CTA `下载`
- [x] `website/src/components/SiteFooter.vue`：`品牌站 ai-utills.com` · `产品站 ftcs.ai-utills.com` · 现有帮助 / 日志 / 备案

**验收**

- [ ] 每页顶栏可去主站；页脚两个域名都在
- [ ] 下载仍是主按钮

**依赖**：可与 Step 3 同做。

---

### Step 5 — 下载页

**目标**：承接「外贸获客软件 / 下载」；先产品、后前置。

**改哪些**

- [x] `website/src/views/DownloadView.vue`：§2.2 的 title / H1 / 首段
- [x] 保留版本号、Gitee / GitHub、安装包与便携版
- [x] Node / Chrome / OpenCode 放到首段之后，并链到 `/docs/install`
- [x] 增加一句回首页：「了解外贸获客智能体」
- [x] 去掉面向开发者的「请在 `site.ts` 填 url」一类生产文案（无链接时给联系方式即可）

**验收**

- [ ] 预渲染 HTML 的 title / h1 含「外贸获客」
- [ ] 打开页面 5 秒内能理解这是什么软件、如何下载

**依赖**：Step 1。

---

### Step 6 — 帮助信息架构与文档开篇

**目标**：承接「怎么用」；FAQ 同时服务人与 AI。操作步骤保留，只改开篇、Title、内部行话。

**改哪些**

- [x] `website/src/views/DocsIndexView.vue`：§2.3 帮助首页
- [x] `website/src/content/docs-index.ts`：各篇 title / description 带产品名词
- [x] `website/content/docs/getting-started.md`：开篇定义产品；步骤 3 写广撒网 / 社媒发现，不出现未解释的 R1
- [x] `website/content/docs/install.md`：Title/首段带「外贸获客系统安装」
- [x] `website/content/docs/workflow.md`：标准五步路径用语与首页一致
- [x] `website/content/docs/faq.md`：文首插入 §2.3 三问（带稳定 `id`，供首页锚点）；原排障问答下移
- [x] `website/scripts/check-ssg-seo.mjs`：把 `/docs`、`/docs/faq` 纳入抽检

**验收**

- [ ] `/docs/faq` 预渲染 HTML 含三问的完整问句
- [x] 文档中面向客户的段落不出现未解释的「R1」（界面选项须写成「R1 广撒网 / R2 社媒发现」）
- [ ] 首页 FAQ 与文档 FAQ 答案不打架

**依赖**：Step 1；与 Step 3 的首页 FAQ 互链最好同批。

---

### Step 7 — 主站协同（不做）

**状态**：取消。主站 `ai-utills.com` 不在本仓库、本期不管。产品站顶栏「品牌站」外链与页脚域名保留即可，不阻塞本站发版。

**原主站清单（仅备案，不执行）**

- 下线 MFS / 开发者工具
- 产品矩阵只放 FTCS 卡
- 主站 Title 不以「外贸获客系统」做主词

---

### Step 8 — 构建抽检与上线

**目标**：发版后搜索引擎和模型拿到的是预渲染结果，不是空壳 SPA。

**改哪些 / 做哪些**

- [x] 扩展 `website/scripts/check-ssg-seo.mjs`：检查 title、description、h1、canonical、JSON-LD、`dist/llms.txt`；禁止 title 含「海关」
- [x] `website/README.md` 补 llms.txt 地址与本文档链接
- [x] 更新 `sitemap.xml` 的 `<lastmod>`
- [x] 本地 `npm run build` + `npm run check:seo` 退出码 0
- [ ] 走现有官网流水线发布本站
- [ ] 发布后打开：首页、下载、帮助、FAQ、`/llms.txt`、`/robots.txt`、`/sitemap.xml`

**验收**

- [x] 预渲染 HTML 含 H1、description、canonical、JSON-LD
- [ ] 线上查看源代码同样可见（发版后）

**依赖**：Step 1–6 完成后再做一次总检。

---

## 4. 建议实施顺序与切分

| 顺序 | 步骤 | 建议切分 |
|------|------|----------|
| 1 | Step 1 + 2 | 一个 PR：元数据 + llms.txt，用户无感、检索先受益 |
| 2 | Step 4 + 5 + 6 | 一个 PR：下载/帮助/顶栏，版式改动小 |
| 3 | Step 3 | 单独 PR：首页大改，对照效果图 |
| 4 | Step 8 | 本站构建抽检已完成；上线走现有官网流水线 |
| — | Step 7 | **取消**，主站本期不管 |

回到对话里说「做 Step N」即可按该步的清单改代码。

---

## 5. 关键文件索引

| 用途 | 路径 |
|------|------|
| 本计划 | `docs/18-官网GEO-SEO双轨优化.md` |
| UI 稿 | `docs/design/官网UI设计效果图.pen` |
| 站点配置 | `website/src/config/site.ts` |
| SEO 注入 | `website/src/composables/usePageSeo.ts` |
| 首页 | `website/src/views/HomeView.vue` |
| 下载 | `website/src/views/DownloadView.vue` |
| 帮助首页 | `website/src/views/DocsIndexView.vue` |
| 文档元数据 | `website/src/content/docs-index.ts` |
| 文档正文 | `website/content/docs/*.md` |
| 顶栏 / 页脚 | `website/src/components/SiteHeader.vue`、`SiteFooter.vue` |
| robots / sitemap | `website/public/robots.txt`、`sitemap.xml` |
| SSG 路由 | `website/vite.config.ts`、`website/src/router/routes.ts` |
| 抽检 | `website/scripts/check-ssg-seo.mjs` |

---

## 6. 进度

- [x] Step 1 口径与 SEO 底座
- [x] Step 2 llms.txt 与 robots
- [x] Step 3 子站首页改版
- [x] Step 4 顶栏 / 页脚双轨
- [x] Step 5 下载页
- [x] Step 6 帮助与 FAQ
- [x] Step 7 主站协同（取消，本期不管）
- [ ] Step 8 抽检与上线（本地抽检已过，待发布流水线）
