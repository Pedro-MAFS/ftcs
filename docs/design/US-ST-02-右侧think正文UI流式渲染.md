# US-ST-02 详细设计：右侧 think / 正文 UI 流式渲染

> **用户故事**：作为外贸业务员，我想在右侧面板看到 think 与正文边出边显示，以便确认 Agent 仍在工作并提前阅读内容。  
> **范围**：消费 US-ST-01 已合并的时间线快照；保证增量过程中面板可持续刷新、可感知「还活着」；函数调用块仍整段。  
> **依赖**：[25-需求-Agent流式输出.md](../25-需求-Agent流式输出.md) ST1～ST6、US-ST-02；**US-ST-01**；UI：`desktop/src/components/layout/AgentPanel.vue`。  
> **不在本期**：改事件类型/协议；工具增量；重做 Agent 视觉；Markdown 富渲染（现网为 `<pre>` 纯文本）。  
> **文档位置**：`docs/design/`  
> **状态**：**已确认待开发**

---

## 0. 相对现网

| 现网 | **本期（ST-02）** |
|------|-------------------|
| `emit({ type:'timeline', items })` → AgentPanel 列表；body 为 `<pre>` | 继续该管道；增量期间 items 更频，需**节流 flush** + 贴底滚动保持 |
| reasoning 默认可折叠预览 | 流式进行中：**展开或跟滚可见增长**（见 Q3），结束后可恢复折叠策略 |
| 无「打字中」指示 | 靠正文/思考 **length 持续变化** 满足「还活着」；可选极轻 `streaming` 态（非必须） |

---

## 1. 目标与非目标

### 1.1 目标

1. think / 正文随时间线更新逐步显示，非整段闪现。  
2. 同一条目无双份（依赖 ST-01 合并）。  
3. 长输出可感知仍在工作。  
4. 结束后文案与 ST-01 终态一致。  
5. 工具卡仍整段出现。

### 1.2 非目标

| 不做 | 说明 |
|------|------|
| 自己解析 OpenCode 事件 | 只信主进程 timeline |
| Markdown 半截渲染策略 | 现网非 MD；若未来上 MD 另开故事 |
| 重绘面板布局 / 主题 | — |

---

## 2. 已确认选型（Q 表）

| 项 | 决定 |
|----|------|
| **Q1 数据源** | 仅 ST-01 发出的 `timeline` 快照；渲染进程不订 SSE |
| **Q2 节流** | 主进程对 **delta 触发的 flush** 做 ≤ **50ms** 合并（`scheduleFlush`）；`updated` / error / removed / 任务结束 **立即 flush** |
| **Q3 流式中 reasoning** | 该卡 `body` 正在增长时强制视为展开（或忽略 collapsed 预览），避免只看到 160 字 preview 像卡住；`updated` 终态后若 `length > COLLAPSE_BODY_CHARS` 可再按现网折叠。**注**：2026-10-03 明确规则移至 **US-ST-01 §3.1.5** |
| **Q4 贴底** | 保持现网 `pinToBottom`：用户未上滚时跟滚 |
| **Q5 Markdown** | 继续纯文本 `<pre>`；O2 关闭 |
| **Q6 进行中态** | 不强制新 UI 控件；验收以文本持续变化为准。若节流后仍「看起来死」：在会话 busy 且最近 1s 有 delta 时给对应卡加轻量 `status: 'streaming'`（可选，实现时可先不做） |
| **Q7 改动面** | 优先改 `agent-runner` 的 flush 调度；AgentPanel 仅在 Q3/Q6 需要时小改 |

---

## 3. 数据流

```text
delta / updated（ST-01）
  → TimelineBuilder.upsert
  → scheduleFlush(50ms) 或 flushNow
  → emit timeline items
  → AgentPanel 列表 diff 渲染
```

---

## 4. 改动文件

| 路径 | 改动 |
|------|------|
| `desktop/electron/opencode/agent-runner.ts` | `scheduleFlush` / `flushNow`；桥停止时 flush 干净 |
| `desktop/src/components/layout/AgentPanel.vue` | 按需：流式中 reasoning 展开（Q3） |
| `docs/25` | US-ST-02 → 详设已立 |

---

## 5. 验收对照

| 验收要点 | 落点 |
|----------|------|
| think/正文逐步显示 | ST-01 + §2 Q2～Q3 |
| 无双份 | ST-01 |
| 工具整段 | ST-01 |
| 可感知还活着 | Q2～Q6 |
| 终态一致 | ST-01 updated 覆盖 |

---

## 6. 测试计划

| # | 场景 | 期望 |
|---|------|------|
| T1 | 长正文流式 | 右侧持续变长，贴底跟滚 |
| T2 | 长 thinking | 可见增长（非仅 preview） |
| T3 | 结束后折叠 | 超长 reasoning 可再折叠 |
| T4 | 用户上滚 | 不强制抢滚动（现网 pin 逻辑） |
| T5 | 仅工具调用回合 | 工具整段；无错误双卡 |

---

## 7. 风险

| 风险 | 缓解 |
|------|------|
| 50ms 节流仍卡 | 调到 100ms；fingerprint 已含 length |
| 桥 stop 时未发最后一帧 | `stop()` 内 `flushNow()` |

---

## 8. 修订记录

| 日期 | 说明 |
|------|------|
| 2026-10-03 | Q3 流式中 reasoning 折叠规则明确移至 US-ST-01 §3.1.5 |
| 2026-10-01 | 已确认待开发：消费 ST-01；50ms 节流；流式中展开 reasoning；纯文本 |
