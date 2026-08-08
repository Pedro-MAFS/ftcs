export interface DocMeta {
  slug: string
  title: string
  description: string
}

export const docsIndex: DocMeta[] = [
  {
    slug: 'getting-started',
    title: '快速开始',
    description: '10 分钟走通：安装 → 开通官方通道 → 第一条线索与邮件草稿',
  },
  {
    slug: 'install',
    title: '安装与前置',
    description: 'Node 22+、Google Chrome、OpenCode、官方/自定义通道与安装包说明',
  },
  {
    slug: 'workflow',
    title: '推荐使用流程',
    description: '录入、画像、探索、评分、开发信审核的标准路径',
  },
  {
    slug: 'faq',
    title: '常见问题',
    description: '官方通道、搜索、充值、探索无结果与下载链接等',
  },
]
