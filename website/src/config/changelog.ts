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
