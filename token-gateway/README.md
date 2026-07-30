# Token Gateway

外贸获客等消费方共用的 **Token 资源服务器（RS）**：DeepSeek 中转、两档计费（CNY 厘）、按 `name` 多 Key。

## 文档

| 文档 | 说明 |
|------|------|
| **服务内对接页** | 启动后打开 `http://127.0.0.1:8088/` 或 `/home.html`（基本逻辑 + 已实现接口出入参；**无需登录**） |
| [docs/01-需求.md](./docs/01-需求.md) | 网关需求规格（权威） |
| [docs/02-用户故事.md](./docs/02-用户故事.md) | G0 / G2 用户故事与依赖 |
| [docs/design/](./docs/design/) | 详细设计（按用户故事） |

消费方（桌面端）对接文档在宿主仓库：

- `docs/11-官方模型通道对接.md`
- `docs/12-官方模型通道用户故事.md`

## 本期边界

- **管理端仅占位**：`token-gateway-admin` + `tokengateway-admin-ui` 预留模块，**本期不实现业务**；充值/禁用/调价 **直接改库**（须写流水）
- 上游仅 DeepSeek
- 身份来自用户中心（网关是 UC 的 Resource Server，不是 OAuth Client）
- Web 栈：Spring **WebMVC**（SSE 用 `SseEmitter`）
- 根包：`com.mfs.tokengateway`

## 模块

```
token-gateway/                      # 外层：文档 + Maven 父工程
├── README.md
├── pom.xml
├── docs/
├── ops/                            # 改库 SQL 示例等（运维）
├── token-gateway-server/           # ★ 可运行 RS 服务（默认端口 8088）
├── token-gateway-db/               # 共享表结构 / Mapper / PO（供 server 与未来 admin）
├── token-gateway-admin/            # 管理端后端占位（本期不打包可执行应用）
└── tokengateway-admin-ui/          # 管理端前端占位（Vue3，本期不实现）
```

## 启动

```bash
cd token-gateway
# 先准备 MySQL（utf8mb4 / utf8mb4_bin），并配置 MYSQL_*（见 .env.example）
mvn -q -DskipTests package
java -jar token-gateway-server/target/token-gateway-server-1.0.0-SNAPSHOT.jar
```

本机若 **C: 磁盘已满**，把本地仓库指到 D:：

```bash
mvn --% -Dmaven.repo.local=D:\maven-repo -DskipTests package
```

本地覆盖：复制 `application-local.yml.example` → `application-local.yml`，按需改账号后加 `--spring.profiles.active=local`。

> **探活（US-G0-14）**：正式环境须 `-Puc-rs`，`GET /health` 需要 UC JWT（见下文）。未加 `-Puc-rs` 时骨架全放行，仅便于编译冒烟，**不能**当生产鉴权。

### 数据库（G0-02 起必连）

1. 配置可达的 MySQL/TiDB（**可与其它业务共库**；表前缀 `token_*`）
2. 账号放 `MYSQL_*` 或 `application-local.yml`（勿把密钥写进已提交的 `application.yml`）
3. 启动即：预建 `token_flyway_schema_history` → 执行 `V1_0_0__init_billing_schema.sql`

改库示例：[`ops/topup_example.sql`](./ops/topup_example.sql)、[`ops/disable_key_by_name.sql`](./ops/disable_key_by_name.sql)。

### API Key 哈希与签发（US-G0-06）

- 算法：`SHA-256`（小写 hex，64 字符）← `pepper || raw_sk`（无分隔符）
- Pepper：环境变量 `GATEWAY_KEY_PEPPER` → `token-gateway.key.pepper`（生产必填；未配置则 `rotate` 返回 500）
- 接口：`POST /v1/keys/rotate` + UC JWT + `{"name":"ftcs-desktop"}`
  - 无该 name → 创建账户（若需要）并 **创建** Key，`action=created`，响应含明文 `api_key`
  - 已有该 name → **原地重置** hash（旧 sk 立即失效），`action=rotated`，响应含新明文
- **客户端注意**：每次成功都会作废旧 sk；本地已有可用 Key 时勿在每次启动盲目调用
- 详情：[US-G0-06 设计](./docs/design/US-G0-06-按名签发重置Key设计.md)

```bash
# 需 -Puc-rs、OAUTH_JWK_KEY、GATEWAY_KEY_PEPPER、可达 MySQL
curl.exe -s -X POST http://127.0.0.1:8088/v1/keys/rotate ^
  -H "Authorization: Bearer %ACCESS_TOKEN%" ^
  -H "Content-Type: application/json" ^
  -d "{\"name\":\"ftcs-desktop\"}"
```

### 用户中心 RS（US-G0-05）

- 依赖：`embed-oauth-resource-starter`（需 Aliyun RDC）。构建/运行加 **`-Puc-rs`**
- 验签：与 AS **相同**的 `OAUTH_JWK_KEY`（`com.mfs.user.oauth.jwk-key`，HS256）；当前 UC 不走非对称 JWKS 主路径
- Issuer：`UC_ISSUER_URI`（同时驱动 `token-gateway.user-center.issuer-uri` 与 `com.mfs.user.oauth.issuer`）
- JWT 保护路径：`/v1/keys/**`、`/v1/auth/**`、**`/health`**、**`/actuator/health/**`**（**不含** Chat / usage）
- 冒烟：`GET /v1/auth/whoami` + `Authorization: Bearer {access_token}`
- Scope：本故事暂不强制 `@RequireScope`；后续可收紧 `token-gateway:keys`
- Claim：`tenant_id` + `user_code` → 内部 `UcIdentity`；详见 [US-G0-05 设计](./docs/design/US-G0-05-作为RS校验用户中心JWT设计.md)

```bash
# PowerShell
mvn --% -Dmaven.repo.local=D:\maven-repo -Puc-rs -DskipTests package
# 配置 OAUTH_JWK_KEY、GATEWAY_KEY_PEPPER 后启动，再：
curl.exe -s -H "Authorization: Bearer %ACCESS_TOKEN%" http://127.0.0.1:8088/v1/auth/whoami
curl.exe -s -H "Authorization: Bearer %ACCESS_TOKEN%" http://127.0.0.1:8088/health
# 期望：{"status":"UP"}；无 Token 应为 401
```

未加 `-Puc-rs` 时仅骨架可编译；安全链为临时全放行，**不能**当作正式鉴权。

### 可观测（US-G0-14）

- 响应头 **`X-Request-Id`**（可入站合法值，否则服务端 UUID）；日志 Pattern 含 `[%X{requestId}]`，便于检索
- Log4j2（对齐 `docs/reference/log4j2-spring.xml`）：
  - **Console** + **RollingFile**（`logs/{app}.log`，按日/50MB 滚动，保留约 30 份 gzip）
  - **ErrorFile**（仅 ERROR → `logs/{app}-error.log`）
  - 目录：`logging.file.path` / 环境变量 `LOGGING_FILE_PATH`（默认 `logs`）
- `/health`、`/actuator/health/**` 不打访问 INFO（避免探针刷盘）
- **禁止**日志出现 prompt/completion 正文、Authorization / 上游 Key 明文
- 进程守护优先端口/进程探测；HTTP 探活须带 UC JWT（勿把个人 Token 写入仓库）
- 设计：[US-G0-14](./docs/design/US-G0-14-健康检查与结构化日志设计.md)

## 管理端（占位）

`token-gateway-admin` + `tokengateway-admin-ui`：**本期不实现**，包结构与能力已规划（见 [US-G0-01](./docs/design/US-G0-01-工程骨架设计.md) §2.3）。上线前运维改库须写流水。
