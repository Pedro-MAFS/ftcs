# 申请 Google Places API Key（R3 地图发现）

FTCS **R3 地图发现**通过 **Google Places API (New)** 按城市与品类查找本地商户。Key 由你在 [Google Cloud Console](https://console.cloud.google.com/) 自行申请，粘贴到桌面端 **设置 → 探索 → Google Places API Key**（或首次引导 **步骤 2** 的可选区块）。

- **只跑 R1 广撒网 / R2 社媒发现**：可不配置。  
- **官方通道用户**：模型与 Tavily 搜索仍走官方；**Places 须自备 Key**（不经 FTCS 代调）。  
- **费用**：按 Google Maps Platform 计费，计入你的 GCP 结算账号。

## 网络与合规（必读）

Places 请求由 **本机 OpenCode** 直连 Google 服务（`places.googleapis.com`），**不经过 FTCS 服务器**。

使用 R3 前，请确保本机网络 **合法合规**，且 **能够正常访问 Google 服务**（含 Google Cloud Console 与 Places API），并遵守：

- 所在地法律法规  
- [Google Maps Platform 服务条款](https://cloud.google.com/maps-platform/terms)  
- [Places API 使用政策](https://developers.google.com/maps/documentation/places/web-service/policies)

若连接超时或无法访问 Google 服务，请先检查网络与 Console 中的 API 启用状态，再重试。FTCS **不提供** Google API 代调服务。

## 申请步骤

### 1. 登录 Google Cloud

打开 [Google Cloud Console](https://console.cloud.google.com/)，使用 Google 账号登录。若顶部还没有可选项目，点 **新建项目** 建一个即可——**项目名称随意**，不影响 FTCS 使用；我们只需要最终拿到 **一个 API Key**。

### 2. 启用结算

Places API 为按量计费服务。在控制台打开 **结算**，为当前项目关联有效的结算账号（Google 新用户可能有试用赠金，以 Console 显示为准）。

### 3. 启用 Places API (New)

1. 打开 [Places API (New) 库页](https://console.cloud.google.com/apis/library/places.googleapis.com)（或：**API 和服务** → **库** → 搜索 **Places API (New)**）。  
2. 确认顶部已选中你要用的那个 GCP 项目（任意项目均可），点击 **启用**。

> 须启用 **Places API (New)**（服务 ID `places.googleapis.com`）。若界面有多个 Places 相关条目，以 Console 当前命名为准，务必选带 **(New)** 的项。

### 4. 创建 API Key

1. 打开 [凭据](https://console.cloud.google.com/apis/credentials)（**API 和服务** → **凭据**）。  
2. 点击 **+ 创建凭据** → **API 密钥**（见下图 **①②**）。

![在 Google Cloud 凭据页点击「创建凭据」→「API 密钥」](/screenshots/google-places-api-1.png)

3. 在右侧 **「创建 API 密钥」** 面板中（见下图 **③④**）：
   - **名称**：随便起名，方便自己在 Console 里辨认即可。  
   - **限制密钥** → **选择 API** → 勾选 **Places API (New)**（建议务必限制，避免 Key 泄露后被滥用）。  
   - 点击 **创建**。

![创建 API 密钥：填写名称并限制为 Places API (New)](/screenshots/google-places-api-2.png)

4. 在 **「API 密钥已创建」** 弹窗中复制 Key（形如 `AIza…`），见下图 **⑤**。

![复制 API Key 到 FTCS 设置](/screenshots/google-places-api-3.png)

> **安全提示**：请勿把 Key 提交到公开仓库或发给他人。若 Key 已泄露，请在 Console 中 **轮换 / 删除** 后重新创建。

### 5. 粘贴到 FTCS 并重启 OpenCode

1. 桌面端 **设置 → 探索 → R3 地图发现** 粘贴 Key，点击 **保存配置**。  
2. 在 **OpenCode 运行时** 区域点击 **重启**，使 `places-api` MCP 加载 Key。  
3. 探索页选择 **R3 地图发现**，点 **开始 R3** 前会执行 Preflight；通过后即可运行。

首次引导可在 **步骤 2 · 模型通道** 底部 **可选** 填写 Places Key，与模型 / Tavily 一并保存。

## 验证是否生效

- 设置页 **OpenCode 运行时 → MCP 服务** 中 `places-api` 为 `connected`。  
- 探索页 Preflight 通过；Agent 调用 `places_text_search` 返回商户列表，而非 `MISSING_PLACES_API_KEY` 或连接失败。

若仍报 `fetch failed` 或连接超时，优先确认本机能否 **合法合规地访问 Google 服务**，并确认 **Places API (New)** 已启用、Key 限制未误拦本机。

## 相关链接

- [Google Cloud Console](https://console.cloud.google.com/)  
- [凭据（API Key）](https://console.cloud.google.com/apis/credentials)  
- [启用 Places API (New)](https://console.cloud.google.com/apis/library/places.googleapis.com)  
- [Places API 使用政策](https://developers.google.com/maps/documentation/places/web-service/policies)  
- [常见问题 · Places API Key](/docs/faq#places-api-key)
