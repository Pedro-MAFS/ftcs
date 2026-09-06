export type OnboardingPhase = 'env' | 'keys' | 'tour' | 'done'

export interface OnboardingState {
  version: 1
  completed: boolean
  skipped: boolean
  phase: OnboardingPhase
  tourStep: number
  updatedAt: string
}

export type EnvProbeStatus = 'ok' | 'missing' | 'outdated' | 'error'

export interface EnvProbeItem {
  id: 'node' | 'opencode' | 'chrome' | 'officecli'
  label: string
  status: EnvProbeStatus
  detail: string
  installUrl?: string
  optional?: boolean
}

export interface EnvProbeResult {
  ok: boolean
  checkedAt: string
  items: EnvProbeItem[]
}

export type NodeInstallMethod = 'portable' | 'reinstall' | 'already-ok'

export type NodeInstallErrorCode =
  | 'unsupported-platform'
  | 'busy'
  | 'network'
  | 'checksum'
  | 'extract-failed'
  | 'write-failed'
  | 'verify-failed'
  | 'already-ok'
  | 'unknown'

export type NodeInstallProgressPhase =
  | 'checking'
  | 'downloading'
  | 'verifying'
  | 'installing'
  | 'done'
  | 'failed'

export interface NodeInstallProgress {
  phase: NodeInstallProgressPhase
  message: string
}

export type NodeInstallResult =
  | {
      ok: true
      version: string
      method: NodeInstallMethod
      message: string
      needsRestart: false
      binaryPath: string
      logPath?: string
    }
  | {
      ok: false
      code: NodeInstallErrorCode
      message: string
      logPath?: string
      manualUrl: string
    }

export type OpenCodeInstallMethod = 'portable' | 'reinstall' | 'already-ok'

export type OpenCodeInstallErrorCode =
  | 'unsupported-platform'
  | 'busy'
  | 'network'
  | 'checksum'
  | 'extract-failed'
  | 'write-failed'
  | 'verify-failed'
  | 'already-ok'
  | 'unknown'

export type OpenCodeInstallProgressPhase =
  | 'checking'
  | 'downloading'
  | 'verifying'
  | 'installing'
  | 'done'
  | 'failed'

export interface OpenCodeInstallProgress {
  phase: OpenCodeInstallProgressPhase
  message: string
}

export type OpenCodeInstallResult =
  | {
      ok: true
      version: string
      method: OpenCodeInstallMethod
      binaryPath: string
      message: string
      needsRestart: false
      logPath?: string
    }
  | {
      ok: false
      code: OpenCodeInstallErrorCode
      message: string
      logPath?: string
      manualUrl: string
    }

export type OfficeCliInstallMethod = 'download' | 'reinstall'

export type OfficeCliInstallErrorCode =
  | 'unsupported-platform'
  | 'network'
  | 'checksum'
  | 'write-failed'
  | 'verify-failed'
  | 'busy'
  | 'unknown'

export type OfficeCliInstallProgressPhase =
  | 'checking'
  | 'downloading'
  | 'verifying'
  | 'installing'
  | 'done'
  | 'failed'

export interface OfficeCliInstallProgress {
  phase: OfficeCliInstallProgressPhase
  message: string
}

export type OfficeCliInstallResult =
  | {
      ok: true
      version: string
      method: OfficeCliInstallMethod
      binaryPath: string
      message: string
      needsRestart: false
      logPath?: string
    }
  | {
      ok: false
      code: OfficeCliInstallErrorCode
      message: string
      logPath?: string
      manualUrl: string
    }

export interface OfficeCliReadyResult {
  ready: boolean
  installSupported: boolean
}

export const TOUR_STEPS = [
  {
    id: 'input',
    route: 'input',
    title: '产品录入',
    desc: '粘贴官网 / 上传资料',
    detail:
      '在「录入」页粘贴产品官网 URL，或上传说明书等资料。保存产品后即可启动画像生成。可用示例产品 _example 先跑通整条链路。',
  },
  {
    id: 'profile',
    route: 'profile',
    title: '画像生成',
    desc: 'Agent 抽取产品画像',
    detail:
      '在「画像」页启动生成。系统会用 chrome-devtools 打开网站并整理公司/产品/买家画像。环境未就绪时会先弹出预检说明。',
  },
  {
    id: 'keywords',
    route: 'profile',
    title: '关键字扩展',
    desc: '大模型生成搜索词',
    detail:
      '画像就绪后，在画像页扩展搜索关键词。由大模型根据画像与获客目标生成五维 query，再经 keywords_save 落盘，供后续 R1 探索使用。',
  },
  {
    id: 'explore',
    route: 'explore',
    title: 'R1 线索探索',
    desc: '搜索 + 打开网页核验',
    detail:
      '在「探索」页启动 R1。需要 Tavily 等搜索 Key，以及可用的 Chrome。可配置最多探索词数。',
  },
  {
    id: 'score',
    route: 'leads',
    title: '评分与去重',
    desc: '筛选高意向线索',
    detail:
      '探索完成后，在线索或探索页执行评分去重，得到 high / medium / low 分层结果。',
  },
  {
    id: 'draft',
    route: 'email',
    title: '生成邮件',
    desc: '起草开发信草稿',
    detail:
      '对高意向线索批量或单条生成开发信草稿。可在邮件页查看 short / professional 变体。',
  },
  {
    id: 'review',
    route: 'email',
    title: '邮件审核',
    desc: '通过并保存到工作区',
    detail:
      '审核草稿内容后点「通过并保存」。当前不会真正发信，只是把审核结果落盘到工作区。',
  },
] as const
