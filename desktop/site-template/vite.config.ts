import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'
import { SitemapStream, streamToPromise } from 'sitemap'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const siteUrl = (process.env.SITE_URL || loadEnv(mode, process.cwd(), '').SITE_URL || '').trim()
  let publicRoutes: string[] = []
  return {
    plugins: [vue()],
    ssgOptions: {
      dirStyle: 'nested',
      // For dynamic product pages, add their concrete paths here from project data.
      includedRoutes(paths: string[]) {
        publicRoutes = [...new Set(paths)]
        return publicRoutes
      },
      async onFinished() {
        if (!siteUrl) {
          console.warn('SITE_URL 未配置，跳过站点地图生成。')
          return
        }
        let url: URL
        try { url = new URL(siteUrl) } catch { throw new Error('SITE_URL 必须是完整的 HTTPS 站点地址。') }
        if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash || ['localhost', '127.0.0.1', '0.0.0.0', 'example.com', 'example.org', 'example.net'].includes(url.hostname.toLowerCase()) || url.hostname.toLowerCase().endsWith('.localhost')) {
          throw new Error('SITE_URL 必须是已确认的 HTTPS 站点根地址，不能使用本地或示例地址。')
        }
        const stream = new SitemapStream({ hostname: url.origin })
        const xml = streamToPromise(stream)
        for (const route of publicRoutes) stream.write({ url: route })
        stream.end()
        await writeFile(resolve('dist/sitemap.xml'), await xml)
        const robotsPath = resolve('dist/robots.txt')
        const robots = await readFile(robotsPath, 'utf8')
        const declaration = `Sitemap: ${url.origin}/sitemap.xml`
        if (!robots.split(/\r?\n/).some(line => line.trim().toLowerCase() === declaration.toLowerCase())) {
          await writeFile(robotsPath, `${robots.trimEnd()}\n\n${declaration}\n`, 'utf8')
        }
      },
    },
  }
})
