# token-gateway-admin

运维管理端后端（**US-G6-01**）：独立 Spring Boot，默认端口 **8089**，与 `token-gateway-server` **共库**、**进程分离**。

## 边界

| 项 | 说明 |
|----|------|
| 依赖 | 仅 `token-gateway-db` + Boot Web/Actuator；**无** server / UC RS / sk 鉴权 |
| Flyway | **关闭**；表由 server 迁移 |
| 探活 | `GET /admin/v1/health`（匿名） |
| 前端 | `tokengateway-admin-ui` 构建产物写入 `src/main/resources/static/`，内嵌 Tomcat 同域托管 |
| 详设 | [docs/design/US-G6-01-Admin工程骨架与部署设计.md](../docs/design/US-G6-01-Admin工程骨架与部署设计.md) |

## 启动（含前端静态资源）

```bash
cd token-gateway
# 默认会 npm ci + build UI → static/，再打 jar（需网络下载 Node，首次较慢）
mvn -pl token-gateway-admin -am package

java -jar token-gateway-admin/target/token-gateway-admin-*-SNAPSHOT.jar
# 页面：http://127.0.0.1:8089/
# API ：http://127.0.0.1:8089/admin/v1/health
```

仅改 Java、跳过前端构建：

```bash
mvn -pl token-gateway-admin -am package "-DskipAdminUi=true"
```

只构建前端到 static（不打 jar）：

```bash
cd tokengateway-admin-ui
npm run build
# 输出目录：../token-gateway-admin/src/main/resources/static/
```

本地 profile：复制 `src/main/resources/application-local.yml.example` → `application-local.yml`。

环境变量见 [`.env.example`](./.env.example)。

## 发布包

```bash
mvn -pl token-gateway-admin -am package
# 产物：target/token-gateway-admin-<version>-dist.zip
```

解压后 `./start.sh` / `./stop.sh`。
