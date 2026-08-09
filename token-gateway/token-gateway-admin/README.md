# token-gateway-admin

运维管理端后端（**US-G6-01** 骨架 + **US-G6-04** 用户 + **US-G6-10** 价目）：独立 Spring Boot，默认端口 **8089**，与 `token-gateway-server` **共库**、**进程分离**。

## 边界

| 项 | 说明 |
|----|------|
| 依赖 | 仅 `token-gateway-db` + Boot Web/Actuator；**无** server / UC RS / sk 鉴权 |
| Flyway | **关闭**；表由 server 迁移 |
| 探活 | `GET /admin/v1/health`（匿名） |
| 用户 | `GET/PATCH /admin/v1/users*`（列表/详情/启停；无删户） |
| 价目 | `GET/POST /admin/v1/prices`（只 INSERT；Chat + `tavily.search` 方案 A） |
| 前端 | `tokengateway-admin-ui` 构建产物写入 `src/main/resources/static/`，内嵌 Tomcat 同域托管 |
| 详设 | [US-G6-01](../docs/design/US-G6-01-Admin工程骨架与部署设计.md) · [US-G6-04](../docs/design/US-G6-04-用户管理设计.md) · [US-G6-10](../docs/design/US-G6-10-价目管理设计.md) |

## 用户 API（US-G6-04）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/admin/v1/users` | 分页；`q` / `status` / `tenant_id` / `user_code` |
| GET | `/admin/v1/users/{id}` | 详情 + Key 计数摘要 |
| PATCH | `/admin/v1/users/{id}/status` | `active`/`disabled`；必填 `operator`/`note` |

禁用账户后 sk 调用返回 **403** `account_disabled`；无物理删除、无建户、无改余额。

## 价目 API（US-G6-10）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/admin/v1/prices` | 当前生效价；`include_history=true` 含历史/预约 |
| GET | `/admin/v1/prices/{model}` | 单 model 时间线（支持 `tavily.search`） |
| POST | `/admin/v1/prices` | **仅 INSERT**；必填 `operator`/`note`；禁止改删历史 |

- Chat：`billing_unit=per_mtok`，单位厘/MTok（或元/MTok 由服务换算）。
- 搜索：`model=tavily.search` 且 `billing_unit=per_call`（厘/次 → 库内 ×1e6）。
- 白名单：`token-gateway.admin.prices.allowed-models`（默认 flash / pro / tavily.search）。
- 应急 SQL 仍见 `ops/insert_*_price_*.sql`。

## 启动（含前端静态资源）

```bash
cd token-gateway
# 默认会 npm ci + build UI → static/，再打 jar（需网络下载 Node，首次较慢）
mvn -pl token-gateway-admin -am package

java -jar token-gateway-admin/target/token-gateway-admin-*-SNAPSHOT.jar
# 页面：http://127.0.0.1:8089/
# API ：http://127.0.0.1:8089/admin/v1/health
# 用户：http://127.0.0.1:8089/admin/v1/users
# 价目：http://127.0.0.1:8089/admin/v1/prices
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
