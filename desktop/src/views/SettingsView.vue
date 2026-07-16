<script setup lang="ts">
import { computed } from 'vue'
import { SECTION_META } from '../types/workspace'
import Icon from '../components/shared/Icon.vue'
import { useAppStatus } from '../composables/useAppStatus'

const meta = SECTION_META.settings
const { status, runtimeHealthy, runtimeLabel, loading, restartOpenCode, refresh } = useAppStatus()

const workspaceRoot = computed(() => status.value?.workspaceRoot ?? '—')
const baseUrl = computed(() => status.value?.opencode?.baseUrl ?? '—')
const version = computed(() => status.value?.opencode?.version ?? '—')
</script>

<template>
  <section class="main-pane">
    <header class="main-pane__head">
      <div>
        <h1>{{ meta.title }}</h1>
        <p>{{ meta.subtitle }}</p>
      </div>
      <div class="main-pane__actions">
        <button type="button" class="btn-secondary" :disabled="loading" @click="refresh">刷新</button>
        <button type="button" class="btn-primary" :disabled="loading" @click="restartOpenCode">
          <Icon name="save" :size="12" />
          {{ loading ? '重启中…' : '重启 OpenCode' }}
        </button>
      </div>
    </header>

    <div class="settings-form">
      <section class="settings-block">
        <h3>搜索 API</h3>
        <p class="muted">TAVILY_API_KEY · 后续可在此编辑并写入 workspace/.env</p>
        <div class="input-skeleton">tvly-••••••••••••••••••••</div>
      </section>

      <section class="settings-block">
        <h3>模型提供商</h3>
        <p class="muted">OPENAI_API_KEY / 兼容端点（由 OpenCode 读取）</p>
        <div class="input-skeleton">sk-••••••••••••••••••••</div>
      </section>

      <section class="settings-block">
        <h3>工作区</h3>
        <div class="input-skeleton input-skeleton--row">
          <code>{{ workspaceRoot }}</code>
        </div>
      </section>

      <section class="settings-block">
        <h3>OpenCode</h3>
        <div class="oc-banner" :class="{ 'is-ready': runtimeHealthy }">
          <i class="oc-status__dot" />
          <span>
            {{ runtimeLabel }}
            · {{ baseUrl }}
            · v{{ version }}
          </span>
        </div>
        <ul v-if="status?.mcpServers?.length" class="mcp-list">
          <li v-for="item in status.mcpServers" :key="item.name">
            <span>{{ item.name }}</span>
            <span>{{ item.status }}</span>
          </li>
        </ul>
      </section>

      <p class="settings-foot">
        <Icon name="info" :size="14" />
        密钥仅写入本地 workspace/.env，不会上传
      </p>
    </div>
  </section>
</template>
