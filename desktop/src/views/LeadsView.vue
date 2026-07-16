<script setup lang="ts">
import { ref } from 'vue'
import { SECTION_META } from '../types/workspace'
import Icon from '../components/shared/Icon.vue'

const meta = SECTION_META.leads
const activeFilter = ref('all')

const filters = [
  { id: 'all', label: '全部' },
  { id: 'a', label: 'A 级' },
  { id: 'b', label: 'B 级' },
  { id: 'c', label: 'C 级' },
  { id: 'mail', label: '待写邮件' },
]

const columns = ['公司', '域名', '国家', 'Tier', '评分', '匹配理由', '操作']
</script>

<template>
  <section class="main-pane">
    <header class="main-pane__head">
      <div>
        <h1>{{ meta.title }}</h1>
        <p>{{ meta.subtitle }}</p>
      </div>
      <div class="main-pane__actions">
        <button type="button" class="btn-secondary" disabled>评分去重</button>
        <button type="button" class="btn-primary" disabled>
          <Icon name="play" :size="12" />
          一键 R1
        </button>
      </div>
    </header>

    <div class="filter-row">
      <button
        v-for="f in filters"
        :key="f.id"
        type="button"
        class="filter-chip"
        :class="{ 'is-active': activeFilter === f.id }"
        @click="activeFilter = f.id"
      >
        {{ f.label }}
      </button>
      <div class="filter-spacer" />
      <div class="search-box">
        <Icon name="search" :size="12" />
        <span>搜索域名 / 公司</span>
      </div>
    </div>

    <div class="table-shell">
      <div class="table-header">
        <span v-for="col in columns" :key="col" class="table-cell">{{ col }}</span>
      </div>
      <div class="table-empty">
        <p>线索列表占位</p>
        <p class="muted">接入 scored.json / lead-store 后在此渲染表格行</p>
      </div>
    </div>
  </section>
</template>
