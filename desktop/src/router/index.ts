import { createRouter, createWebHashHistory } from 'vue-router'
import WorkspaceLayout from '../components/layout/WorkspaceLayout.vue'
import HomeView from '../views/HomeView.vue'
import InputView from '../views/InputView.vue'
import ProfileView from '../views/ProfileView.vue'
import ExploreView from '../views/ExploreView.vue'
import LeadsView from '../views/LeadsView.vue'
import EmailView from '../views/EmailView.vue'
import SettingsView from '../views/SettingsView.vue'
import BootLanding from '../views/BootLanding.vue'
import EmptyView from '../views/EmptyView.vue'
import BrowseView from '../views/BrowseView.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      component: WorkspaceLayout,
      children: [
        { path: '', name: 'boot', component: BootLanding },
        { path: 'home', name: 'home', component: HomeView },
        { path: 'empty', name: 'empty', component: EmptyView },
        { path: 'browse', name: 'browse', component: BrowseView },
        { path: 'input', name: 'input', component: InputView },
        { path: 'profile', name: 'profile', component: ProfileView },
        { path: 'explore', name: 'explore', component: ExploreView },
        { path: 'leads', name: 'leads', component: LeadsView },
        { path: 'email', name: 'email', component: EmailView },
        { path: 'settings', name: 'settings', component: SettingsView },
      ],
    },
  ],
})

export default router
