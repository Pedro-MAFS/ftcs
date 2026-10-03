/** 启动 NSIS 安装向导时的参数。必须为空，不能带 /S 或其它静默开关。 */
export const NSIS_INSTALLER_ARGS: readonly string[] = []

export function setupInstallerFileName(version: string): string {
  return `外贸获客-Setup-${version.trim()}.exe`
}

export function defaultSetupUrls(version: string): { primary: string; fallback: string } {
  const v = version.trim()
  const fileName = setupInstallerFileName(v)
  return {
    primary: `https://gitee.com/mfs1998_admin/ftcs/releases/download/V${v}/${encodeURIComponent(fileName)}`,
    fallback: `https://github.com/Pedro-MAFS/ftcs/releases/download/${v}/foreign-trade-Setup-${v}.exe`,
  }
}

/** 清单里的地址优先；没有则用 Gitee → GitHub 默认规则。 */
export function resolveSetupDownloadUrls(
  version: string,
  manifest?: { setupUrl?: string; setupUrlFallback?: string },
): { primary: string; fallback: string } {
  const defaults = defaultSetupUrls(version)
  const primary = manifest?.setupUrl?.trim() || defaults.primary
  const fallback = manifest?.setupUrlFallback?.trim() || defaults.fallback
  return { primary, fallback }
}

export function installerCommand(exePath: string): { command: string; args: readonly string[] } {
  return { command: exePath, args: NSIS_INSTALLER_ARGS }
}

export type SetupSha256Expectation =
  | { kind: 'skip' }
  | { kind: 'check'; hex: string }
  | { kind: 'invalid' }

/** 空字段不校验；64 位十六进制才校验；写了但格式不对视为无效。 */
export function parseSetupSha256(raw: unknown): SetupSha256Expectation {
  if (typeof raw !== 'string') return { kind: 'skip' }
  const value = raw.trim().toLowerCase()
  if (!value) return { kind: 'skip' }
  if (!/^[0-9a-f]{64}$/.test(value)) return { kind: 'invalid' }
  return { kind: 'check', hex: value }
}
