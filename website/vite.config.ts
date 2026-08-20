import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import type { ViteSSGOptions } from 'vite-ssg'

/**
 * 线上挂在 https://ftcs.ai-utills.com/（站点根）。本地开发：http://localhost:5173/
 */
export default defineConfig({
  base: '/',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  ssgOptions: {
    script: 'async',
    formatting: 'none',
    /** nested：/download → download/index.html，兼容 try_files $uri $uri/ */
    dirStyle: 'nested',
    /** 预渲染全部营销页与文档（动态路由需显式列出） */
    includedRoutes() {
      return [
        '/',
        '/download',
        '/changelog',
        '/docs',
        '/docs/getting-started',
        '/docs/install',
        '/docs/workflow',
        '/docs/faq',
      ]
    },
  } satisfies ViteSSGOptions,
})
