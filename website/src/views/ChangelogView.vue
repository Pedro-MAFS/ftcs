<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { seoCopy, siteConfig } from '../config/site'
import {
  CHANGELOG_STARTED_AT,
  compareVersions,
  latestChangelogVersion,
  recordedVersions,
  releasesBetween,
} from '../config/changelog'
import { usePageSeo } from '../composables/usePageSeo'

usePageSeo({
  title: seoCopy.changelog.title,
  description: seoCopy.changelog.description,
  path: seoCopy.changelog.path,
})

const BEFORE_START = ''
const route = useRoute()
const router = useRouter()

const versions = recordedVersions()
const latest = latestChangelogVersion()

function queryString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeFrom(raw: string): string {
  if (!raw) return BEFORE_START
  if (versions.includes(raw)) return raw
  if (compareVersions(raw, CHANGELOG_STARTED_AT) < 0) return BEFORE_START
  return raw
}

function normalizeTo(raw: string): string {
  if (!raw) return latest
  if (versions.includes(raw)) return raw
  return latest
}

const fromVersion = ref(normalizeFrom(queryString(route.query.from)))
const toVersion = ref(normalizeTo(queryString(route.query.to)))

watch(
  () => [route.query.from, route.query.to] as const,
  ([from, to]) => {
    fromVersion.value = normalizeFrom(queryString(from))
    toVersion.value = normalizeTo(queryString(to))
  },
)

watch([fromVersion, toVersion], ([from, to]) => {
  if (typeof window === 'undefined') return
  const next: Record<string, string> = {}
  if (from) next.from = from
  if (to && to !== latest) next.to = to
  const currentFrom = queryString(route.query.from)
  const currentTo = queryString(route.query.to)
  if (currentFrom === (next.from ?? '') && currentTo === (next.to ?? '')) return
  void router.replace({ query: next })
})

const shown = computed(() => releasesBetween(fromVersion.value, toVersion.value))

const rangeHint = computed(() => {
  const fromLabel = fromVersion.value || `${CHANGELOG_STARTED_AT} 之前`
  if (fromVersion.value && compareVersions(fromVersion.value, toVersion.value) === 0) {
    return `当前版本与目标版本相同（${toVersion.value}）。下面是该版本说明。`
  }
  if (fromVersion.value && compareVersions(fromVersion.value, toVersion.value) > 0) {
    return `所选「我的版本」新于目标版本，请调整后再看差异。`
  }
  if (!shown.value.length) {
    return `在 ${fromLabel} 到 ${toVersion.value} 之间没有已记录的更新。`
  }
  return `以下是 ${fromLabel} 之后、到 ${toVersion.value} 的更新（不含你已安装的版本）。`
})
</script>

<template>
  <div>
    <header class="page-head">
      <div class="container">
        <h1>发布日志</h1>
        <p>
          对照你安装的版本与目标版本之间的差异。说明自
          {{ CHANGELOG_STARTED_AT }} 起记录，更早版本不再补录。
        </p>
      </div>
    </header>

    <div class="container changelog">
      <div class="changelog__compare">
        <label class="changelog__field">
          <span>我的版本</span>
          <select v-model="fromVersion">
            <option :value="BEFORE_START">{{ CHANGELOG_STARTED_AT }} 之前</option>
            <option v-for="ver in versions" :key="`from-${ver}`" :value="ver">
              {{ ver }}
            </option>
          </select>
        </label>
        <span class="changelog__arrow" aria-hidden="true">→</span>
        <label class="changelog__field">
          <span>目标版本</span>
          <select v-model="toVersion">
            <option v-for="ver in versions" :key="`to-${ver}`" :value="ver">
              {{ ver }}{{ ver === latest ? '（最新）' : '' }}
            </option>
          </select>
        </label>
      </div>

      <p class="changelog__hint">{{ rangeHint }}</p>

      <article
        v-for="release in shown"
        :key="release.version"
        class="changelog__release"
      >
        <header class="changelog__release-head">
          <h2>{{ release.version }}</h2>
          <p>
            <span v-if="release.version === siteConfig.version">当前官网版本</span>
            <template v-if="release.version === siteConfig.version"> · </template>
            {{ release.releasedAt }}
            <template v-if="release.title"> · {{ release.title }}</template>
          </p>
        </header>
        <ul>
          <li v-for="(note, i) in release.notes" :key="i">{{ note }}</li>
        </ul>
      </article>

      <p class="muted changelog__foot">
        下载最新安装包见
        <RouterLink to="/download">下载页</RouterLink>
        。安装说明见
        <RouterLink to="/docs/install">安装与前置</RouterLink>。
      </p>
    </div>
  </div>
</template>
