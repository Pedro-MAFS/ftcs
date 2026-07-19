<script setup lang="ts">
import { siteConfig } from '../config/site'

function isReady(url: string): boolean {
  return Boolean(url && url.trim())
}
</script>

<template>
  <div>
    <header class="page-head">
      <div class="container">
        <h1>下载</h1>
        <p>
          {{ siteConfig.productName }} 桌面版（Windows）。使用前请先在本机准备
          <strong>Node.js 22+</strong>、<strong>Google Chrome</strong>、
          <strong>OpenCode CLI</strong> 与 API Key，详见帮助文档。
        </p>
      </div>
    </header>

    <div class="container">
      <div class="download-meta">
        <span>当前版本 {{ siteConfig.version }}</span>
        <span>平台：Windows x64</span>
        <span>前置：Node 22+ · Chrome · OpenCode</span>
      </div>

      <div class="download-list">
        <article
          v-for="item in siteConfig.downloads"
          :key="item.id"
          class="download-card"
        >
          <div>
            <h2>{{ item.label }}</h2>
            <p>
              {{ item.filename }}
              <template v-if="item.note"> · {{ item.note }}</template>
            </p>
            <p v-if="!isReady(item.url)" class="download-hint">
              链接待配置 — 请在
              <code>website/src/config/site.ts</code> 填写
              <code>url</code> 后重新构建发布。
            </p>
          </div>
          <a
            v-if="isReady(item.url)"
            class="btn btn-primary"
            :href="item.url"
            :download="item.filename"
            rel="noopener noreferrer"
          >
            下载
          </a>
          <button v-else type="button" class="btn btn-primary" disabled>
            链接待配置
          </button>
        </article>
      </div>

      <p class="muted" style="padding-bottom: 3rem">
        安装说明见
        <RouterLink to="/docs/install">安装与前置</RouterLink>。
      </p>
    </div>
  </div>
</template>
