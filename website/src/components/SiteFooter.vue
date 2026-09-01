<script setup lang="ts">
import { siteConfig } from '../config/site'

const brandHost = siteConfig.brandSiteUrl.replace(/^https:\/\//, '')
const year = new Date().getFullYear()
</script>

<template>
  <footer class="site-footer">
    <div class="container site-footer__inner">
      <nav class="site-footer__row" aria-label="页脚导航">
        <RouterLink to="/docs">帮助</RouterLink>
        <span class="site-footer__sep" aria-hidden="true">·</span>
        <RouterLink to="/plan">支持计划</RouterLink>
        <span class="site-footer__sep" aria-hidden="true">·</span>
        <RouterLink to="/changelog">发布日志</RouterLink>
        <span class="site-footer__sep" aria-hidden="true">·</span>
        <RouterLink to="/download">下载</RouterLink>
        <span class="site-footer__sep" aria-hidden="true">·</span>
        <a :href="siteConfig.brandSiteUrl" target="_blank" rel="noopener noreferrer">
          品牌站 {{ brandHost }}
        </a>
      </nav>
      <p v-if="siteConfig.phone || siteConfig.email" class="site-footer__row">
        <a v-if="siteConfig.phone" :href="`tel:${siteConfig.phone}`">电话 {{ siteConfig.phone }}</a>
        <span
          v-if="siteConfig.phone && siteConfig.email"
          class="site-footer__sep"
          aria-hidden="true"
        >·</span>
        <a v-if="siteConfig.email" :href="`mailto:${siteConfig.email}`">邮箱 {{ siteConfig.email }}</a>
      </p>
      <p class="site-footer__row site-footer__legal">
        <span>© {{ year }} {{ siteConfig.brand }}</span>
        <span class="site-footer__sep" aria-hidden="true">·</span>
        <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">
          鲁ICP备2026033555号-1
        </a>
        <span class="site-footer__sep" aria-hidden="true">·</span>
        <a
          href="https://beian.mps.gov.cn/#/query/webSearch?code=33010802014603"
          target="_blank"
          rel="noreferrer"
        >
          <img src="/mps-beian.png" alt="" width="12" height="12" />
          浙公网安备33010802014603号
        </a>
        <template v-if="siteConfig.clarityProjectId">
          <span class="site-footer__sep" aria-hidden="true">·</span>
          <span>本站使用 Microsoft Clarity 进行匿名访问统计</span>
        </template>
      </p>
    </div>
  </footer>
</template>
