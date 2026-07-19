<script setup lang="ts">
import { listDocs } from '../lib/docs'
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
    </div>
  </div>
</template>
