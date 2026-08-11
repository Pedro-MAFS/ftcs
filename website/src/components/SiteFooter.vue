<script setup lang="ts">
import { siteConfig } from '../config/site'
</script>

<template>
  <footer class="site-footer">
    <div class="container site-footer__inner">
      <p>
        © {{ new Date().getFullYear() }} {{ siteConfig.brand }} ·
        {{ siteConfig.productName }}
      </p>
      <p>
        <RouterLink to="/docs">帮助文档</RouterLink>
        ·
        <RouterLink to="/download">下载</RouterLink>
      </p>
    </div>
    <div v-if="siteConfig.phone || siteConfig.email" class="container site-footer__contact">
      <a v-if="siteConfig.phone" :href="`tel:${siteConfig.phone}`">电话 {{ siteConfig.phone }}</a>
      <a v-if="siteConfig.email" :href="`mailto:${siteConfig.email}`">邮箱 {{ siteConfig.email }}</a>
    </div>
    <div class="container site-footer__beian">
      <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">
        鲁ICP备2026033555号-1
      </a>
      <a
        href="https://beian.mps.gov.cn/#/query/webSearch?code=33010802014603"
        target="_blank"
        rel="noreferrer"
      >
        <img src="/mps-beian.png" alt="公安备案" width="16" height="16" />
        浙公网安备33010802014603号
      </a>
    </div>
  </footer>
</template>
