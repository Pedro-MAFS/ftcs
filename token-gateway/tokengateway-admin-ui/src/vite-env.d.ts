/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}

interface ImportMetaEnv {
  readonly VITE_ADMIN_API_BASE: string
  readonly VITE_ADMIN_PROXY_TARGET?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
