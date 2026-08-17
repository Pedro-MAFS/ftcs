import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import type { ViteSSGOptions } from 'vite-ssg'

/**
 * 部署到 nginx html/ftcs/ 时 base 必须为 /ftcs/
 * 本地开发访问：http://localhost:5173/ftcs/
 */
export default defineConfig({
  base: '/ftcs/',
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
        '/docs',
        '/docs/getting-started',
        '/docs/install',
        '/docs/workflow',
        '/docs/faq',
      ]
    },
  } satisfies ViteSSGOptions,
})
