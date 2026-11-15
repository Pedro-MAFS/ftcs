# US-SITE-09：绑定自有域名

状态：已按设计实现页面与 Pages 域名 API，Cloudflare OAuth、根域名和真实 DNS 绑定仍需联测。对应 [US-SITE-09 与 TV-SITE-03](../独立站-需求拆分与交付顺序.md)。

## 1. 目标和范围

用户将自己的域名连接到当前工作区已关联的 Cloudflare Pages 项目。交互采用两步：

1. FTCS 调用 Cloudflare API，将用户输入的域名添加到当前 Pages 项目。
2. FTCS 展示 DNS 配置要求；用户到自己的 DNS 服务商配置，返回后点击「检查配置」。

FTCS 不接入其他 DNS 服务商的 API，不代用户修改其 DNS。Cloudflare 的关联状态、验证信息与 DNS 提示分开显示，避免把 API 添加成功误认为网站已可访问。

## 2. 关键约束

- **子域名**：例如 `www.example.com`、`shop.example.com`。即使 DNS 不托管在 Cloudflare，也可按 Cloudflare 文档在 DNS 服务商添加 CNAME，目标为该 Pages 项目提供的正式 `*.pages.dev` 域名。
- **根域名**：例如 `example.com`。Cloudflare 官方要求其成为**当前 Pages 项目所属 Cloudflare 账号中的 zone**，并将域名的 nameserver 指向 Cloudflare。不能把“在其他 DNS 服务商配置一个 CNAME”当成通用解决方案。域名可仍在阿里云等处注册，但用户需要自行将 DNS 委派给 Cloudflare 并处理原有解析迁移；不能替用户切换 nameserver。
- DNS 实际托管在 Cloudflare 时，官方界面可能会创建 CNAME；本设计的 FTCS 不假设 API 也会自动创建或修改 DNS，应以实际记录和联测为准。
- Cloudflare 除 CNAME 外也可能返回其他验证要求，例如 `validation_data` 中的 TXT 记录；只有返回具体值时才展示，不自行猜测。

依据：[Cloudflare Pages 自定义域名](https://developers.cloudflare.com/pages/configuration/custom-domains/)、[域名 API 字段](https://developers.cloudflare.com/api/resources/pages/subresources/projects/subresources/domains/)。

## 3. 页面与操作流程

### 3.1 入口和当前状态

独立站页面的「发布记录」中，在已关联的 Cloudflare Pages 项目下增加「自有域名」区域，显示项目名称、默认 `pages.dev` 地址以及该项目的域名列表。域名列表以 Cloudflare API 为准，包括在 Cloudflare 控制台创建的域名；不把当前工作区的本地缓存当作权威列表。

列表每项显示域名、Cloudflare 状态、最近一次查询结果，并提供「查看配置」「检查配置」。页面提供「添加域名」「刷新列表」。未连接 Cloudflare、未选账号或未关联 Pages 项目时，说明前置条件并引导处理；连接切换、项目切换后清空旧列表并重新查询。不会改变默认 `pages.dev` 访问地址。

### 3.2 添加域名

点击「添加域名」，打开弹框：

1. 输入完整域名，例如 `www.example.com`，不填写协议、端口、路径或通配符。
2. 选择「子域名」或「根域名」。解释两者差异，由用户根据所持域名选择；不根据点号数量猜测根域名，因为公共后缀有多级情况。类型用于展示正确指引，不代表 FTCS 已验证域名归属。
3. 弹框显示 Cloudflare 账号、Pages 项目、项目的正式 `pages.dev` 地址。先读取项目 `subdomain` 字段并验证其是可信的 `pages.dev` 主机名；缺失或无效时阻止添加并提示刷新或检查项目，不能由项目名自行拼接目标地址。
4. 用户点击「添加域名」。主进程校验当前工作区、账号和绑定的项目，再请求 Cloudflare。请求成功后打开配置指引并显示当前状态。根域名如果因接入条件不满足而无法添加，也展示根域名接入指引，并保留 Cloudflare 返回的实际错误；接入完成后由用户再次添加。重复提交禁用；不主动替用户修改 DNS。

弹框应明确：添加域名会在 Cloudflare 项目中创建关联；域名能否生效还取决于 DNS 和 Cloudflare 验证。允许取消输入，不在取消时创建关联。

### 3.3 DNS 配置弹框

子域名示例（实际显示输入的完整域名及项目返回的目标）：

```text
域名已添加到 Cloudflare Pages

请在域名当前使用的 DNS 服务商处添加：
记录类型：CNAME
记录名称：www.example.com
记录值：my-site.pages.dev

有些服务商的「主机记录」只填写 www，具体以该服务商界面为准。
[复制域名] [复制记录值]  [检查配置] [关闭]
```

不根据输入的字符串推断注册域或自动截断「主机记录」。提示同名记录冲突时，应由用户在 DNS 服务商核对现有用途和解析要求后处理；FTCS 不自动覆盖或删除。

根域名弹框展示 Cloudflare zone 和 nameserver 前置要求，主按钮使用「去转移」，代替子域名弹框中的「检查配置」：

```text
根域名需要先接入 Cloudflare DNS

请在当前 Cloudflare 账号中添加 example.com，核对并迁移现有 DNS 记录，
再到域名注册商按 Cloudflare 提供的地址修改 nameserver。
域名仍可在原注册商购买和续费。完成接入后请返回 FTCS。

[去转移] [关闭]
```

点击「去转移」使用系统浏览器打开**当前已选 Cloudflare 账号的控制台**，引导用户进入“域名 → 接入域名”（Cloudflare 界面名称可能变化）。这是接入 Cloudflare DNS 的入口，不跳到 Cloudflare Registrar 的注册商转移流程；不要求或自动办理域名所有权、注册商转移。若无法获取可信的当前账号地址，打开 Cloudflare 控制台首页并提示用户选择与 FTCS 相同的账号；具体深链须联测，不能假设存在可预填域名的页面。用户还需要在当前域名注册商完成 nameserver 修改，FTCS 无法代填。

不显示“在任意 DNS 服务商添加 CNAME 即可”的通用指令。当前授权范围未包含 Zone/DNS 读取或写入，因此 FTCS 不宣称能自动判断 zone 是否存在、nameserver 是否正确或自动创建解析记录。用户完成后返回 FTCS：如果此前 Pages 域名未添加成功，在弹框或页面重新点击「添加域名」；如果已经添加，通过域名列表上的「检查配置」或「刷新列表」查看 Pages 状态。根域名弹框本身不提供刷新按钮。具体 API 是否允许在 zone 准备前添加、是否自动创建 DNS 记录，须联测核实。

若 API 返回 `validation_data.method = txt` 且提供 `txt_name`、`txt_value`，另外展示 TXT 名称和值及复制按钮；缺少值时显示 Cloudflare 返回的状态和错误，并引导到控制台查看，不伪造记录。

弹框关闭只关闭界面，不删除已创建的域名。用户可从列表重新打开配置指引。

## 4. 「检查配置」与状态

「检查配置」由用户触发，调用对应域名的 Cloudflare GET 接口并刷新列表及弹框；不隐式修改 DNS 或自动重复发起域名创建。可选用操作系统 DNS 查询 CNAME 作为**辅助信息**：普通未代理子域名若查询到目标，可提示“当前查询到 CNAME 指向目标”；未查到、查询失败、DNS 缓存、Cloudflare 代理或 CNAME 展平等情况一律显示“无法从本次 DNS 查询确认”，不能据此断言用户未配置或域名无效。根域名不以 CNAME 查询作为判定条件。Cloudflare 的状态始终与辅助 DNS 查询分别展示。

| Cloudflare `status` | 页面显示 | 处理 |
| --- | --- | --- |
| `initializing` / `pending` | 配置/验证中 | 保留配置指引，允许稍后检查；不声称已生效 |
| `active` | Cloudflare 显示已激活 | 展示 `https://域名` 和打开入口；不承诺所有地区 DNS 已同步，也不单凭该值断言站点内容正确 |
| `blocked` / `error` / `deactivated` | 绑定异常或未启用 | 展示返回的验证错误及可执行建议；必要时引导至 Cloudflare 控制台 |
| 未知值或查询失败 | 状态待确认 | 保留上次已知结果并标明查询时间、当前错误，不当成成功或失败 |

同时展示 API 实际返回的 `verification_data` / `validation_data` 状态和错误信息；它们是 Cloudflare 的验证信息，不单独推断证书一定已签发。`validation_data` 中若有要求的 TXT 值则展示。检查失败应允许再次点击；对验证失败可以提供单独的「重试 Cloudflare 验证」操作，调用其 PATCH 接口，但默认「检查配置」只读取状态，避免意外重复触发。PATCH 实际参数、时机和反馈需联测后确认，未验证前不展示可误导用户的重试操作。

## 5. API 和实现位置

全部令牌继续只保存在主进程，使用已有 Cloudflare OAuth 凭据、超时与脱敏错误处理。桌面端增加以下 Pages 域名接口封装及 IPC：

| 操作 | Cloudflare API | 权限 |
| --- | --- | --- |
| 列表 | `GET /accounts/{account_id}/pages/projects/{project_name}/domains` | Pages Read 或 Pages Write |
| 查询 | `GET /accounts/{account_id}/pages/projects/{project_name}/domains/{domain_name}` | Pages Read 或 Pages Write |
| 添加 | `POST /accounts/{account_id}/pages/projects/{project_name}/domains`，body 为 `{ "name": "www.example.com" }` | Pages Write |
| 可选重试验证 | `PATCH /accounts/{account_id}/pages/projects/{project_name}/domains/{domain_name}` | Pages Write；待联测 |

依据：[添加域名](https://developers.cloudflare.com/api/resources/pages/subresources/projects/subresources/domains/methods/create/)、[查询域名](https://developers.cloudflare.com/api/resources/pages/subresources/projects/subresources/domains/methods/get/)、[重试验证](https://developers.cloudflare.com/api/resources/pages/subresources/projects/subresources/domains/methods/edit/)。当前 OAuth 已申请 Pages Read / Pages Write；文档对 API token 所需权限有说明，但**现有 OAuth 凭据在这些端点上的实际可用性仍需联测**。401/403 明确提示授权或权限问题，不假设一定需要新增权限。

- `desktop/electron/cloudflare/`：扩展 Pages API，规范化域名状态、验证信息及分页；复用现有请求和令牌脱敏，不把凭据发给页面。
- `desktop/electron/main.ts` / preload / IPC 类型：处理列表、添加、查询、可选 DNS 辅助查询；从当前工作区的发布记录获取 Cloudflare 账号和项目，重新校验账号、项目和工作区，不接受页面自行指定任意账号或项目。读取当前项目获取 CNAME 目标。
- `desktop/src/views/SiteView.vue`：显示列表及弹框；对异步请求使用工作区、账号、项目和请求序号校验，防止切换后旧结果覆盖新状态。
- 添加请求超时或连接中断时，显示“添加结果待确认”，先重新查询项目的域名列表；若存在则恢复配置指引，若查询失败则保留待确认状态；只有确认不存在后才允许用户重试。不能因未知结果自动重复 POST。
- 域名只允许合法的单个公共主机名：去除首尾空白、小写、IDNA 转 ASCII 后校验长度与标签，拒绝 URL、IP、端口、路径、通配符及本地名称。错误显示可操作提示；是否为根域名由用户选择并由 Cloudflare 最终校验。

## 6. 维护、SEO 与边界

- 一个 Pages 项目可能有多个域名；本次支持读取和添加多个域名，不自动选择主域名、不自动设置跳转或删除已有域名。用户如需移除，首期引导至 Cloudflare 和 DNS 服务商手工处理，之后刷新列表；解除关联和删除 DNS 是两项不同操作。
- 域名激活不会自动替换站点默认访问地址，也不会自动修改 `SITE_URL`、源码或 Cloudflare 环境变量。默认模板在配置 `SITE_URL` 后重新构建才生成相应 sitemap；页面在域名激活后给出此提醒。通用 Node 项目不一定支持该变量，FTCS 不能替所有项目声称已配置 SEO。
- DNS 和证书状态可能延迟，不设置“若干分钟必定生效”的承诺。CNAME 记录修改可能影响现有业务，提示用户核对现有配置；不替用户做解析切换。
- 本次不新增智能体域名 MCP，先交付页面操作；如后续需要通过聊天绑定，再单独设计明确的用户意图、参数和状态反馈。

## 7. 验收与联测

自动化测试覆盖：输入校验、账号和项目校验、API 路径与权限错误、分页、状态映射、TXT 信息、目标地址缺失、重复请求与超时恢复、请求返回前切换工作区/账号/项目、检查失败不冒充已激活、DNS 辅助查询不覆盖 Cloudflare 状态、弹框关闭后从列表恢复。

需要使用真实 Cloudflare OAuth 和测试域名联测：

1. 外部 DNS 子域名：添加 → 显示正确的 CNAME → 在 DNS 服务商配置 → 检查 → Cloudflare 激活 → HTTPS 访问；记录实际返回的状态、字段和等待时间。
2. Cloudflare 托管 zone 的子域名：确认 API 添加后是否自动建记录、代理/展平是否影响辅助 DNS 检查。
3. 根域名：先确认 zone 属于项目所在账号并按 Cloudflare 指引处理 nameserver；验证 API 添加前后的要求、DNS 记录和状态。不得通过更改生产域名的 nameserver 来做破坏性测试。
4. 验证权限、冲突、CNAME 错误、TXT 要求、证书/验证未就绪、创建请求结果未知、重启和账号/项目切换；记录能否使用 PATCH 重试验证。
5. 已激活域名的页面展示、默认地址保留；按模板说明设置 `SITE_URL` 后重新构建，检查 sitemap 地址。

测试结果记录在 TV-SITE-03 中；以上需要实际账号、DNS 和网络环境的项，在联测前不视为已验证。
