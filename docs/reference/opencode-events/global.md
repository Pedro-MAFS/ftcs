# Global 信封格式

> **订阅**：`GET /global/event`  
> **TS 类型**：`GlobalEvent`  
> **总览**：[README](./README.md) · **何时触发**：[triggers.md](./triggers.md)

Global 在事件 **外面** 再包一层项目上下文。内层 `payload` 可能是 **Legacy 形事件**，也可能是 **Sync 形包装**（见 [sync.md](./sync.md)）。

---

## 1. 根 JSON 结构

```typescript
interface GlobalEnvelope {
  directory: string           // 项目目录绝对路径
  project?: string
  workspace?: string
  payload: GlobalPayload      // 内层，见 §2
}
```

### 识别条件

- 根上有 **`directory`**
- 事件内容在 **`payload`** 里，不在根上直接读 `type`

### 示例 A：payload 为 Legacy 形

```jsonc
{
  "directory": "/home/user/my-project",
  "project": "optional-project-id",
  "workspace": "optional-workspace-id",
  "payload": {
    "id": "evt-001",
    "type": "message.part.updated",
    "properties": {
      "sessionID": "ses-abc",
      "time": 1710000000000,
      "part": { "type": "text", "text": "..." }
    }
  }
}
```

解析：读 `payload` → 按 [legacy.md](./legacy.md) 处理。

### 示例 B：payload 为 Sync 形

```jsonc
{
  "directory": "/home/user/my-project",
  "payload": {
    "type": "sync",
    "id": "sync-wrap-001",
    "syncEvent": {
      "type": "message.part.updated.1",
      "id": "evt-001",
      "seq": 42,
      "aggregateID": "agg-xyz",
      "data": {
        "sessionID": "ses-abc",
        "part": { "..." },
        "time": 1710000000000
      }
    }
  }
}
```

解析：读 `payload` → 按 [sync.md](./sync.md) 处理。

---

## 2. 内层 payload 的两种形态

| payload 形态 | 识别 | 后续文档 |
|--------------|------|----------|
| Legacy 形 | `payload.type` ≠ `"sync"`，有 `properties` | [legacy.md](./legacy.md) |
| Sync 形 | `payload.type === "sync"`，有 `syncEvent` | [sync.md](./sync.md) |

Global **本身不定义第三种载荷键名**；它只增加 `directory` / `project` / `workspace`。

---

## 3. Global 根字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `directory` | `string` | 必填，OpenCode 项目根路径 |
| `project` | `string` | 可选 |
| `workspace` | `string` | 可选 |

消费 Global 时通常：

1. 用 `directory` 过滤/路由到本地项目
2. 再解析 `payload`

---

## 4. 事件 type 目录

Global **没有独立的 `type` 清单**。`payload` 内出现的 `type` 来自：

- [Legacy 分册](./legacy.md) 全部 type（经 `payload.properties`）
- 或 [Sync 分册](./sync.md) 的 `sync` + `syncEvent.type`（`.1` 后缀子集）

Global 流 **可能** 推送 Legacy 形事件，**也可能** 推送 Sync 形 durable 批次；同一连接内两种 `payload` 形态可并存。

---

## 5. SDK 类型

```typescript
export type GlobalEvent = {
  directory: string
  project?: string
  workspace?: string
  payload: { id, type, properties } | … | SyncEvent…
}
```

详见 `types.gen.d.ts` 中 `GlobalEvent` 的 `payload` union。

---

## 6. 解析流程（仅 Global 信封）

```
1. 解析 SSE JSON 根对象
2. 断言存在 directory → 这是 Global 信封
3. 读取 payload
4. 若 payload.type === "sync" → 转 sync.md 流程
5. 否则 → 转 legacy.md 流程（payload 即 Legacy 事件）
6. 业务逻辑可使用 directory / project / workspace
```
