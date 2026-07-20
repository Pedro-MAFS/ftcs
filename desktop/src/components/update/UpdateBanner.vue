<script setup lang="ts">
import { useUpdateCheck } from '../../composables/useUpdateCheck'

const {
  bannerVisible,
  result,
  openDownloadPage,
  snooze,
  dismiss,
} = useUpdateCheck()
</script>

<template>
  <div
    v-if="bannerVisible && result.hasUpdate"
    class="update-banner"
    :class="{ 'is-mandatory': result.mandatory }"
    role="status"
  >
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
      <button
        v-if="!result.mandatory"
        type="button"
        class="btn-secondary btn-sm"
        @click="snooze"
      >
        稍后提醒
      </button>
      <button
        v-if="!result.mandatory"
        type="button"
        class="btn-secondary btn-sm"
        @click="dismiss"
      >
        忽略此版本
      </button>
    </div>
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

.update-banner__title {
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
</style>
