export const DETAIL_READY = '内置浏览器已就绪'
export const DETAIL_WINDOW_CLOSED = '内置浏览器没有打开。请点「重新检测」。'
export const DETAIL_UNREACHABLE =
  '内置浏览器暂时连不上。请点「重新检测」。若仍失败，请重启应用。'

export function judgeBuiltinBrowserReady(input: {
  windowAlive: boolean
  versionHttpStatus: number | null
  webSocketDebuggerUrl: string | null
}): { status: 'ok' | 'error'; detail: string } {
  const ws = input.webSocketDebuggerUrl
  const versionOk =
    input.versionHttpStatus === 200 && typeof ws === 'string' && ws.trim() !== ''
  if (input.windowAlive && versionOk) {
    return { status: 'ok', detail: DETAIL_READY }
  }
  if (!input.windowAlive) {
    return { status: 'error', detail: DETAIL_WINDOW_CLOSED }
  }
  return { status: 'error', detail: DETAIL_UNREACHABLE }
}
