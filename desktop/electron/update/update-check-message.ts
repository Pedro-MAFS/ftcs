/** 失败必须以「检查更新失败」开头，不能写成已是最新。 */
export function formatUpdateCheckMessage(input: {
  ok: boolean
  hasUpdate: boolean
  currentVersion: string
  latestVersion: string | null
  errorMessage?: string
}): string {
  if (!input.ok) {
    const raw = (input.errorMessage || '未知错误').trim() || '未知错误'
    return raw.startsWith('检查更新失败') ? raw : `检查更新失败：${raw}`
  }
  if (input.hasUpdate) return `发现新版本 ${input.latestVersion ?? ''}`.trim()
  return `已是最新版本（${input.currentVersion}）`
}
