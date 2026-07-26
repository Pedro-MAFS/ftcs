import { PRODUCT_LINKS } from '../config/links'

const SHARE_TITLE = '外贸获客智能体'

/** 分享文案：官网下载页（随 FTCS_SITE_ORIGIN / 构建注入变化） */
export function getAppSharePayload(): { title: string; text: string; url: string } {
  const url = PRODUCT_LINKS.download
  return {
    title: SHARE_TITLE,
    url,
    text: `${SHARE_TITLE}\n下载安装：${url}`,
  }
}

/**
 * 分享应用：优先系统分享；否则复制下载页链接到剪贴板。
 * 无需登录。
 */
export async function shareAppDownload(): Promise<{ ok: boolean; message: string }> {
  const { title, text, url } = getAppSharePayload()

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text, url })
      return { ok: true, message: '已打开系统分享' }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return { ok: false, message: '已取消分享' }
      }
      // 继续走剪贴板
    }
  }

  try {
    await navigator.clipboard.writeText(text)
    return { ok: true, message: '下载链接已复制，可粘贴分享给好友' }
  } catch {
    return {
      ok: false,
      message: `复制失败，请手动分享：${url}`,
    }
  }
}
