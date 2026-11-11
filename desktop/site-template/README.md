# 独立站项目

这是当前 FTCS 工作区的独立站项目，使用 Vue、Vite、Vue Router 和 vite-ssg。可以根据需要修改页面、增加产品详情页或替换技术栈。

## 运行

FTCS 使用其配置的 Node/npm。此模板需要 Node 22.12 及以上的 22.x，或 Node 24 及以上；推荐使用 FTCS 的 Node 24 运行时。自行在终端运行时，请先准备兼容的 Node/npm，并在本目录执行：

```sh
npm ci
npm run dev
npm run build
```

首次安装依赖通常需要联网。`npm run dev` 提供本地开发服务；`npm run build` 将静态网站生成到 `dist/`。若替换框架，请保留这两个 npm 命令，并在 FTCS 站点设置中更新静态产物目录。

## 目录

- `src/main.ts`：应用入口和路由；`src/pages/`：页面。
- `public/`：原样复制到网站根目录的公开资源。
- `dist/`：构建产物，不提交到 Git。
- `public/robots.txt`：爬虫规则；`public/llms.txt` 和 `public/llms-full.txt`：网站公开内容的 AI 访问模板，请随网站内容维护。
- `seo/sitemap.xml.template`：站点地图模板，不直接发布。

## 站点地址和地图

在本地构建环境或 Cloudflare 构建环境中设置 `SITE_URL`，填写已确认的网站完整地址（如 `https://your-site.pages.dev` 或自己的域名）。未设置时正常构建，但不会生成地图或虚假的 sitemap 声明。配置后构建会按公开路由生成 `dist/sitemap.xml` 并在构建结果中的 `robots.txt` 添加地图地址；源 `public/robots.txt` 不会被修改。域名变化后请更新 `SITE_URL` 并重新构建。

为动态产品详情页添加路由时，需在 `vite.config.ts` 中通过 `includedRoutes` 根据构建时可用的产品数据枚举实际路径；预渲染和 sitemap 共用该清单。每个页面使用 `@unhead/vue` 设置标题和描述，并检查生成的 HTML。构建时不支持的浏览器 API 应只在客户端执行。

站点源码、图片和上述公开文件可能被发布到互联网，不要写入密码、Token 或不准备公开的资料。
