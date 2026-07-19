import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

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
})
