# Token Gateway 管理端前端（占位）

**本期不实现。** 仅预留目录与规划；运营阶段再脚手架。

## 规划

| 项 | 决定 |
|----|------|
| 技术 | Vue3 + Vite |
| 对接 | 仅 `token-gateway-admin`（不直连 server 消费 API） |
| 能力 | 充值/余额、Key 禁用启用、价目、流水只读 |
| 鉴权 | 管理身份（与桌面端 UC / `sk-` 分离） |

本期运维：**直接改库**，且 **必须写流水**。

## 落地时建议目录

```
tokengateway-admin-ui/
├── package.json
├── vite.config.ts
├── index.html
├── src/
│   ├── main.ts
│   ├── App.vue
│   ├── api/          # 调 admin 后端
│   ├── views/        # 账户 / Key / 价目 / 流水
│   └── router/
└── README.md
```
