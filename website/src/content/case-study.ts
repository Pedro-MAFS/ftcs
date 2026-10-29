import { withBase } from '../lib/base'

export const casePath = '/cases/product-to-outreach'
export const caseAsset = (name: string) => withBase(`cases/product-to-outreach/${name}`)
export const caseSteps = [
  { time: 6, label: '00:06', title: '先让 AI 读懂你的产品', action: '输入官网，检查产品画像，并补充目标市场。', result: '产品、卖点、目标买家与市场方向。', check: '产品描述和买家类型，是否符合你的实际业务？', image: '01-product-profile.jpg' },
  { time: 30, label: '00:30', title: '把产品名展开成搜索方向', action: '新建探索任务，再点击「编辑关键词」检查和调整。', result: '本次生成 160 条搜索词，覆盖全网、社媒和地图。', check: '结合品类、买家角色和地区，确认你想找的渠道。', image: '02-keywords.jpg' },
  { time: 50, label: '00:50', title: '从不同入口发现候选企业', action: '选择发现渠道，点击开始，再到「线索」查看结果。', result: '公司官网、地区与业务信息汇入同一线索库。', check: '搜索结果仍需核验，不代表对方已有采购需求。', image: '03-web-discovery.jpg' },
  { time: 78, label: '01:18', title: '判断哪些企业值得跟进', action: '点击「评分去重」，打开公司详情检查匹配理由。', result: '累计 89 条记录去重保留 86 条，其中 A 级 10 条。', check: '结合公司画像与实际经营范围，决定优先联系谁。', image: '05-company-detail.jpg' },
  { time: 98, label: '01:38', title: '为选定企业准备第一封信', action: '在企业所在行点击「写邮件」，检查后通过并保存。', result: '英文开发信草稿、中文对照与个性化依据。', check: '确认引用和供货承诺准确，再自行安排发送与跟进。', image: '06-email-review.jpg' },
]

export const startFaqs = [
  { question: '第一次使用，需要准备什么？', answer: '一台 Windows 10 / 11（64位）电脑，以及你的产品官网或资料。安装后按应用引导一键准备运行环境，再开通官方通道或配置自定义服务。' },
  { question: '使用费用怎么算？', answer: '官方通道的模型与搜索按账户用量计费，价格与余额可在应用内查看。地图发现需另行开通相关能力；联系人补全是可选服务。' },
  { question: 'A级线索就是有采购意向的客户吗？', answer: 'A级代表系统根据产品与企业信息给出的匹配分级，用于安排核验与跟进顺序；不表示对方已经表达采购意向。' },
  { question: '会直接替我发送开发信吗？', answer: '当前流程完成开发信草稿与人工审核。你可以检查英文、中文对照和个性化依据，通过后保存草稿，发出节奏由你掌握。' },
]
