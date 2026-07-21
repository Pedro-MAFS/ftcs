# FTCS 官网（website）

Vue 3 + Vite 纯静态站：功能展示、帮助文档、软件下载。

**部署路径**：默认按 nginx `html/ftcs/` 子目录发布（Vite `base: '/ftcs/'`）。

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
  filename: '外贸获客-Setup-0.2.2.exe',
  note: 'NSIS 安装程序',
  mirrors: [
    {
      id: 'gitee',
      label: 'Gitee 下载',
      badge: '国内更快',
      primary: true,
      url: 'https://gitee.com/.../releases/download/0.2.2/foreign-trade-Setup-0.2.2.exe',
    },
    {
      id: 'github',
      label: 'GitHub 下载',
      url: 'https://github.com/.../releases/download/0.2.2/foreign-trade-Setup-0.2.2.exe',
    },
  ],
}
```

无需后端；改完后重新 `npm run build` 并发布 `dist/`。

## 桌面端更新清单

发版时同步更新 [`public/updates/latest.json`](public/updates/latest.json)（部署后地址：`https://ai-utills.com/ftcs/updates/latest.json`）：

```json
{
  "version": "0.3.0",
  "releasedAt": "2026-07-20",
  "minVersion": "0.1.0",
  "title": "FTCS Desktop 0.3.0",
  "notes": ["更新说明条目"],
  "downloadPage": "https://ai-utills.com/ftcs/download/"
}
```

桌面端启动后会拉取该文件；若远程 `version` 高于本地 `app.getVersion()`，在标题栏下方提示并引导打开下载页。

## 帮助文档

Markdown 源文件：`content/docs/*.md`  
目录元数据：`src/content/docs-index.ts`

## 产品截图

放在 `public/screenshots/`，首页会按流程引用：

| 文件 | 用途 |
|------|------|
| `ftcs-线索.png` | Hero 主图 + 线索步骤 |
| `ftcs-录入.png` / `ftcs-产品画像.png` / `ftcs-线索探索.png` / `ftcs-邮件.png` | 功能展示 |
| `ftcs-设置.png` | 本机配置说明 |
