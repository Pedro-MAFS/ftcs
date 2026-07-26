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

export interface SiteConfig {
  brand: string
  productName: string
  tagline: string
  version: string
  /** 下载页顶部提示（可选） */
  downloadTip?: string
  downloads: DownloadItem[]
}

/**
 * 站点与下载配置。
 * 启用下载：为 mirrors[].url 填写完整 http(s) 链接。
 */
export const siteConfig: SiteConfig = {
  brand: 'FTCS',
  productName: '外贸获客',
  tagline: '把产品信息变成可行动的外贸线索与开发信草稿',
  version: '0.3.0',
  downloadTip: '国内用户建议优先使用 Gitee 下载，速度通常明显更快；海外或 Gitee 不可用时可改用 GitHub。',
  downloads: [
    {
      id: 'setup',
      label: 'Windows 安装包',
      filename: '外贸获客-Setup-0.3.0.exe',
      note: 'NSIS 安装程序',
      mirrors: [
        {
          id: 'gitee',
          label: 'Gitee 下载',
          badge: '国内更快',
          primary: true,
          url: 'https://gitee.com/mfs1998_admin/ftcs/releases/download/V0.3.0/%E5%A4%96%E8%B4%B8%E8%8E%B7%E5%AE%A2-Setup-0.3.0.exe',
        },
        {
          id: 'github',
          label: 'GitHub 下载',
          url: 'https://github.com/Pedro-MAFS/ftcs/releases/download/0.3.0/foreign-trade-Setup-0.3.0.exe',
        },
      ],
    },
    {
      id: 'portable',
      label: 'Windows 便携版',
      filename: '外贸获客-Portable-0.3.0.exe',
      note: '解压即用，无需安装',
      mirrors: [
        {
          id: 'gitee',
          label: 'Gitee 下载',
          badge: '国内更快',
          primary: true,
          url: 'https://gitee.com/mfs1998_admin/ftcs/releases/download/V0.3.0/%E5%A4%96%E8%B4%B8%E8%8E%B7%E5%AE%A2-Portable-0.3.0.exe',
        },
        {
          id: 'github',
          label: 'GitHub 下载',
          url: 'https://github.com/Pedro-MAFS/ftcs/releases/download/0.3.0/foreign-trade-Portable-0.3.0.exe',
        },
      ],
    },
  ],
}
