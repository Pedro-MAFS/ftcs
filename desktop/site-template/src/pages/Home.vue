<script setup lang="ts">
import { useHead } from '@unhead/vue'

useHead({
  title: '我的独立站',
  meta: [{ name: 'description', content: '这是一个等待完善的独立站。' }],
})
</script>

<template>
  <main>
    <h1>欢迎来到我的独立站</h1>
    <p>这是网站的起点。接下来可以根据你的需求完善内容和设计。</p>
  </main>
</template>

<style>
body { margin: 0; font-family: system-ui, sans-serif; color: #263545; background: #f7f9fc; }
main { max-width: 760px; margin: 15vh auto; padding: 0 24px; }
h1 { font-size: clamp(2rem, 5vw, 3rem); }
p { color: #526579; line-height: 1.7; }
</style>
