<script setup lang="ts">
import { siteConfig } from '../config/site'

const brandHost = siteConfig.brandSiteUrl.replace(/^https:\/\//, '')
const productHost = siteConfig.siteUrl.replace(/^https:\/\//, '')
</script>

<template>
  <footer class="site-footer">
    <div class="container site-footer__inner">
      <p>
        {{ siteConfig.brand }}
        ·
        <a :href="siteConfig.brandSiteUrl" target="_blank" rel="noopener noreferrer">
          品牌站 {{ brandHost }}
        </a>
        ·
        <a :href="siteConfig.siteUrl">产品站 {{ productHost }}</a>
      </p>
      <p>
        <RouterLink to="/docs">帮助</RouterLink>
        ·
        <RouterLink to="/changelog">发布日志</RouterLink>
        ·
        <RouterLink to="/download">下载</RouterLink>
      </p>
      <p>
        <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">
          鲁ICP备2026033555号-1
        </a>
      </p>
    </div>
    <div v-if="siteConfig.phone || siteConfig.email" class="container site-footer__contact">
      <a v-if="siteConfig.phone" :href="`tel:${siteConfig.phone}`">电话 {{ siteConfig.phone }}</a>
      <a v-if="siteConfig.email" :href="`mailto:${siteConfig.email}`">邮箱 {{ siteConfig.email }}</a>
      <a
        href="https://beian.mps.gov.cn/#/query/webSearch?code=33010802014603"
        target="_blank"
        rel="noreferrer"
      >
        <img src="/mps-beian.png" alt="" width="16" height="16" />
        浙公网安备33010802014603号
      </a>
    </div>
  </footer>
</template>
