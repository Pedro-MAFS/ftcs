<script setup lang="ts">
import { computed } from 'vue'
import { siteConfig, seoCopy, type DownloadMirror } from '../config/site'
import { usePageSeo } from '../composables/usePageSeo'

const visibleDownloads = computed(() =>
  siteConfig.downloads.filter((item) => !item.hidden),
)

usePageSeo({
  title: seoCopy.download.title,
  description: seoCopy.download.description,
  absoluteTitle: true,
  path: seoCopy.download.path,
})

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
        <h1>下载外贸获客桌面智能体</h1>
        <p>
          FTCS 是跑在本机的外贸获客系统。下载 Windows 安装包，即可用 AI
          完成产品画像、线索探索与开发信草稿。
        </p>
        <p>
          <RouterLink to="/">了解外贸获客智能体</RouterLink>
        </p>
      </div>
    </header>

    <div class="container">
      <div class="download-meta">
        <span>当前版本 {{ siteConfig.version }}</span>
        <span>平台：Windows x64</span>
        <RouterLink to="/changelog">发布日志</RouterLink>
      </div>

      <p v-if="siteConfig.downloadTip" class="download-tip">
        {{ siteConfig.downloadTip }}
      </p>

      <div class="download-list">
        <article
          v-for="item in visibleDownloads"
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
              下载链接稍后公布。需要安装包请联系
              <a v-if="siteConfig.email" :href="`mailto:${siteConfig.email}`">{{
                siteConfig.email
              }}</a>
              <template v-else>官方客服</template>
              。
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

      <p class="muted download-prereq">
        使用前请在本机准备 <strong>Node.js 22+</strong>、<strong>Google Chrome</strong>
        与 <strong>OpenCode CLI</strong>；推荐登录开通官方通道（无需自备模型 / 搜索
        Key）。详见
        <RouterLink to="/docs/install">外贸获客系统安装与前置</RouterLink>
        。版本差异见
        <RouterLink to="/changelog">发布日志</RouterLink>。
      </p>
    </div>
  </div>
</template>
