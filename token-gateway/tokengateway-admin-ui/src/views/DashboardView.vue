<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { fetchAdminHealth } from '@/api/health'
import type { AdminHealth } from '@/api/health'
import { AdminApiError } from '@/api/client'

const health = ref<AdminHealth | null>(null)
const error = ref<string | null>(null)
const loading = ref(true)

async function refresh() {
  loading.value = true
  error.value = null
  try {
    health.value = await fetchAdminHealth()
  } catch (e) {
    health.value = null
    error.value =
      e instanceof AdminApiError
        ? `后端不可达（${e.status}）：${e.message}`
        : e instanceof Error
          ? e.message
          : '未知错误'
  } finally {
    loading.value = false
  }
}

onMounted(refresh)
</script>

<template>
  <div class="page">
    <div class="card">
      <div class="row">
        <h2>后端连通性</h2>
        <button type="button" class="btn" :disabled="loading" @click="refresh">刷新</button>
      </div>
      <p v-if="loading" class="muted">检测中…</p>
      <p v-else-if="error" class="err">{{ error }}</p>
      <p v-else-if="health" class="ok">
        {{ health.service || 'token-gateway-admin' }} · status={{ health.status }}
      </p>
      <p class="hint">
        开发时请先启动 admin（:8089）。本页通过 Vite proxy 请求
        <code>/admin/v1/health</code>。
      </p>
    </div>

    <div class="card muted-card">
      <h2>看板指标（占位）</h2>
      <p class="muted">用户增长 / 充值 / 消费 / 活跃统计将在 US-G6-02、US-G6-03、US-G6-08 实现。</p>
    </div>
  </div>
</template>

<style scoped>
.page {
  display: grid;
  gap: 1rem;
}

.card {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 1rem 1.1rem;
}

.muted-card h2 {
  margin-top: 0;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.row h2 {
  margin: 0;
  font-size: 1rem;
}

.btn {
  border: 1px solid var(--line);
  background: #fff;
  border-radius: 6px;
  padding: 0.35rem 0.75rem;
  cursor: pointer;
}

.btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.muted {
  color: var(--muted);
}

.ok {
  color: var(--ok);
  font-weight: 600;
}

.err {
  color: var(--danger);
  font-weight: 600;
}

.hint {
  margin-bottom: 0;
  color: var(--muted);
  font-size: 0.9rem;
}

code {
  font-size: 0.85em;
}
</style>
