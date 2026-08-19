<script setup lang="ts">
import { listDocs } from '../lib/docs'
import { usePageSeo } from '../composables/usePageSeo'

usePageSeo({
  title: '帮助文档',
  description: '外贸获客安装、推荐流程与常见问题：官方通道、探索、充值与下载说明。',
})
</script>

<template>
  <div>
    <header class="page-head">
      <div class="container">
        <h1>帮助文档</h1>
        <p>面向业务用户的安装、流程与常见问题说明。</p>
      </div>
    </header>
    <div class="container docs-list">
      <RouterLink
        v-for="doc in listDocs()"
        :key="doc.slug"
        :to="`/docs/${doc.slug}`"
      >
        <h2>{{ doc.title }}</h2>
        <p>{{ doc.description }}</p>
      </RouterLink>
      <RouterLink to="/changelog">
        <h2>发布日志</h2>
        <p>从 0.5.0 起记录各版本更新，可对照当前版本与目标版本的差异。</p>
      </RouterLink>
    </div>
  </div>
</template>
