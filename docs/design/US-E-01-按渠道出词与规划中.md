# US-E-01 按渠道出词与规划中设计

> **用户故事**：[../17-需求-业务效率工具.md](../17-需求-业务效率工具.md) · US-E-01  
> **状态**：编码已落地  
> **范围**：R2 按已启用社媒站点出词（query 不含 `site:`）；R3/R4 标「规划中」；探索页 / 关键词编辑文案不再写海关或竞品反查  
> **依赖**：现网 `expand-keywords`、探索页关键词预览、关键词编辑器  
> **不做**：`search_web` / `include_domains`（E-02）；抽公司与二次搜官网（E-03）；打开官网写线索（E-04）；「开始 R2」按钮（E-05）；R3/R4 出词与执行；改 `discover-leads`  
> **文档位置**：`docs/design/`

---

## 0. 相对现网

| 现网 | **本期** |
|------|----------|
| `expand-keywords` 按 R1~60% / R2~20% / R3~15% / R4~5% 出词；R2/R3 只是更深的普通检索句 | R1 仍为普通聚合词；R2 为「产品/买家/地理句 + `site_id`」；**不再生成 R3/R4 词** |
| `search_queries` 无站点字段；query 里也没有稳定的站点绑定 | R2 必填 `site_id`；query **禁止** Google 运算符（含 `site:`） |
| 探索页筛选标签为「R1」「R2」「R3」「R4」 | R1 广撒网、R2 社媒发现、R3/R4 带「规划中」 |
| 无站点开关 | 探索页可开关 R2 站点；再次扩展后只为启用站出词 |
| 「开始 R1」唯一执行入口 | **不动**（E-05 再加开始 R2） |

---

## 1. 已确认选型

| 项 | 决定 |
|----|------|
| **Q1 站点登记表** | 仓库 [`workspace/config/explore-r2-sites.yaml`](../../workspace/config/explore-r2-sites.yaml)（随应用分发）。字段：`id`、`label`、`include_domains`、`default_enabled`。`include_domains` 本故事只登记，**不调用搜索**（E-02 才用） |
| **Q2 用户开关** | 覆盖文件 `data/prefs/explore-r2.json`：`{ "enabled": { "<site_id>": true/false } }`。缺省用登记表 `default_enabled`。探索页关键词预览区提供勾选，改完即保存 |
| **Q3 词如何绑站点** | `search_queries[].site_id`。仅 `round=R2` 必填且必须是登记表中的 id；R1/R3/R4 **不得**带 `site_id` |
| **Q4 还出不出 R3/R4** | **扩展时不再生成**。编辑器仍可选手改 round（兼容旧文件）；预览里 R3/R4 标规划中，本故事不执行 |
| **Q5 数量** | 总数仍 **30～50**。R1 **≥ 60%**。其余给 R2，按**当前启用站点**均分，每站至少 2 条（启用 1 站则 R2 全给该站）。0 个启用站 → 没有 R2 词，全是 R1 |
| **Q6 旧 expansion** | 不自动改写磁盘上的旧 R2 深词。验收与主路径以**重新扩展**为准。预览遇到 `round=R2` 且无 `site_id` 时 meta 显示「旧格式」 |
| **Q7 query 禁则** | R2 的 `query` 不得匹配 `\b(site\|intitle\|inurl\|filetype)\s*:`（大小写不敏感）。`keywords_save` 与桌面保存均拒绝 |
| **Q8 Skill vs 桌面 prompt** | Skill 为权威步骤；桌面 `buildExpandKeywordsPrompt` **注入当前启用站点列表**，避免模型漏读 yaml |

---

## 2. 目标与非目标

### 2.1 目标

1. 重新扩展后，R2 词是渠道词：自然语言检索句 + `site_id`，不是同一搜索框里更深的句子。  
2. 关掉某站并再次扩展后，expansion 里不再出现该 `site_id`。  
3. 探索页能按轮次预览；R3/R4 标明规划中；文案无海关 / 竞品反查。  
4. R1 出词与「开始 R1」行为保持现网。

### 2.2 非目标

| 不做 | 归属 |
|------|------|
| `search_web` 传 `include_domains`、放行 Facebook | US-E-02 |
| 抽公司名、二次搜官网 | US-E-03 |
| 打开官网、写 `raw/R2.jsonl` | US-E-04 |
| 「开始 R2」、启动 `discover-leads-r2` | US-E-05 |
| 给 `discover-leads` 加 R2 分支 | 已否决（§5.5） |
| 设置页里的站点管理、多工作区同步 | 本故事不需要；开关在探索页即可 |
| 登记具体行业论坛站 | 默认关闭且本故事不建空 `include_domains` 的论坛项 |

---

## 3. 站点登记表

新建 `workspace/config/explore-r2-sites.yaml`：

```yaml
# R2 社媒发现站点。enabled 以 data/prefs/explore-r2.json 覆盖 default_enabled。
sites:
  - id: linkedin_company
    label: LinkedIn 公司页
    include_domains:
      - linkedin.com/company
    default_enabled: true
  - id: facebook_page
    label: Facebook 公共主页
    include_domains:
      - facebook.com
    default_enabled: true
  - id: instagram
    label: Instagram
    include_domains:
      - instagram.com
    default_enabled: false
  - id: x
    label: X
    include_domains:
      - x.com
    default_enabled: false
  - id: tiktok
    label: TikTok
    include_domains:
      - tiktok.com
    default_enabled: false
```

解析规则：

- 未知 `id`、空 `include_domains` → 启动时跳过并打日志，不崩。  
- `data/prefs/explore-r2.json` 只允许覆盖**已登记** id；多出来的 key 忽略。  
- 解析结果供：探索页勾选、扩展 prompt 注入、E-02 查 `include_domains`（本故事只读登记，不搜）。

桌面与 MCP 共用同一相对工作区路径（`config/explore-r2-sites.yaml`、`data/prefs/explore-r2.json`）。解析函数放一处（建议 `desktop/electron/exploration/r2-sites.ts`，Skill 用文字约定同一文件；若 MCP 也要读，E-02 再抽共享模块，本故事不强制 MCP 依赖该 yaml）。

---

## 4. 界面

### 4.1 探索页 · 轮次筛选

[`ExploreView.vue`](../../desktop/src/views/ExploreView.vue) `ROUND_OPTIONS`：

| value | label |
|-------|--------|
| `all` | 全部轮次 |
| `R1` | R1 广撒网 |
| `R2` | R2 社媒发现 |
| `R3` | R3 规划中 |
| `R4` | R4 规划中 |

预览标题沿用现网拼接。选 R3/R4 时，若列表为空：

> R3 / R4 本阶段规划中，扩展关键词时不再生成这类词。

选 R2 且有词：列表 meta 为 `维度 · R2 · {站点 label}`。

### 4.2 探索页 · R2 站点开关

放在关键词预览筛选行附近（`keywords_ready` 时可见）：

```text
R2 站点  [x] LinkedIn 公司页  [x] Facebook 公共主页  [ ] Instagram  [ ] X  [ ] TikTok
```

- 勾选变化 → 立即写 `data/prefs/explore-r2.json`。  
- **不**自动重跑扩展；旁注：「下次生成关键词时生效」。  
- 本故事不因此启用「开始 R2」。

### 4.3 关键词编辑器

[`KeywordEditorDialog.vue`](../../desktop/src/components/shared/KeywordEditorDialog.vue)：

- 轮次选项与探索页同一套文案。  
- `round === R2` 时出现站点下拉（仅 `default_enabled` 或当前 prefs 里出现过的登记项都要能选，避免无法编辑已有词）。空 `site_id` 不能保存。  
- 保存 R2 行时跑 Q7 禁则。  
- 允许把某行改成 R3/R4（规划中），保存时去掉 `site_id`。

### 4.4 文案禁则

探索页、编辑器、扩展完成摘要中 **不得**出现：海关、贸易数据、竞品反查、展会名单（旧 R2/R3 含义）。「竞品」作为五维 `dimension=competitor` 的标签可保留（那是品类/替代词，不是旧 R3 通道）。

---

## 5. 数据与校验

### 5.1 `search_queries` 增补

[`keyword-types.ts`](../../workspace/mcp-servers/lead-store/src/keyword-types.ts) 与桌面 DTO / `keywords-reader` 对齐：

```ts
site_id?: string  // 仅 R2
```

`keywords_save`（lead-store）与桌面 `saveKeywords`：

| 条件 | 结果 |
|------|------|
| `round=R2` 且无 `site_id` | 拒绝 |
| `round≠R2` 且带 `site_id` | 拒绝或保存前剥掉（选 **拒绝**，避免静默丢字段） |
| R2 的 query 含 Q7 运算符 | 拒绝 |
| 总数不在 30～50 | 保持现网 Skill 自检；编辑器不强制 30～50（与现网一致，可改少量词） |

读旧文件：缺 `site_id` 的 R2 仍能展示，不能当作本故事验收通过样本。

### 5.2 扩展结果示例

```json
{
  "id": "q_031",
  "query": "WPC decking distributor Germany",
  "dimension": "buyer",
  "language": "en",
  "priority": "high",
  "round": "R2",
  "site_id": "linkedin_company"
}
```

同一句话可以对 `facebook_page` 再有一条（不同 `id`）。这是「按站点出词」，不是把 `site:` 写进 query。

### 5.3 文档

编码本故事时同步改 [03-数据模型.md](../03-数据模型.md) 关键词一节：补 `site_id`、写明 R2 含义以本文 / 17 号 §5 为准。**不要**把 02 里旧「海关 R2」表改成好像已经实现；02 等 E 批详设齐了再改策略表。

---

## 6. Skill 与桌面 Prompt

### 6.1 [`expand-keywords/SKILL.md`](../../workspace/skills/expand-keywords/SKILL.md)

改 Step 2 / Step 3：

- 删掉「更深意图 R2/R3、监控词 R4」和 60/20/15/5 比例。  
- R1：普通产品 / 场景 / 买家 / 地理 / 竞品替代检索句，**不要** `site_id`。  
- R2：只给**当前启用**站点出词；每条必须有 `site_id`；query 禁止 `site:` 等运算符；站点限定留给搜索层。  
- **不要**生成 `round=R3` 或 `R4`。  
- 自检增加：抽查 R2 均有 `site_id`；R2 query 无 `site:`；`by_round` 无 R3/R4 或为 0。

读取启用站点：先读 `config/explore-r2-sites.yaml`，再用 `data/prefs/explore-r2.json` 覆盖。文件不存在则用 yaml 的 `default_enabled`。

### 6.2 [`agent-runner.ts`](../../desktop/electron/opencode/agent-runner.ts) `buildExpandKeywordsPrompt`

在现网 5 步要求上追加（动态插入启用列表）：

- 当前启用 R2 站点：`id` + `label` 列表。  
- R2 每条必须带对应 `site_id`；禁止在 query 写 `site:`。  
- 不要生成 R3/R4。  
- 下一步建议仍写 R1 / `discover-leads`；可加一句「R2 执行尚未在本故事开通」。

---

## 7. IPC

| 方法 | 说明 |
|------|------|
| `getExploreR2Sites()` | 返回登记表 + 合并后的 `enabled` |
| `setExploreR2SiteEnabled(siteId, enabled)` | 更新 prefs 并返回最新列表 |

不新增「按站点扩展关键词」专用 IPC；用户改开关后仍走现网「生成关键词 / 扩展」入口。

---

## 8. 与后续故事衔接

| 故事 | 衔接 |
|------|------|
| E-02 | 用本登记表的 `include_domains`；按词上的 `site_id` 传入；无 `site_id` 的旧 R2 词跳过或不当作 E-02 样本 |
| E-03～E-04 | 读 R2 词的 `query` + 之后搜索结果；不依赖 query 内运算符 |
| E-05 | 探索页再加「开始 R2」；本故事按钮布局预留右侧即可，不必先放禁用按钮 |

---

## 9. 验收用例

| # | Given | When | Then |
|---|--------|------|------|
| A1 | 默认 prefs（两站启用） | 对 ready 画像扩展关键词 | 30～50 条；R1≥60%；R2 的 `site_id` 只有 `linkedin_company` / `facebook_page`；query 无 `site:`；无 R3/R4 |
| A2 | 关掉 Facebook，再扩展 | 保存 expansion | 无 `site_id=facebook_page`；仍有 LinkedIn R2（若仍启用） |
| A3 | 五个站全关 | 再扩展 | 无 R2 词；全是 R1；探索页 R2 筛选为空 |
| A4 | 扩展完成 | 预览选「R2 社媒发现」 | 能列出 R2 词；meta 含站点中文名 |
| A5 | 预览选 R3 / R4 | 看空态 | 有「规划中」说明；不能开始这些轮次（本来就没有按钮） |
| A6 | 编辑器把一行改为 R2 且不选站点 | 保存 | 失败并提示 |
| A7 | 编辑器 R2 query 写成 `site:linkedin.com decking` | 保存 | 失败并提示 |
| A8 | 磁盘上旧 expansion（R2 无 `site_id`） | 只打开预览、不重新扩展 | 应用不崩；该行 meta「旧格式」；开始 R1 仍只跑 R1 词 |
| A9 | 文案 | 看探索页与编辑器轮次下拉 | 无海关 / 贸易数据 / 竞品反查 |

---

## 10. 编码任务顺序

1. `explore-r2-sites.yaml` + 解析 + prefs 读写 + IPC。  
2. `SearchQuery.site_id`：lead-store zod、桌面 reader/save、DTO。  
3. `expand-keywords` Skill + `buildExpandKeywordsPrompt` 注入启用站。  
4. 探索页轮次文案、站点勾选、R2 meta。  
5. 关键词编辑器站点下拉与保存校验。  
6. 手工走 A1–A9；把本故事与 17 号文档本条状态改为「编码已落地」。

---

## 11. 已确认点汇总

| # | 议题 | 决定 |
|---|------|------|
| Q1 | 登记表位置 | `workspace/config/explore-r2-sites.yaml` |
| Q2 | 开关落盘 | `data/prefs/explore-r2.json` + 探索页勾选 |
| Q3 | 词绑站点 | `site_id`，不写进 query |
| Q4 | R3/R4 词 | 扩展不再生成 |
| Q5 | 比例 | 总数 30～50，R1≥60%，其余按启用站均分 |
| Q6 | 旧数据 | 不自动迁移；预览标旧格式 |
| Q7 | 运算符 | save 拒绝 `site:` 等 |
| Q8 | 开始 R2 | 本故事不做 |
