export type BuiltinBrowserMode = 'hidden' | 'thumbnail' | 'expanded'

export interface BuiltinBrowserStatus {
  ok: boolean
  windowAlive: boolean
  mode: BuiltinBrowserMode
  browserUrl: string | null
  detail: string
  diagnostic?: string
}

export interface BuiltinBrowserUiState {
  alive: boolean
  visible: boolean
  mode: BuiltinBrowserMode
  title: string
  url: string
}

export interface ScreenRect {
  x: number
  y: number
  width: number
  height: number
}

export interface BuiltinBrowserSlot {
  x: number
  y: number
  width: number
  height: number
  visible: boolean
  browserKey: string
}

export interface BuiltinBrowserTabSnapshot {
  browserKey: string
  title: string
  url: string
  origin: 'user' | 'task'
  taskId: string | null
  canGoBack: boolean
  canGoForward: boolean
}

export interface BuiltinBrowserTabsPayload {
  tabs: BuiltinBrowserTabSnapshot[]
  focusKey: string | null
}
