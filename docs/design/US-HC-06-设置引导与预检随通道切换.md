# US-HC-06 详细设计：设置、引导与预检随通道切换

> **需求**：[../42-需求-官方通道网关代调Hunter-客户端.md](../42-需求-官方通道网关代调Hunter-客户端.md) · **US-HC-06** · Related [#156](https://github.com/Pedro-MAFS/ftcs/issues/156)  
> **状态**：**可按已确认的 O2/O4 实现。** 与 US-HC-05 同一次发布，避免界面已放行、调用仍要求 Key。不关 #156。  
> **范围**：设置 Hunter 区块、线索页空态与按钮、补全预检、首次引导。官网 Markdown 不在本故事改。  
> **依赖**：[US-HC-05](US-HC-05-去掉官方通道自备Key直连.md)。  
> **不做**：重做官方余额组件；改 `website/`。  
> **索引**：[US-HC-官方通道网关代调Hunter.md](US-HC-官方通道网关代调Hunter.md)

---

## 1. 对应需求

官方通道的 Hunter 区块没有可提交、并用于直连的 Key 输入，也没有「用自备 Key 测试直连 Hunter」。说明能读出：无需自备 Hunter Key，费用从官方通道余额扣除。不写单价。验邮勾选在官方通道仍可见、可保存。

官方且凭证可用时，补全预检不再因为「未配置 Hunter Key」失败，改为要求官方凭证可用，原则与官方搜索不再要求自备搜索 Key 相同。未开通时引导去登录 / 开通或检查官方通道，不引导去 Hunter 申请 Key。

自定义通道的 Key、测试、未配置引导与 US-HC-04 一致。首次设置引导继续不收集 Hunter Key。

## 2. 模块与界面

### 设置（O2 已确认）

`desktop/src/views/SettingsView.vue` 集成区块按 `isOfficial` 分两支，通道来源与搜索区块相同（`form.channelMode`）。

官方：

- 标题仍是「Hunter · 补全联系人」。
- 说明：「使用官方通道，无需自备 Hunter API Key。费用从官方通道余额扣除。」
- 保留验邮勾选。
- 不渲染 Key 列表、眼睛、添加、删除、测试连接、「尚未注册？打开 Hunter」、服务条款链接。

自定义：保持该文件现有整块，含「费用由 Hunter 收取」和条款链接。

马丰顺已确认该布局。官方搜索区块用禁用输入框表达免配 Key；Hunter 不再留 Key 框，避免看起来仍要去申请。条款只留在自定义区块。

### 线索页

`LeadsView.vue` 在 `onMounted` 里除了 `hunterApiKeySet`、`hunterVerifyEmails`，再读 `channelMode` 与 `officialProvisioned`。

| 条件 | 按钮 | 横幅 / title |
|------|------|----------------|
| 官方且已开通 | 业务条件满足则可点（已评分、有域名、无其他任务） | 不用 Hunter Key 横幅。提示见 US-HC-01 / 02，不含单价 |
| 官方未开通 | 不可点 | 「补全联系人需要官方通道。请先登录并开通官方通道（设置 → 模型通道）」 |
| 自定义且有 Key | 现网可点条件 | 现网 credit 提示可留 |
| 自定义且无 Key | 现网不可点 | 现网三句引导保留 |

`pendingEnrichIds` 使用 `canEnrichLead`。官方已开通时，这个计算不再要求 `hunterKeySet`，否则批量补全会把无 Key 的官方用户全部滤掉。

### 预检

`resolveHunterStart` 今天只看 `hunterApiKeySet`。改为同时看 `channelMode` 与 `officialProvisioned`（`settings-service.ts`：有 `FTCS_GATEWAY_API_KEY` 则为 true）。

| 条件 | `ok` | `detail` |
|------|------|----------|
| 官方且 `officialProvisioned` | true | 「官方通道已包含补全联系人」 |
| 官方且未开通 | false | 与上表线索页同一句 |
| 自定义且有 Key | true | 现句「Hunter API Key 已配置（BYOK）」 |
| 自定义且无 Key | false | 现句，含「设置 → 集成」且说明不影响探索/开发信 |

`runAgentPreflight` 里该检查的 `id` 仍是 `hunter`。官方时 `label` 改为「补全联系人」，避免失败列表仍写「Hunter API Key」。自定义 label 保持「Hunter API Key」。`mcp-hunter-api` 检查保留。

调用点已经存在，不新做入口：

- 按钮 / 编排执行：`launchButton` → `checkTaskEnvironment`
- 编排开始前：`runWorkflowPreflight` → `ensureAgentReady('enrich-lead-contacts')`
- 渲染进程主动检查：`IPC.APP_AGENT_PREFLIGHT` → `gateAgentStart`

`needsHunter` 仍只对 `enrich-lead-contacts` 为真。

### 首次引导

本次阅读 `OnboardingOverlay.vue`，没有 Hunter Key 输入，也没有补全须粘贴 Key 的句子。本故事不新增输入。实现时若发现引导文案要求粘贴 Hunter Key，删掉该句；官方步骤不得新增 Key 框。

### 测试按钮（O4 已确认）

官方区块不放新的「测试代调」按钮。自定义「测试连接」保留，仍是 `onTestHunter` → `settings:test-hunter` → `testHunterConnectivity`。官方通道下该 IPC 的拒绝方式见 US-HC-05：不发 HTTP。

## 3. 数据与状态

预检只读快照，不写 `.env`。官方保存省略 `hunterApiKeys` 的规则在 US-HC-05。验邮勾选两种通道都写入 `HUNTER_VERIFY_EMAILS`。

`officialProvisioned` 表示本机已有官方 sk，与搜索预检使用的是同一个布尔。不新增「Hunter 已开通」状态。

## 4. 代码衔接与调用链

```text
设置保存 onSave
  → saveSettings（官方不传 hunterApiKeys）
  → settings-service.saveSettings

线索页 getSettings
  → hunterApiKeySet / hunterVerifyEmails / channelMode / officialProvisioned
  → canEnrichLead / 横幅

点击补全或编排
  → runAgentPreflight kind=enrich-lead-contacts
  → resolveHunterStart(channelMode, officialProvisioned, hunterApiKeySet)
```

官方搜索对照（只对齐判定形状，不抄搜索接口）：`runAgentPreflight` 在 `needsSearch` 且 `channelMode === 'official'` 时看 `officialProvisioned`，不看 `tavilyApiKeySet`。Hunter 预检改成同样先看通道。

## 5. 验收与回归

- [ ] 官方设置区块：没有可编辑的 Hunter Key，没有测试连接，没有 Hunter 注册链接。验邮勾选能保存。说明就是 O2 已确认的那句，不含单价。
- [ ] 官方已开通、无 Hunter Key：预检 `hunter` 项通过；线索页无「需 Hunter Key」横幅；有域名的已评分线索可以点补全。
- [ ] 官方未开通：预检失败句与按钮 title 指向设置 → 模型通道，不出现 Hunter。
- [ ] 自定义：Key、测试、未配置引导与改动前一致。
- [ ] 首次引导仍不出现 Hunter Key 输入。
- [ ] 本故事的 PR 不含 `website/` 文件。

## 6. 依赖与未决

| 项 | 说明 |
|----|------|
| O2 / O4 | 已确认，按 §2 实现 |
| US-HC-05 | 界面与删除同一次发布。价目或功能未开时，调用失败按 US-HC-07 的 503 提示，而不是改回要求 Hunter Key |
| 官网 | 发版前按 docs/42 §4.1 同步，列表在索引。本故事不改那些文件 |
| 余额组件 | 继续用设置 → 模型通道里现有账户用量，不在 Hunter 区块重做 |

---

## 修订记录

| 日期 | 说明 |
|------|------|
| 2026-11-16 | 初稿。O2/O4 为推荐。预检对齐官方搜索的「看凭证、不看自备 Key」。Related #156。 |
| 2026-11-16 | O2/O4 改为已确认。 |
