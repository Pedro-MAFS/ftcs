<script setup lang="ts">
import { siteConfig } from '../config/site'
import { withBase } from '../lib/base'

const iconSrc = withBase('icon.png')
</script>

<template>
  <header class="site-header">
    <div class="container site-header__inner">
      <RouterLink class="brand" to="/">
        <img class="brand__mark" :src="iconSrc" width="28" height="28" alt="" />
        <span class="brand__text">
          {{ siteConfig.brand }}
          <span class="brand__product">{{ siteConfig.productName }}</span>
        </span>
      </RouterLink>
      <nav class="nav" aria-label="主导航">
        <RouterLink to="/">功能</RouterLink>
        <RouterLink to="/docs">帮助</RouterLink>
        <RouterLink class="nav__cta" to="/download">下载</RouterLink>
      </nav>
    </div>
  </header>
</template>
