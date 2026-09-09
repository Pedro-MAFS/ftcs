export interface DownloadMirror {
  id: 'gitee' | 'github'
  label: string
  /** 留空则该镜像按钮禁用 */
  url: string
  /** 展示用推荐标记，如「国内更快」 */
  badge?: string
  /** 是否作为主按钮（国内默认推荐 Gitee） */
  primary?: boolean
}

export interface DownloadItem {
  id: string
  label: string
  filename: string
  note?: string
  mirrors: DownloadMirror[]
}

export interface GeoFaqItem {
  id: string
  question: string
  answer: string
}

export interface SiteConfig {
  brand: string
  productName: string
  productFullName: string
  agentName: string
  tagline: string
  version: string
  siteUrl: string
  brandSiteUrl: string
  brandSiteName: string
  ogImage: string
  aliases: string[]
  /** 页脚联系电话（含国际区号，如 +8617…） */
  phone?: string
  /** 页脚联系邮箱 */
  email?: string
  /** 下载页顶部提示（可选） */
  downloadTip?: string
  /** Microsoft Clarity 项目 ID；留空则不加载统计脚本 */
  clarityProjectId?: string
  downloads: DownloadItem[]
}

/**
 * 站点与下载配置。
 * 启用下载：为 mirrors[].url 填写完整 http(s) 链接。
 */
export const siteConfig: SiteConfig = {
  brand: 'FTCS',
  productName: '外贸获客',
  productFullName: '外贸获客系统',
  agentName: '外贸获客智能体',
  tagline: '把产品信息变成可行动的外贸线索与开发信草稿',
  version: '0.5.4',
  siteUrl: 'https://ftcs.ai-utills.com',
  brandSiteUrl: 'https://ai-utills.com',
  brandSiteName: 'AI-Utills',
  ogImage: '/screenshots/ftcs-线索.png',
  aliases: [
    '外贸获客',
    '外贸获客系统',
    '外贸获客智能体',
    '外贸获客 Agent',
    'FTCS Agent',
  ],
  phone: '+8617852032649',
  email: 'mfs1998@qq.com',
  downloadTip:
    '国内用户建议优先使用 Gitee 下载，速度通常明显更快；海外或 Gitee 不可用时可改用 GitHub。',
  // 在 https://clarity.microsoft.com/ 创建项目后，把项目 ID 填到这里即可启用
  clarityProjectId: 'y8t57c1867',
  downloads: [
    {
      id: 'setup',
      label: 'Windows 安装包',
      filename: '外贸获客-Setup-0.5.4.exe',
      note: 'NSIS 安装程序',
      mirrors: [
        {
          id: 'gitee',
          label: 'Gitee 下载',
          badge: '国内更快',
          primary: true,
          url: 'https://gitee.com/mfs1998_admin/ftcs/releases/download/V0.5.4/%E5%A4%96%E8%B4%B8%E8%8E%B7%E5%AE%A2-Setup-0.5.4.exe',
        },
        {
          id: 'github',
          label: 'GitHub 下载',
          url: 'https://github.com/Pedro-MAFS/ftcs/releases/download/0.5.4/foreign-trade-Setup-0.5.4.exe',
        },
      ],
    },
    {
      id: 'portable',
      label: 'Windows 便携版',
      filename: '外贸获客-Portable-0.5.4.exe',
      note: '解压即用，无需安装',
      mirrors: [
        {
          id: 'gitee',
          label: 'Gitee 下载',
          badge: '国内更快',
          primary: true,
          url: 'https://gitee.com/mfs1998_admin/ftcs/releases/download/V0.5.4/%E5%A4%96%E8%B4%B8%E8%8E%B7%E5%AE%A2-Portable-0.5.4.exe',
        },
        {
          id: 'github',
          label: 'GitHub 下载',
          url: 'https://github.com/Pedro-MAFS/ftcs/releases/download/0.5.4/foreign-trade-Portable-0.5.4.exe',
        },
      ],
    },
  ],
}

/** 与 docs/18 §2 冻结文案一致；改口径先改计划文档再改此处。 */
export const seoCopy = {
  home: {
    title: 'FTCS 外贸获客系统 | AI获客智能体（Agent）与开发信草稿',
    description:
      'FTCS 是专为外贸企业打造的本机 AI 获客系统（智能体 / Agent）。把官网与说明书交给它，生成产品与买家画像，在公开网页广撒网，也可按社媒公开摘要或 Google 地图发现公司并核对官网，再评分去重、写出可改稿的开发信草稿。数据与密钥留在本机。',
    path: '/',
  },
  download: {
    title: '下载外贸获客系统 | FTCS Windows 桌面智能体',
    description:
      '下载 FTCS 外贸获客系统 Windows 安装包或便携版。本机 AI 智能体：产品画像、公开网页与社媒公开摘要探索、开发信草稿。国内建议 Gitee，海外可用 GitHub。',
    path: '/download',
  },
  docs: {
    title: '外贸获客智能体帮助 | 安装、获客流程与常见问题',
    description: '如何安装并使用 FTCS 外贸获客系统：安装前置、一次获客闭环、标准路径与常见问题。',
    path: '/docs',
  },
  changelog: {
    title: '发布日志',
    description: `查看 FTCS 外贸获客系统各版本更新说明。发布日志自 0.5.0 起记录。`,
    path: '/changelog',
  },
  supportPlan: {
    title: '支持计划 | FTCS 外贸获客系统',
    description:
      '查看 FTCS 已纳入计划的功能方向：优先级、开发中与规划中状态。欢迎通过桌面版意见反馈参与。',
    path: '/plan',
  },
} as const

export const geoFaqs: GeoFaqItem[] = [
  {
    id: 'what-is-ftcs',
    question: 'FTCS / 外贸获客智能体是什么？',
    answer:
      'FTCS 是 AI-Utills 旗下的 Windows 桌面外贸获客智能体（Agent）。在本机把产品资料变成画像、公开网页线索和可改稿开发信。产品站：https://ftcs.ai-utills.com/',
  },
  {
    id: 'vs-customs-linkedin',
    question: '外贸获客系统和海关数据、领英开发有什么不同？',
    answer:
      '海关数据给你进口记录，领英销售工具帮你找联系人。FTCS 从你的产品画像出发，在公开网页广撒网，也可按领英、脸书等公开主页的搜索摘要发现公司并核对官网，再写出可改稿的开发信。不登录社媒、不代替领英开发——获客闭环留在本机。',
  },
  {
    id: 'data-and-send',
    question: '数据会上传到官网吗？现在能直接发开发信吗？',
    answer:
      '业务数据与密钥只在你电脑上，官网只做展示与下载。开发信先生成可改稿草稿，你确认后再用，发出节奏由你掌握，避免误触达客户。',
  },
]

export function absoluteUrl(path = '/'): string {
  const origin = siteConfig.siteUrl.replace(/\/$/, '')
  if (!path || path === '/') return `${origin}/`
  return `${origin}${path.startsWith('/') ? path : `/${path}`}`
}

export function ogImageUrl(): string {
  return encodeURI(absoluteUrl(siteConfig.ogImage))
}
