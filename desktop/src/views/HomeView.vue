<script setup lang="ts">
import { useMainViewTabs } from '../composables/useMainViewTabs'

defineOptions({ name: 'HomeView' })

const tabs = useMainViewTabs()

const cards: Array<{
  title: string
  detail: string
  open: () => void
}> = [
  { title: '录入', detail: '公司与产品资料', open: () => void tabs.openPageTab('input') },
  { title: '画像', detail: '确认后再去探索', open: () => void tabs.openPageTab('profile') },
  { title: '探索', detail: '扩展关键词并找客户', open: () => void tabs.openPageTab('explore') },
  { title: '线索', detail: '原始与已评分线索', open: () => void tabs.openPageTab('leads') },
  { title: '邮件', detail: '审阅开发信草稿', open: () => void tabs.openPageTab('email') },
  { title: '浏览器', detail: '打开客户网站', open: () => void tabs.openUserBrowserTab() },
]
</script>

<template>
  <section class="main-pane home-view" aria-label="首页">
    <div class="home-grid">
      <button
        v-for="card in cards"
        :key="card.title"
        type="button"
        class="home-card"
        @click="card.open()"
      >
        <span class="home-card__title">{{ card.title }}</span>
        <span class="home-card__detail">{{ card.detail }}</span>
      </button>
    </div>
  </section>
</template>
