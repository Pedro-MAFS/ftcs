# Token Gateway 管理端前端

> **状态**：Vue3 + Vite 脚手架已初始化；业务页为占位，完整实现见 **US-G6-08 / US-G6-09**。  
> **后端衔接**：[docs/design/US-G6-01-Admin工程骨架与部署设计.md](../docs/design/US-G6-01-Admin工程骨架与部署设计.md) §3.3  
> **构建输出**：直接写入 [`../token-gateway-admin/src/main/resources/static/`](../token-gateway-admin/src/main/resources/static/)（随 admin jar / 内嵌 Tomcat 托管）

## 开发

```bash
cd token-gateway/tokengateway-admin-ui
npm install
npm run dev
# http://127.0.0.1:5173  （proxy /admin → :8089）
```

请先启动 admin。看板页会请求 `GET /admin/v1/health`。

## 构建（集成到 admin）

```bash
npm run build
# → ../token-gateway-admin/src/main/resources/static/{index.html,assets/...}
```

或在父工程打包 admin（自动构建 UI）：

```bash
cd ../token-gateway-admin
mvn package
# 等价于 frontend-maven-plugin：npm ci + npm run build，再打 fat jar
```

跳过 UI：`mvn package -DskipAdminUi=true`

## 目录

```
tokengateway-admin-ui/
├── package.json
├── vite.config.ts      # outDir → admin/.../static
├── .env.example
├── index.html
└── src/
    ├── api/
    ├── components/
    ├── router/
    └── views/
```
