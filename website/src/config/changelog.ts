export interface ChangelogRelease {
  version: string
  releasedAt: string
  title: string
  notes: string[]
}

/** 发布说明从此版本起记录，更早版本不再补录 */
export const CHANGELOG_STARTED_AT = '0.5.0'

/**
 * 按版本从新到旧排列。发版时在数组头部追加一条，并同步 latest.json。
 */
export const changelogReleases: ChangelogRelease[] = [
  {
    version: '0.5.6',
    releasedAt: '2026-09-30',
    title: '探索强度、日间模式与定时编排',
    notes: [
      '设置 → 探索可选择低 / 中 / 高探索强度，默认中。更高会生成更多关键词，每次搜索和地图发现也会多看结果，耗时和费用更高',
      '扩展关键词按当前强度给目标：广撒网（R1）低 20 / 中 40 / 高 60；每个已启用社媒和地图发现词低 10 / 中 20 / 高 40。只改强度不会改写已有关键词，需重新扩展',
      '探索时每次搜索返回低 3 / 中 5 / 高 10 条。地图发现每次地点低 10 / 中 20 / 高 40，详情约为这次实际返回的四分之三',
      '探索页不再填写「最多词数」，开始某一轮会跑完该轮已有的词',
      '社媒发现和地图发现不再限制每词、每轮打开官网的次数；已解析出的公司官网都会打开，判断为目标客户后才写入线索',
      '设置 → 外观可切换暗黑、日间或跟随 Windows 系统外观。标题栏可一键在日间和暗黑之间切换，立即生效',
      '长任务结束且窗口不在前台时，弹出 Windows 系统通知（设置里可关闭）。编排一键跑通只在整段结束时通知一次',
      '线索页可为已保存的任务方案设置每日或每周定时（最多 5 条）。需开启开机自启，并把关闭窗口改为进入托盘；到点若已有任务在跑会跳过',
    ],
  },
  {
    version: '0.5.5',
    releasedAt: '2026-09-18',
    title: 'Hunter 补全联系人与开发信多收件人',
    notes: [
      '线索页支持 Hunter 补全联系人（自备 API Key）：按官网域名查找相关联系人，并可验证邮箱有效性；未配置不影响探索与开发信',
      '开发信改为按收件人起草：每条线索一封公司向 + 个人邮箱各一封；邮件页可切换收件人审阅，支持单人补起草',
      '取消短函 / 正式函双变体；在设置中用自然语言描述行文风格，影响之后的起草与重写',
      '邮件页可生成中文对照辅助审阅（外发仍用原文）；支持按收件人通过或驳回，并可一键跳回对应线索',
    ],
  },
  {
    version: '0.5.4',
    releasedAt: '2026-09-09',
    title: '官方通道新模型与透明计价',
    notes: [
      '官方通道模型列表随网关同步更新，新增 GLM 5.3 Flash、Qwen 3.8 Flash 等读图模型；资料树勾图时请选带「读图」的模型',
      '读图能力由网关返回的模型类型决定，官方通道可随网关上新模型，无需等待桌面发版',
      '配合网关新版计价策略，可在充值页与用户面板查看各模型价格与消费明细；设置页可刷新余额与今日 Token',
      'R3 地图发现：设置 → 探索 可配置 Google 出站代理（系统/手动/直连）并测试连接；修复 places-api 在部分环境无法启动的问题',
      '文字型 PDF 侧车抽取改用更轻量的 docutext，安装包体积略减',
    ],
  },
  {
    version: '0.5.3',
    releasedAt: '2026-09-06',
    title: '任务编排与环境一键准备',
    notes: [
      '线索页可选任务方案：把探索、评分去重、批量起草等步骤按顺序一键跑通，也可自建与编辑方案',
      '资料工程树支持图片与文字型 PDF：图片由智能体 Read 读图；PDF 自动抽文本后进画像（扫描件暂不支持）',
      '首次引导可一键准备 Node.js 24 与 OpenCode 1.18.4 到应用目录，无需 UAC、npm 或装完重启',
      '若你已在应用内完成准备，环境检测只认应用私有路径，避免与系统旧版本混淆',
    ],
  },
  {
    version: '0.5.2',
    releasedAt: '2026-09-03',
    title: 'R3 地图发现',
    notes: [
      '探索新增 R3 地图发现：用 Google Places 按城市与品类查找本地商户，补全官网并核对后写入线索',
      'R3 须自备 Google Places API Key（设置 → 探索或首次引导可选填写）；官网帮助有图文申请教程',
      '扩展关键词会同步生成 R3 地图发现词；探索页「开始 R3」前会 Preflight 检查配置',
      '官方通道登录失效时可感知并提示；换号登录会提示重置网关凭证',
      'Agent 聊天框展示模型调用失败与重试原因，持续重试两分钟后自动中止',
    ],
  },
  {
    version: '0.5.1',
    releasedAt: '2026-08-26',
    title: '社媒发现',
    notes: [
      '探索可选择广撒网或社媒发现，线索页也可直接开始',
      '社媒发现只检索已启用站点的公开摘要，核对官网后再写入线索；不打开领英 / 脸书真页',
      '社媒站点开关在设置中；改完后请重新扩展关键词。匹配理由会标出来源',
      '遇到人机验证或登录墙即停，不会尝试绕过',
    ],
  },
  {
    version: '0.5.0',
    releasedAt: '2026-08-19',
    title: '资料工程树与 Office 抽取',
    notes: [
      '资料库改为单一目录树：网站书签可保存在当前文件夹，与说明书/报价表放在一起',
      '支持勾选文件夹生成画像；官网、文本、docx/xlsx/pptx 可混合进同一份画像',
      'Office（docx/xlsx/pptx）生成前抽成文本侧车；引导中可选用一键安装 OfficeCLI（可选，不进主包）',
      '单文件抽取失败可跳过，不因一个坏文件毁掉整次生成',
    ],
  },
]

export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number.parseInt(n, 10) || 0)
  const pb = b.split('.').map((n) => Number.parseInt(n, 10) || 0)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0
    const db = pb[i] ?? 0
    if (da !== db) return da > db ? 1 : -1
  }
  return 0
}

export function latestChangelogVersion(): string {
  return changelogReleases[0]?.version ?? CHANGELOG_STARTED_AT
}

/** 记录中出现过的版本号，新到旧 */
export function recordedVersions(): string[] {
  return changelogReleases.map((r) => r.version)
}

/**
 * 列出 (from, to] 区间内的版本说明。
 * from 为空或早于记录起点时，视为「起点之前」，返回 to 及更早的全部已记录条目。
 */
export function releasesBetween(
  from: string,
  to: string,
  entries = changelogReleases,
): ChangelogRelease[] {
  if (from && compareVersions(from, to) === 0) {
    return entries.filter((entry) => entry.version === from)
  }
  return entries
    .filter((entry) => {
      if (compareVersions(entry.version, to) > 0) return false
      if (from && compareVersions(from, CHANGELOG_STARTED_AT) >= 0) {
        if (compareVersions(entry.version, from) <= 0) return false
      }
      return true
    })
    .sort((a, b) => compareVersions(b.version, a.version))
}
