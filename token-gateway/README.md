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
├── ops/                            # 改库 SQL 示例等（运维，随 G0-15）
├── token-gateway-server/           # ★ 可运行 RS 服务（默认端口 8088）
├── token-gateway-db/               # 共享表结构 / Mapper / PO（供 server 与未来 admin）
├── token-gateway-admin/            # 管理端后端占位（本期不打包可执行应用）
└── tokengateway-admin-ui/          # 管理端前端占位（Vue3，本期不实现）
```

## 启动（骨架验收）

本机若 **C: 磁盘已满**，把本地仓库指到 D:（或其它盘）：

```bash
mvn --% -Dmaven.repo.local=D:\maven-repo -DskipTests package
```

```bash
cd token-gateway
# PowerShell：mvn --% -DskipTests package
mvn -q -DskipTests package
# 推荐：直接跑 fat jar（避免 ${revision} / -pl 解析坑）
java -jar token-gateway-server/target/token-gateway-server-1.0.0-SNAPSHOT.jar
# 或：mvn -pl token-gateway-server -am install 后再
#     mvn -pl token-gateway-server spring-boot:run
# 另开终端（PowerShell 用 curl.exe）
curl.exe -s http://127.0.0.1:8088/health
# 期望：{"status":"UP"}
```

本地覆盖：

1. 复制 `token-gateway-server/src/main/resources/application-local.yml.example` → `application-local.yml`
2. 参考 `token-gateway-server/.env.example` 导出环境变量（可选）
3. `java -jar ... --spring.profiles.active=local`

默认**不要求 MySQL**（已排除 DataSource 自动配置）；联库见示例与 US-G0-02。

UC Resource Server 依赖默认**不引入**（保证无 RDC 也能编过）。G0-05 起加 `-Puc-rs` 再 package/install。

## 管理端（占位）

`token-gateway-admin` + `tokengateway-admin-ui`：**本期不实现**，包结构与能力已规划（见 [US-G0-01](./docs/design/US-G0-01-工程骨架设计.md) §2.3）。上线前运维改库须写流水。
