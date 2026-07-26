/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEV_SERVER_URL?: string
  /** 产品官网根，与 FTCS_SITE_ORIGIN 同步（构建时注入） */
  readonly VITE_FTCS_SITE_ORIGIN?: string
  /** 账号中心根，与 FTCS_USER_ORIGIN 同步（构建时注入） */
  readonly VITE_FTCS_USER_ORIGIN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
