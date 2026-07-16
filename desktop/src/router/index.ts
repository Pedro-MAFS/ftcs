import { createRouter, createWebHashHistory } from 'vue-router'
import WorkspaceLayout from '../components/layout/WorkspaceLayout.vue'
import InputView from '../views/InputView.vue'
import ProfileView from '../views/ProfileView.vue'
import ExploreView from '../views/ExploreView.vue'
import LeadsView from '../views/LeadsView.vue'
import EmailView from '../views/EmailView.vue'
import SettingsView from '../views/SettingsView.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      component: WorkspaceLayout,
      redirect: { name: 'leads' },
      children: [
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
