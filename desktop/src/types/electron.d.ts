import type { AppStatus } from './app'

declare global {
  interface Window {
    ftcs?: {
      platform: NodeJS.Platform
      getAppStatus: () => Promise<AppStatus>
      restartOpenCode: () => Promise<AppStatus>
      getOpenCodeLogs: () => Promise<string[]>
      restartSidecar: () => Promise<AppStatus>
      getSidecarLogs: () => Promise<string[]>
    }
  }
}

export {}
