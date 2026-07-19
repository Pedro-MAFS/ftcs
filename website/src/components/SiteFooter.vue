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
  </footer>
</template>
