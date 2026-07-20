<script setup lang="ts">
import { computed, nextTick, watch } from 'vue'
import { useRoute } from 'vue-router'
import { marked } from 'marked'
import { getDoc, listDocs } from '../lib/docs'
import { rewriteHtmlHrefs } from '../lib/base'

const props = defineProps<{ slug: string }>()
const route = useRoute()

marked.setOptions({ gfm: true })

const doc = computed(() => getDoc(props.slug))
const html = computed(() => {
  if (!doc.value) return ''
  const raw = marked.parse(doc.value.body, { async: false }) as string
  return rewriteHtmlHrefs(raw)
})

watch(
  () => [html.value, route.hash] as const,
  async ([content, hash]) => {
    if (!content || !hash) return
    await nextTick()
    const el = document.querySelector(hash)
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  },
  { immediate: true },
)
</script>

<template>
  <div class="container doc-layout">
    <aside class="doc-side">
      <p class="muted">文档目录</p>
      <RouterLink
        v-for="item in listDocs()"
        :key="item.slug"
        :to="`/docs/${item.slug}`"
      >
        {{ item.title }}
      </RouterLink>
      <p style="margin-top: 1.25rem">
        <RouterLink to="/docs">← 全部文档</RouterLink>
      </p>
    </aside>

    <article v-if="doc" class="doc-article" v-html="html" />
    <article v-else class="doc-article">
      <h1>未找到文档</h1>
      <p>该篇目不存在，请返回 <RouterLink to="/docs">文档目录</RouterLink>。</p>
    </article>
  </div>
</template>
