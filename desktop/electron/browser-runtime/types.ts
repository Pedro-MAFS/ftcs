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
