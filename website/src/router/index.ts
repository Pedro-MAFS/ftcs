import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import DocsIndexView from '../views/DocsIndexView.vue'
import DocView from '../views/DocView.vue'
import DownloadView from '../views/DownloadView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/docs', name: 'docs', component: DocsIndexView },
    { path: '/docs/:slug', name: 'doc', component: DocView, props: true },
    { path: '/download', name: 'download', component: DownloadView },
  ],
  scrollBehavior(to) {
    if (to.hash) {
      return { el: to.hash, top: 72 }
    }
    return { top: 0 }
  },
})

export default router
