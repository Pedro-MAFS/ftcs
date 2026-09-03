# OpenCode Event 格式参考（总览）

> **SDK**：`@opencode-ai/sdk@1.18.1` · **类型文件**：`dist/v2/gen/types.gen.d.ts`  
> **在线**：[OpenCode Server — Events](https://opencode.ai/docs/server/)

OpenCode 通过 SSE 推送 JSON。根 JSON 有 **四种互斥的外层形状**（四种「信封」）。先认信封，再读里面的 `type` 和载荷。

---

## 四种信封一览

| 信封 | 文档 | 订阅 | 你怎么认出根 JSON |
|------|------|------|------------------|
| **Legacy** | [legacy.md](./legacy.md) | `GET /event` · `client.event.subscribe()` | 根对象有 `type` + **`properties`**，无 `directory` |
| **V2** | [v2.md](./v2.md) | `GET /api/event` · `client.v2.event.subscribe()` | 根对象有 `type` + **`data`**（可有 `durable`、`location`） |
| **Global** | [global.md](./global.md) | `GET /global/event` | 根对象有 **`directory`**，事件在 **`payload`** 里（内层为 Legacy 或 Sync 形） |
| **Sync** | [sync.md](./sync.md) | 出现在 Global 等 durable 流中 | 根对象 **`type === "sync"`**，真实事件在 **`syncEvent`** 里 |

---

## 心智模型（只比较外壳，不混写载荷）

```
SSE 一行 JSON
    │
    ├─ 有 directory？ ──yes──► Global 信封 → 读 payload → 可能是 Legacy 或 Sync
    │
    ├─ type === "sync"？ ──yes──► Sync 信封 → 读 syncEvent
    │
    ├─ 有 properties？ ──yes──► Legacy 信封
    │
    └─ 有 data？ ──yes──► V2 信封
```

---

## 四种信封之间的关系（不是混写，是嵌套/并行）

| 关系 | 说明 |
|------|------|
| Legacy ↔ V2 | **并行**两套端点；同一 `type` 字符串，载荷字段相同，仅键名 `properties` / `data` 不同 |
| Global → Legacy | Global **外包**一层；`payload` 内是 Legacy 形事件 |
| Global → Sync | Global 的 `payload` **有时**是 Sync 形（`type: "sync"`），再剥 `syncEvent` |
| Sync 与 Legacy | Sync 内层 `syncEvent.data` 与 Legacy 的 `properties` **同构**；但 `type` 常带 **`.1`** 后缀，且 **事件子集更少**（无流式 delta） |

---

## 共享内容（不是信封）

| 文档 | 内容 |
|------|------|
| [nested-types.md](./nested-types.md) | 载荷里的 `Part`、`Message`、`Session` 等结构 |
| [triggers.md](./triggers.md) | 每种 `type` **何时触发**（与信封无关） |

---

## 分册阅读指引

| 你要做什么 | 读哪册 |
|------------|--------|
| FTCS 桌面端当前用的 `/event` 流 | [legacy.md](./legacy.md) |
| 新 V2 API `/api/event` | [v2.md](./v2.md) |
| 多项目 / 带 directory 的全局流 | [global.md](./global.md) |
| durable 回放、`.1` 后缀事件 | [sync.md](./sync.md) |
| 查 `part` / `tool` 状态结构 | [nested-types.md](./nested-types.md) |
| 查某个 type 什么时候会发 | [triggers.md](./triggers.md) |

---

## 维护

升级 `@opencode-ai/sdk` 后，分别 diff `Event`、`V2Event`、`GlobalEvent` 及 `SyncEvent*` 类型，更新对应分册。

旧单文件入口：[../opencode-sdk-events.md](../opencode-sdk-events.md)（已改为指向本目录）。
