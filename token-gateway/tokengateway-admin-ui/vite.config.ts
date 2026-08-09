import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const proxyTarget = env.VITE_ADMIN_PROXY_TARGET || 'http://127.0.0.1:8089'

  return {
    base: '/',
    plugins: [vue()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/admin': {
          target: proxyTarget,
          changeOrigin: true,
        },
        '/actuator': {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
    build: {
      // 直接打进 admin 静态目录，随 Boot jar / 内嵌 Tomcat 对外提供
      outDir: fileURLToPath(new URL('../token-gateway-admin/src/main/resources/static', import.meta.url)),
      emptyOutDir: true,
    },
  }
})
