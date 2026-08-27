import { ViteSSG } from 'vite-ssg'
import App from './App.vue'
import { routes } from './router/routes'
import { initClarity } from './lib/clarity'
import './styles/main.css'

export const createApp = ViteSSG(
  App,
  {
    routes,
    base: import.meta.env.BASE_URL,
    scrollBehavior(to) {
      if (to.hash) {
        return { el: to.hash, top: 72 }
      }
      return { top: 0 }
    },
  },
  () => {
    // plugins / head 由 vite-ssg 内置 @unhead/vue 处理
    initClarity()
  },
)
