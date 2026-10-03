<script setup lang="ts">
import { useUpdateCheck } from '../../composables/useUpdateCheck'

const {
  bannerMode,
  result,
  downloadState,
  downloadingText,
  installError,
  openDownloadPage,
  openChangelogPage,
  retryCheck,
  retryDownload,
  installUpdate,
  deferUpdate,
} = useUpdateCheck()
</script>

<template>
  <div
    v-if="bannerMode !== 'hidden'"
    class="update-banner"
    :class="{
      'is-mandatory': bannerMode === 'external' && result.mandatory,
      'is-collapsed': bannerMode === 'ready-deferred',
    }"
    role="status"
  >
    <template v-if="bannerMode === 'check-error'">
      <div class="update-banner__main">
        <strong class="update-banner__title">{{ result.message }}</strong>
      </div>
      <div class="update-banner__actions">
        <button type="button" class="btn-primary btn-sm" @click="retryCheck">重试</button>
        <button type="button" class="btn-secondary btn-sm" @click="openDownloadPage">
          去官网下载
        </button>
      </div>
    </template>

    <template v-else-if="bannerMode === 'external'">
      <div class="update-banner__main">
        <strong class="update-banner__title">
          {{ result.mandatory ? '需要更新' : '发现新版本' }}
          {{ result.latestVersion }}
        </strong>
        <span class="update-banner__meta">
          当前 {{ result.currentVersion }}
          <template v-if="result.title"> · {{ result.title }}</template>
        </span>
        <ul v-if="result.notes.length" class="update-banner__notes">
          <li v-for="(note, i) in result.notes.slice(0, 3)" :key="i">{{ note }}</li>
        </ul>
      </div>
      <div class="update-banner__actions">
        <button type="button" class="btn-primary btn-sm" @click="openDownloadPage">
          前往下载页
        </button>
        <button type="button" class="btn-secondary btn-sm" @click="openChangelogPage">
          查看发布日志
        </button>
      </div>
    </template>

    <template v-else-if="bannerMode === 'downloading'">
      <div class="update-banner__main">
        <strong class="update-banner__title">{{ downloadingText.title }}</strong>
        <span v-if="downloadingText.percent !== null" class="update-banner__meta">
          {{ downloadingText.percent }}%
        </span>
        <div
          v-if="downloadingText.percent !== null"
          class="update-banner__bar"
          role="progressbar"
          :aria-valuenow="downloadingText.percent"
          aria-valuemin="0"
          aria-valuemax="100"
        >
          <div
            class="update-banner__bar-fill"
            :style="{ width: `${downloadingText.percent}%` }"
          />
        </div>
      </div>
    </template>

    <template v-else-if="bannerMode === 'ready-deferred'">
      <strong class="update-banner__line">
        已下载 {{ downloadState.version }}，可立即安装
      </strong>
      <div class="update-banner__actions">
        <button type="button" class="btn-primary btn-sm" @click="installUpdate">
          立即安装/重启
        </button>
      </div>
      <p v-if="installError" class="update-banner__error">{{ installError }}</p>
    </template>

    <template v-else-if="bannerMode === 'ready'">
      <div class="update-banner__main">
        <strong class="update-banner__title">已下载 {{ downloadState.version }}</strong>
        <p v-if="installError" class="update-banner__error">{{ installError }}</p>
      </div>
      <div class="update-banner__actions">
        <button type="button" class="btn-primary btn-sm" @click="installUpdate">
          立即安装/重启
        </button>
        <button type="button" class="btn-secondary btn-sm" @click="deferUpdate">稍后</button>
        <button type="button" class="btn-secondary btn-sm" @click="openChangelogPage">
          查看发布日志
        </button>
      </div>
    </template>

    <template v-else-if="bannerMode === 'download-failed'">
      <div class="update-banner__main">
        <strong class="update-banner__title">{{ downloadState.message }}</strong>
      </div>
      <div class="update-banner__actions">
        <button type="button" class="btn-primary btn-sm" @click="retryDownload">重试</button>
        <button type="button" class="btn-secondary btn-sm" @click="openDownloadPage">
          去官网下载
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.update-banner {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px 16px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  background: var(--accent-muted);
}

.update-banner.is-collapsed {
  align-items: center;
  padding-top: 6px;
  padding-bottom: 6px;
}

.update-banner.is-mandatory {
  background: rgb(251 191 36 / 14%);
  border-bottom-color: color-mix(in srgb, var(--warning, #fbbf24) 40%, var(--border));
}

.update-banner__main {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: min(100%, 280px);
  flex: 1;
}

.update-banner__title,
.update-banner__line {
  font-size: 13px;
  color: var(--text);
}

.update-banner__meta {
  font-size: 12px;
  color: var(--text-muted);
}

.update-banner__notes {
  margin: 4px 0 0;
  padding-left: 1.1rem;
  font-size: 12px;
  color: var(--text-secondary);
}

.update-banner__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.update-banner__error {
  margin: 0;
  font-size: 12px;
  color: var(--danger, #f87171);
}

.update-banner__bar {
  height: 4px;
  max-width: 280px;
  margin-top: 4px;
  overflow: hidden;
  border-radius: 999px;
  background: color-mix(in srgb, var(--text) 12%, transparent);
}

.update-banner__bar-fill {
  height: 100%;
  background: var(--accent);
}
</style>
