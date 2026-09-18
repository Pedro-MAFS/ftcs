# 申请 Hunter API Key（补全联系人）

FTCS **补全联系人**通过 [Hunter](https://hunter.io/) 按公司官网域名查找相关联系人，并可对邮箱做有效性验证。Key 由你在 Hunter 控制台自行申请（BYOK），粘贴到桌面端 **设置 → 集成 → Hunter**。

- **不做补全联系人**：可不配置；画像、探索、评分与开发信主路径照常可用。  
- **官方通道用户**：模型与搜索仍走官方；**Hunter 须自备 Key**（FTCS 不代调）。  
- **费用**：按 Hunter 账号额度计费，计入你的 Hunter 账单。

## 合规与账号（必读）

请求由 **本机** 直连 `api.hunter.io`，**不经过** FTCS 服务器。请仅配置本人或团队**合法持有**的 Key，并遵守 [Hunter 服务条款](https://hunter.io/terms-of-service)。

**Hunter 额度为账号级**：同一账号下多个 Key **共享**额度。可在设置中配置多个 Key 作故障切换，但无法靠多 Key 加倍额度。

## 申请步骤

### 1. 注册 / 登录 Hunter

打开 [Hunter](https://hunter.io/)，注册或登录账号。

### 2. 创建 API Key

1. 打开 [API Keys](https://hunter.io/api-keys)（控制台 → API）。  
2. 创建新的 API Key，复制保存（形如一长串字符）。

> **安全提示**：请勿把 Key 提交到公开仓库或发给他人。若已泄露，请在 Hunter 控制台删除后重新创建。

### 3. 粘贴到 FTCS

1. 桌面端打开 **设置 → 集成 → Hunter · 补全联系人**。  
2. 粘贴 Key（可添加多个槽位），按需勾选 **补全联系人时验证邮箱**（默认开启；关闭可少耗验邮额度）。  
3. 点击 **保存配置**，可用 **测试连接** 确认 Key 可用。  
4. 在 **OpenCode 运行时** 区域 **重启**，使 `hunter-api` MCP 加载新 Key。

## 如何使用

1. 在 **线索** 页打开已评分线索（需有可解析的官网域名）。  
2. 点击 **补全联系人**；智能体按域名查找并写回联系人列表。  
3. 可在抽屉中对单条联系人再点 **验证**（需已配置 Key）。  
4. 之后在 **邮件** 页可为公司向与个人收件人分别审阅开发信。

## 验证是否生效

- 设置页 **测试连接** 成功。  
- **OpenCode 运行时 → MCP 服务** 中 `hunter-api` 为 connected。  
- 线索抽屉「补全联系人」可点，任务完成后出现联系人（而非引导去配置 Key）。

## 相关链接

- [Hunter API Keys](https://hunter.io/api-keys)  
- [Hunter API 文档](https://hunter.io/api-documentation/v2)  
- [常见问题 · Hunter](/docs/faq#hunter-api-key)  
- [推荐使用流程 · 线索与开发信](/docs/workflow)
