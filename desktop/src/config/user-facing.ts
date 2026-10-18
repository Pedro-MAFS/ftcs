/** 用户可见失败句。技术原文只进诊断信息。 */

export const USER_FAILURE = '操作失败，请重试'
export const RUNTIME_NOT_READY = '服务未就绪，请稍后或重启应用'
export const RECONNECT_UNAVAILABLE = '暂不支持重新连接，请重启应用'
export const UPDATE_CHECK_FAILED = '检查更新失败，请重试或前往官网下载'
export const UPDATE_FAILED = '更新失败，请重试或前往官网下载'

const INTERNAL =
  /OpenCode|\bMCP\b|Token 网关|(^|[^A-Za-z0-9])R[1-4]([^A-Za-z0-9]|$)|opencode\.json|workspace\/\.env|(^|[^\w])\.env\b|discover-|keywords_save|hunter_|Clash|\bTUN\b|翻墙|127\.0\.0\.1:7890|SOCKS5|接口不可用|HTTP\s*\d{3}|US-[A-Z]/

export function isInternalUserText(message: string): boolean {
  return INTERNAL.test(message)
}

export function splitUserText(
  message: string,
  fallback = USER_FAILURE,
): { text: string; diagnostic: string } {
  const raw = message.trim()
  if (!raw || !isInternalUserText(raw)) {
    return { text: raw, diagnostic: '' }
  }
  if (/重连|重新连接/.test(raw)) {
    return { text: RECONNECT_UNAVAILABLE, diagnostic: raw }
  }
  if (/未运行|未初始化|未就绪/.test(raw)) {
    return { text: RUNTIME_NOT_READY, diagnostic: raw }
  }
  if (/检查更新失败/.test(raw)) {
    return { text: UPDATE_CHECK_FAILED, diagnostic: raw }
  }
  if (/更新失败|下载失败/.test(raw)) {
    return { text: UPDATE_FAILED, diagnostic: raw }
  }
  return { text: fallback, diagnostic: raw }
}
