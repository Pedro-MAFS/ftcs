# FTCS 官网（website）

Vue 3 + Vite 纯静态站：功能展示、帮助文档、软件下载。

**部署路径**：默认按 nginx `html/ftcs/` 子目录发布（Vite `base: '/ftcs/'`）。构建使用 **vite-ssg** 预渲染各路由 HTML，便于搜索引擎抓取 H1 与正文。

## 开发

```powershell
cd website
npm install
npm run dev
```

浏览器打开：**http://localhost:5173/ftcs/**（注意带 `/ftcs/` 前缀）。

## 构建

```powershell
npm run build
npm run preview
```

产物在 `website/dist/`。预览地址同样为 `http://localhost:4173/ftcs/`。

构建使用 **vite-ssg** 预渲染各路由为静态 HTML（`dirStyle: 'nested'`，如 `download/index.html`），源码中即含 `<h1>` 与各页 `title` / `description`，便于搜索引擎收录。新增文档时请同步：

1. `src/content/docs-index.ts` 与 `content/docs/*.md`
2. `vite.config.ts` → `ssgOptions.includedRoutes`
3. `public/sitemap.xml`

本地可跑 `node scripts/check-ssg-seo.mjs` 抽检 `dist` 内 title / description / h1。

## SEO（robots / sitemap）

构建后会随 `public/` 发布：

| 文件 | 线上地址 |
|------|----------|
| `robots.txt` | https://ai-utills.com/ftcs/robots.txt |
| `sitemap.xml` | https://ai-utills.com/ftcs/sitemap.xml |

域名根 `https://ai-utills.com/robots.txt`（主站）需包含 `Sitemap: https://ai-utills.com/ftcs/sitemap.xml`，搜索引擎才会从根目录发现本站地图。文档增删后请同步更新 `public/sitemap.xml` 的 `<loc>` / `<lastmod>`。

## 部署到 Nginx（html/ftcs）

1. 构建：`npm run build`
2. 将 `dist/` **内全部文件**拷到服务器 nginx html 下的 `ftcs` 目录，例如：

```text
/usr/share/nginx/html/ftcs/
  index.html
  assets/
  icon.png
  screenshots/
  ...
```

3. Nginx 需支持 SPA history 回退（刷新 `/ftcs/docs` 等路径不 404）。文件放在 `html/ftcs/` 时推荐：

```nginx
location /ftcs/ {
    root /usr/share/nginx/html;
    try_files $uri $uri/ /ftcs/index.html;
}
```

访问：`https://你的域名/ftcs/`

> 若将来改挂到站点根目录，把 `vite.config.ts` 的 `base` 改为 `'/'` 后重新构建即可。

## 配置下载链接

编辑 [`src/config/site.ts`](src/config/site.ts)，为每个产物配置 `mirrors`（Gitee / GitHub）。`url` 留空则该镜像按钮禁用；全部为空时显示「链接待配置」：

```ts
{
  id: 'setup',
  label: 'Windows 安装包',
  filename: '外贸获客-Setup-0.4.1.exe',
  note: 'NSIS 安装程序',
  mirrors: [
    {
      id: 'gitee',
      label: 'Gitee 下载',
      badge: '国内更快',
      primary: true,
      url: 'https://gitee.com/.../releases/download/0.4.1/foreign-trade-Setup-0.4.1.exe',
    },
    {
      id: 'github',
      label: 'GitHub 下载',
      url: 'https://github.com/.../releases/download/0.4.1/foreign-trade-Setup-0.4.1.exe',
    },
  ],
}
```

无需后端；改完后重新 `npm run build` 并发布 `dist/`。

## 桌面端更新清单

发版时同步更新 [`public/updates/latest.json`](public/updates/latest.json)（部署后地址：`https://ai-utills.com/ftcs/updates/latest.json`）：

```json
{
  "version": "0.4.1",
  "releasedAt": "2026-08-09",
  "minVersion": "0.1.0",
  "title": "FTCS Desktop 0.4.1",
  "notes": ["更新说明条目"],
  "downloadPage": "https://ai-utills.com/ftcs/download/"
}
```

桌面端启动后会拉取该文件；若远程 `version` 高于本地 `app.getVersion()`，在标题栏下方提示并引导打开下载页。

## 帮助文档

Markdown 源文件：`content/docs/*.md`  
目录元数据：`src/content/docs-index.ts`

## 发布日志

页面：`/changelog`（数据源 [`src/config/changelog.ts`](src/config/changelog.ts)）。

- **从 0.5.0 起记录**，不补更早版本。  
- 用户可选择「我的版本」与「目标版本」查看区间差异。桌面端更新横幅会带 `?from=&to=` 打开此页。  
- 发版时：在 `changelogReleases` **数组头部**追加一条，并同步 [`public/updates/latest.json`](public/updates/latest.json) 的 `notes`。

## 产品截图

放在 `public/screenshots/`，首页会按流程引用：

| 文件 | 用途 |
|------|------|
| `ftcs-线索.png` | Hero 主图 + 线索步骤 |
| `ftcs-录入.png` / `ftcs-产品画像.png` / `ftcs-线索探索.png` / `ftcs-邮件.png` | 功能展示 |
| `ftcs-设置.png` | 本机配置说明 |
