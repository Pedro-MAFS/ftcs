import { ViteSSG } from 'vite-ssg'
import App from './App.vue'
import Home from './pages/Home.vue'

export const routes = [{ path: '/', component: Home }]

export const createApp = ViteSSG(App, { routes })
