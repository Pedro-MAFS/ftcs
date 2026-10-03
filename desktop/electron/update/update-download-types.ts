export type UpdateDownloadPhase = 'idle' | 'downloading' | 'ready' | 'failed'

/** 主进程推给横幅的下载状态。idle 表示当前没有下载任务。 */
export interface UpdateDownloadState {
  phase: UpdateDownloadPhase
  version: string | null
  received: number
  /** 未知总长时为 null，界面不得据此编造百分比 */
  total: number | null
  message: string
  /** 「稍后」只收起强提示，不删安装包 */
  deferred: boolean
  downloadPage: string
  /** 每次推送递增，界面丢掉更早的快照 */
  revision: number
}

export interface UpdateDownloadRequest {
  version: string
  setupUrl?: string
  setupUrlFallback?: string
  setupSha256?: string
  downloadPage: string
}
