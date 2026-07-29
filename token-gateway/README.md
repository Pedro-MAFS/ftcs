# Token Gateway

外贸获客等消费方共用的 **Token 资源服务器（RS）**：DeepSeek 中转、两档计费（CNY 厘）、按 `name` 多 Key。

## 文档

| 文档 | 说明 |
|------|------|
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
# 先准备 MySQL 库 token_gateway（utf8mb4 / utf8mb4_bin），并配置 MYSQL_*（见 .env.example）
mvn -q -DskipTests package
java -jar token-gateway-server/target/token-gateway-server-1.0.0-SNAPSHOT.jar
# 另开终端（PowerShell 用 curl.exe）
curl.exe -s http://127.0.0.1:8088/health
# 期望：{"status":"UP"}（含 DB 探活）
```

本机若 **C: 磁盘已满**，把本地仓库指到 D:：

```bash
mvn --% -Dmaven.repo.local=D:\maven-repo -DskipTests package
```

本地覆盖：复制 `application-local.yml.example` → `application-local.yml`，按需改账号后加 `--spring.profiles.active=local`。

### 数据库（G0-02 起必连）

1. 配置可达的 MySQL/TiDB（**可与其它业务共库**；表前缀 `token_*`）
2. 账号放 `MYSQL_*` 或 `application-local.yml`（勿把密钥写进已提交的 `application.yml`）
3. 启动即：预建 `token_flyway_schema_history` → 执行 `V1_0_0__init_billing_schema.sql`

改库示例：[`ops/topup_example.sql`](./ops/topup_example.sql)、[`ops/disable_key_by_name.sql`](./ops/disable_key_by_name.sql)。

### API Key 哈希（约定，实现见 G0-06/08）

- 算法：`SHA-256`（小写 hex，64 字符）← `pepper || raw_sk`
- Pepper：环境变量 `GATEWAY_KEY_PEPPER`（生产必填，禁止入库）
- 详情：[US-G0-02 §5](./docs/design/US-G0-02-计费库表与厘单位设计.md)

UC Resource Server 依赖默认**不引入**。G0-05 起加 `-Puc-rs` 再 package/install。

## 管理端（占位）

`token-gateway-admin` + `tokengateway-admin-ui`：**本期不实现**，包结构与能力已规划（见 [US-G0-01](./docs/design/US-G0-01-工程骨架设计.md) §2.3）。上线前运维改库须写流水。
