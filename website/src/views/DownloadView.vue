<script setup lang="ts">
import { siteConfig, type DownloadMirror } from '../config/site'

function isReady(url: string): boolean {
  return Boolean(url && url.trim())
}

function hasAnyMirror(mirrors: DownloadMirror[]): boolean {
  return mirrors.some((m) => isReady(m.url))
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

      <p v-if="siteConfig.downloadTip" class="download-tip">
        {{ siteConfig.downloadTip }}
      </p>

      <div class="download-list">
        <article
          v-for="item in siteConfig.downloads"
          :key="item.id"
          class="download-card"
        >
          <div class="download-card__info">
            <h2>{{ item.label }}</h2>
            <p>
              {{ item.filename }}
              <template v-if="item.note"> · {{ item.note }}</template>
            </p>
            <p v-if="!hasAnyMirror(item.mirrors)" class="download-hint">
              链接待配置 — 请在
              <code>website/src/config/site.ts</code> 填写镜像
              <code>url</code> 后重新构建发布。
            </p>
          </div>
          <div class="download-card__actions">
            <template v-for="mirror in item.mirrors" :key="mirror.id">
              <a
                v-if="isReady(mirror.url)"
                class="btn"
                :class="mirror.primary ? 'btn-primary' : 'btn-secondary'"
                :href="mirror.url"
                :download="item.filename"
                rel="noopener noreferrer"
              >
                <span>{{ mirror.label }}</span>
                <span v-if="mirror.badge" class="download-badge">{{
                  mirror.badge
                }}</span>
              </a>
              <button
                v-else
                type="button"
                class="btn"
                :class="mirror.primary ? 'btn-primary' : 'btn-secondary'"
                disabled
              >
                <span>{{ mirror.label }}</span>
                <span v-if="mirror.badge" class="download-badge">{{
                  mirror.badge
                }}</span>
              </button>
            </template>
          </div>
        </article>
      </div>

      <p class="muted" style="padding-bottom: 3rem">
        安装说明见
        <RouterLink to="/docs/install">安装与前置</RouterLink>。
      </p>
    </div>
  </div>
</template>
