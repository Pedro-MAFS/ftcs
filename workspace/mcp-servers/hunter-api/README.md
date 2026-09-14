# @ftcs/hunter-api

Hunter.io REST API 的本地 MCP 封装（BYOK，联系人 Enrichment）。

详细设计见 `docs/design/US-C-02-hunter-api-MCP.md`。

## 工具

| 工具 | 说明 | 计费 |
| --- | --- | --- |
| `domain_search` | 按域名查公开邮箱（裁剪 sources ≤5，24h 缓存） | 1 credit/次 |
| `email_verifier` | 单邮箱验证（202 自动轮询 ≤24s） | 0.5 credit/次 |
| `account_info` | 账户/配额（多 Key 时逐 Key 报告） | 免费 |

## 配置（BYOK，可多 Key）

- `HUNTER_API_KEYS`：逗号分隔多个 Key，顺序即优先级；429/401 自动切换下一个
- `HUNTER_API_KEY`：存量单 Key 兼容（与多 Key 并存时排在其后）

桌面端在「设置 → 集成」填写（US-C-03 接线）；无 Key 时工具返回结构化错误
`HUNTER_NO_KEY`，进程保持存活。

## Key 池

- 状态文件：`data/cache/hunter/key-pool.json`，只存 Key 的 sha256 指纹（不落盘明文）
- 429 → 免费调 `/account` 学习 `reset_date` 并标记 exhausted，到重置日自动恢复
- 401 → 标记 invalid（直至用户改配置）
- 403/400/451/5xx 不切换 Key，直接映射错误码

## 缓存

`domain_search` 结果写 `data/cache/hunter/domain-search/`，TTL 24h，
缓存键只含域名+参数（与 API Key 无关，多 Key 共享），读写异常静默降级为直调。

## 开发

```bash
npm install
npm test        # build:tsc + node --test（client / key-pool / cache）
npm run build   # esbuild 打包 dist/mcp.js（MCP 运行时入口）
```

## 错误码

`HUNTER_NO_KEY` / `HUNTER_UNAUTHORIZED` / `HUNTER_QUOTA_EXCEEDED`（单 Key 429）/
`HUNTER_ALL_KEYS_EXHAUSTED`（多 Key 全用尽）/ `HUNTER_RATE_LIMITED` /
`HUNTER_INVALID_PARAMS` / `HUNTER_PAGINATION_ERROR` / `HUNTER_CLAIMED_EMAIL` /
`HUNTER_SMTP_RETRYABLE` / `HUNTER_UPSTREAM_ERROR`

Agent 对 quota 类错误应停止批量循环并提示用户充值/加 Key。
