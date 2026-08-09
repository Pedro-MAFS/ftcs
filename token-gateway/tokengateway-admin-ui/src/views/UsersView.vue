<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { AdminApiError } from '@/api/client'
import { fetchUsers, type AdminUserListItem } from '@/api/users'

const router = useRouter()
const items = ref<AdminUserListItem[]>([])
const total = ref(0)
const page = ref(1)
const size = ref(20)
const q = ref('')
const status = ref('')
const loading = ref(false)
const error = ref<string | null>(null)

function formatTime(iso?: string) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('zh-CN', { hour12: false })
  } catch {
    return iso
  }
}

function statusLabel(s: string) {
  if (s === 'active') return '正常'
  if (s === 'disabled') return '冻结'
  return s
}

async function refresh() {
  loading.value = true
  error.value = null
  try {
    const resp = await fetchUsers({
      q: q.value.trim() || undefined,
      status: status.value || undefined,
      page: page.value,
      size: size.value,
    })
    items.value = resp.items ?? []
    total.value = resp.total ?? 0
    page.value = resp.page ?? page.value
    size.value = resp.size ?? size.value
  } catch (e) {
    items.value = []
    total.value = 0
    error.value =
      e instanceof AdminApiError
        ? `${e.code ? `[${e.code}] ` : ''}${e.message}`
        : e instanceof Error
          ? e.message
          : '加载失败'
  } finally {
    loading.value = false
  }
}

function onSearch() {
  page.value = 1
  refresh()
}

function prevPage() {
  if (page.value <= 1) return
  page.value -= 1
  refresh()
}

function nextPage() {
  const maxPage = Math.max(1, Math.ceil(total.value / size.value))
  if (page.value >= maxPage) return
  page.value += 1
  refresh()
}

function openDetail(id: number) {
  router.push(`/ops/users/${id}`)
}

onMounted(refresh)
</script>

<template>
  <div class="page">
    <p class="lead">查询计费账户余额与状态；启停在详情页操作。无物理删除。</p>

    <section class="card">
      <div class="toolbar">
        <input
          v-model="q"
          type="search"
          placeholder="搜索 user_code / tenant_id / id…"
          @keyup.enter="onSearch"
        />
        <select v-model="status" @change="onSearch">
          <option value="">状态：全部</option>
          <option value="active">正常</option>
          <option value="disabled">冻结</option>
        </select>
        <button type="button" class="btn" :disabled="loading" @click="onSearch">搜索</button>
        <button type="button" class="btn" :disabled="loading" @click="refresh">刷新</button>
      </div>

      <p v-if="loading" class="muted">加载中…</p>
      <p v-else-if="error" class="err">{{ error }}</p>
      <div v-else class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>用户</th>
              <th>租户</th>
              <th>余额 (元)</th>
              <th>状态</th>
              <th>更新时间</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="items.length === 0">
              <td colspan="6" class="muted">暂无用户</td>
            </tr>
            <tr v-for="row in items" :key="row.id" class="clickable" @click="openDetail(row.id)">
              <td class="mono">{{ row.user_code }}</td>
              <td class="mono">{{ row.tenant_id }}</td>
              <td class="mono">{{ row.balance_yuan }}</td>
              <td>
                <span class="badge" :data-status="row.status">{{ statusLabel(row.status) }}</span>
              </td>
              <td class="mono">{{ formatTime(row.updated_at) }}</td>
              <td class="link">查看详情 →</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="pager">
        <span class="muted">共 {{ total }} 条 · 第 {{ page }} / {{ Math.max(1, Math.ceil(total / size) || 1) }} 页</span>
        <div class="pager-btns">
          <button type="button" class="btn" :disabled="loading || page <= 1" @click="prevPage">上一页</button>
          <button
            type="button"
            class="btn"
            :disabled="loading || page >= Math.max(1, Math.ceil(total / size))"
            @click="nextPage"
          >
            下一页
          </button>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.page {
  display: grid;
  gap: 0.75rem;
}

.lead {
  margin: 0;
  color: var(--muted);
  font-size: 0.92rem;
}

.card {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 1rem 1.1rem;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  margin-bottom: 0.9rem;
}

.toolbar input,
.toolbar select {
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 0.4rem 0.55rem;
  background: #fff;
  font: inherit;
  min-width: 12rem;
}

.table-wrap {
  overflow: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.88rem;
}

th,
td {
  text-align: left;
  padding: 0.55rem 0.45rem;
  border-bottom: 1px solid var(--line);
}

th {
  color: var(--muted);
  font-weight: 600;
  font-size: 0.78rem;
}

.clickable {
  cursor: pointer;
}

.clickable:hover {
  background: #f7faf8;
}

.mono {
  font-family: ui-monospace, Consolas, monospace;
  font-size: 0.82rem;
}

.badge {
  display: inline-block;
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
  background: #eef2f6;
  color: var(--muted);
}

.badge[data-status='active'] {
  background: #e3f6ee;
  color: var(--ok);
}

.badge[data-status='disabled'] {
  background: #fef3f2;
  color: var(--danger);
}

.link {
  color: var(--accent);
  font-weight: 600;
  white-space: nowrap;
}

.pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
  margin-top: 0.85rem;
}

.pager-btns {
  display: flex;
  gap: 0.4rem;
}

.btn {
  border: 1px solid var(--line);
  background: #fff;
  border-radius: 6px;
  padding: 0.35rem 0.75rem;
  cursor: pointer;
}

.btn:disabled {
  opacity: 0.55;
  cursor: default;
}

.muted {
  color: var(--muted);
}

.err {
  color: var(--danger);
  font-weight: 600;
}
</style>
