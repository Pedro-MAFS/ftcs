<script setup lang="ts">
import { listDocs } from '../lib/docs'
import { seoCopy } from '../config/site'
import { usePageSeo } from '../composables/usePageSeo'

usePageSeo({
  title: seoCopy.docs.title,
  description: seoCopy.docs.description,
  absoluteTitle: true,
  path: seoCopy.docs.path,
})
</script>

<template>
  <div>
    <header class="page-head">
      <div class="container">
        <h1>外贸获客智能体 · 帮助</h1>
        <p>如何安装并使用 FTCS 这套外贸获客系统：安装前置、一次获客闭环与常见问题。</p>
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
