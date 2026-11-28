<script setup lang="ts">
import { onActivated, onDeactivated, onMounted } from 'vue'
import { useMainViewTabs } from '../composables/useMainViewTabs'
import { useWorkflowPlanSelection } from '../composables/useWorkflowPlanSelection'
import WorkflowSchedulePanel from '../components/workflow/WorkflowSchedulePanel.vue'
import Icon from '../components/shared/Icon.vue'

defineOptions({ name: 'HomeView' })

const tabs = useMainViewTabs()
const { plans, loadError, reloadPlans } = useWorkflowPlanSelection()
let refreshOnReturn = false
onMounted(() => void reloadPlans())
onDeactivated(() => { refreshOnReturn = true })
onActivated(() => {
  if (refreshOnReturn) void reloadPlans()
  refreshOnReturn = false
})

const shortcuts = [
  { title: '资料库', icon: 'folder', open: () => tabs.openPageTab('input') },
  { title: '产品画像', icon: 'package', open: () => tabs.openPageTab('profile') },
  { title: '获客探索', icon: 'radar', open: () => tabs.openPageTab('explore') },
  { title: '线索库', icon: 'users', open: () => tabs.openPageTab('leads') },
  { title: '邮件审核', icon: 'file-text', open: () => tabs.openPageTab('email') },
  { title: '邮箱', icon: 'mail', open: () => tabs.openPageTab('mailbox') },
  { title: '独立站', icon: 'globe', open: () => tabs.openPageTab('site') },
  { title: '浏览器', icon: 'app-window', open: () => tabs.openUserBrowserTab() },
] as const
</script>

<template>
  <section class="main-pane home-view" aria-label="首页">
    <WorkflowSchedulePanel :plans="plans" />
    <p v-if="loadError" role="alert">方案加载失败：{{ loadError }} <button type="button" @click="reloadPlans()">重试</button></p>
    <section aria-labelledby="home-shortcuts">
      <h2 id="home-shortcuts">快捷入口</h2>
      <div class="home-grid">
        <button v-for="item in shortcuts" :key="item.title" type="button" class="home-card" @click="item.open()">
          <Icon :name="item.icon" :size="18" />{{ item.title }}
        </button>
      </div>
    </section>
    <section class="home-suggestions" aria-labelledby="home-suggestions">
      <Icon name="sparkles" :size="18" />
      <div><h2 id="home-suggestions">工作建议</h2><p>工作建议将在后续版本开放。</p></div>
    </section>
  </section>
</template>
