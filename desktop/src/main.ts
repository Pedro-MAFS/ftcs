import { applyDocumentTheme, readStoredUiThemeMode, resolveEffectiveTheme } from './utils/ui-theme'
import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import './styles/main.css'

const bootMode = readStoredUiThemeMode()
applyDocumentTheme(
  resolveEffectiveTheme(
    bootMode,
    window.matchMedia('(prefers-color-scheme: dark)').matches,
  ),
)

createApp(App).use(router).mount('#app')
