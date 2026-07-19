export interface DownloadItem {
  id: string
  label: string
  filename: string
  /** 留空则下载页按钮禁用；确认分发地址后填入完整 URL */
  url: string
  note?: string
}

export interface SiteConfig {
  brand: string
  productName: string
  tagline: string
  version: string
  downloads: DownloadItem[]
}

/**
 * 站点与下载配置。
 * 启用下载：仅需填写 downloads[].url（完整 http(s) 链接）。
 */
export const siteConfig: SiteConfig = {
  brand: 'FTCS',
  productName: '外贸获客',
  tagline: '把产品信息变成可行动的外贸线索与开发信草稿',
  version: '0.1.0',
  downloads: [
    {
      id: 'setup',
      label: 'Windows 安装包',
      filename: '外贸获客-Setup-0.1.0.exe',
      url: '',
      note: 'NSIS 安装程序',
    },
    {
      id: 'portable',
      label: 'Windows 便携版',
      filename: '外贸获客-Portable-0.1.0.exe',
      url: '',
      note: '解压即用，无需安装',
    },
  ],
}
