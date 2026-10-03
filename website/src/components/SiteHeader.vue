<script setup lang="ts">
import { siteConfig } from '../config/site'
</script>

<template>
  <header class="site-header">
    <div class="container site-header__inner">
      <div class="brand">
        <RouterLink class="brand__product" to="/" aria-label="FTCS 首页">
          <span class="brand__mark" aria-hidden="true">F</span>
          <span class="brand__name">{{ siteConfig.brand }}</span>
        </RouterLink>
        <span class="brand__sep" aria-hidden="true">/</span>
        <a
          class="brand__parent"
          :href="siteConfig.brandSiteUrl"
          target="_blank"
          rel="noopener noreferrer"
        >
          {{ siteConfig.brandSiteName }}
        </a>
      </div>
      <nav class="nav" aria-label="主导航">
        <RouterLink :to="{ path: '/', hash: '#pipeline' }">功能</RouterLink>
        <RouterLink :to="{ path: '/', hash: '#fit' }">场景</RouterLink>
        <RouterLink class="nav--page" to="/docs">帮助</RouterLink>
        <a
          class="nav--page"
          :href="siteConfig.issuesUrl"
          target="_blank"
          rel="noopener noreferrer"
        >
          进度
        </a>
        <a
          :href="siteConfig.brandSiteUrl"
          target="_blank"
          rel="noopener noreferrer"
        >
          品牌站
        </a>
        <RouterLink class="nav__cta" to="/download">下载桌面版</RouterLink>
      </nav>
    </div>
  </header>
</template>
