import type { RouteRecordRaw } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import DocsIndexView from '../views/DocsIndexView.vue'
import DocView from '../views/DocView.vue'
import DownloadView from '../views/DownloadView.vue'
import { docsIndex } from '../content/docs-index'

export const routes: RouteRecordRaw[] = [
  { path: '/', name: 'home', component: HomeView },
  { path: '/docs', name: 'docs', component: DocsIndexView },
  { path: '/docs/:slug', name: 'doc', component: DocView, props: true },
  { path: '/download', name: 'download', component: DownloadView },
]

/** SSG 预渲染路径（含动态文档页） */
export function ssgRoutes(): string[] {
  return [
    '/',
    '/download',
    '/docs',
    ...docsIndex.map((d) => `/docs/${d.slug}`),
  ]
}
