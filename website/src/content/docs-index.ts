export interface DocMeta {
  slug: string
  title: string
  description: string
}

export const docsIndex: DocMeta[] = [
  {
    slug: 'getting-started',
    title: '快速开始',
    description: '10 分钟走通：安装 → 配置 → 第一条线索与邮件草稿',
  },
  {
    slug: 'install',
    title: '安装与前置',
    description: 'Node 22+、Google Chrome、OpenCode、API Key 与安装包说明',
  },
  {
    slug: 'workflow',
    title: '推荐使用流程',
    description: '录入、画像、探索、评分、开发信审核的标准路径',
  },
  {
    slug: 'faq',
    title: '常见问题',
    description: 'Sidecar 未就绪、探索无结果、下载链接等',
  },
]
