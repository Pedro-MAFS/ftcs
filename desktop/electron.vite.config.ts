import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin, loadEnv } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

function pickOrigin(
  fileEnv: Record<string, string>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const fromProcess = process.env[key]?.trim()
    if (fromProcess) return fromProcess
    const fromFile = fileEnv[key]?.trim()
    if (fromFile) return fromFile
  }
  return undefined
}

export default defineConfig(({ mode }) => {
  // 第三参 ''：加载全部键（默认只加载带 VITE_ 前缀的，FTCS_* 会被忽略）
  const fileEnv = loadEnv(mode, process.cwd(), '')

  const siteOrigin =
    pickOrigin(fileEnv, 'FTCS_SITE_ORIGIN', 'VITE_FTCS_SITE_ORIGIN') ||
    'https://ai-utills.com'
  const userOrigin =
    pickOrigin(
      fileEnv,
      'FTCS_USER_ORIGIN',
      'VITE_FTCS_USER_ORIGIN',
      'FTCS_OAUTH_ISSUER',
    ) || 'https://user.ai-utills.com'

  const rendererSiteDefine = {
    'import.meta.env.VITE_FTCS_SITE_ORIGIN': JSON.stringify(
      siteOrigin.replace(/\/+$/, ''),
    ),
    'import.meta.env.VITE_FTCS_USER_ORIGIN': JSON.stringify(
      userOrigin.replace(/\/+$/, ''),
    ),
  }

  return {
    main: {
      plugins: [externalizeDepsPlugin()],
      build: {
        rollupOptions: {
          input: {
            index: resolve(__dirname, 'electron/main.ts'),
          },
        },
      },
    },
    preload: {
      plugins: [externalizeDepsPlugin()],
      build: {
        rollupOptions: {
          input: {
            index: resolve(__dirname, 'electron/preload.ts'),
          },
        },
      },
    },
    renderer: {
      root: '.',
      define: rendererSiteDefine,
      build: {
        rollupOptions: {
          input: {
            index: resolve(__dirname, 'index.html'),
          },
        },
      },
      resolve: {
        alias: {
          '@': resolve('src'),
        },
      },
      plugins: [vue()],
    },
  }
})
