export interface DocMeta {
  slug: string
  title: string
  seoTitle: string
  description: string
}

export const docsIndex: DocMeta[] = [
  {
    slug: 'getting-started',
    title: '快速开始',
    seoTitle: '外贸获客智能体快速开始 | 一次获客闭环',
    description:
      '用 FTCS 外贸获客智能体走通一次闭环：安装、开通官方通道、产品画像、广撒网或社媒发现与开发信草稿。',
  },
  {
    slug: 'install',
    title: '安装与前置',
    seoTitle: '外贸获客系统安装 | Node、Chrome 与 OpenCode',
    description:
      '安装 FTCS 外贸获客系统：Windows 安装包或便携版，以及 Node.js 22+、Google Chrome、OpenCode 与官方通道说明。',
  },
  {
    slug: 'workflow',
    title: '推荐使用流程',
    seoTitle: '外贸获客标准路径 | 录入到开发信草稿',
    description:
      'FTCS 外贸获客标准路径：产品录入、产品画像、广撒网与社媒发现、线索评分、可选补全联系人、开发信多收件人与中文对照。',
  },
  {
    slug: 'faq',
    title: '常见问题',
    seoTitle: '外贸获客常见问题 | 智能体、数据与发信边界',
    description:
      'FTCS 外贸获客智能体是什么、和其他获客方式或领英开发有何不同、数据是否上传、Hunter 与开发信审阅，以及安装与探索排障。',
  },
  {
    slug: 'places-api-key',
    title: '申请 Places API Key',
    seoTitle: 'Google Places API Key 申请 | R3 地图发现',
    description:
      '在 Google Cloud Console 启用 Places API (New)、创建 API Key 并配置到 FTCS 桌面端，用于 R3 地图发现；含网络合规说明。',
  },
  {
    slug: 'hunter-api-key',
    title: '申请 Hunter API Key',
    seoTitle: 'Hunter API Key 申请 | 补全联系人与验邮',
    description:
      '在 Hunter 创建 API Key 并配置到 FTCS 桌面端，用于线索页补全联系人与邮箱验证；可选扩展，不影响主路径。',
  },
]
