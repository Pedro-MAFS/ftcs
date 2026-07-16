<script setup lang="ts">
import { SECTION_META } from '../types/workspace'
import Icon from '../components/shared/Icon.vue'
import PlaceholderPanel from '../components/shared/PlaceholderPanel.vue'

const meta = SECTION_META.explore
</script>

<template>
  <section class="main-pane">
    <header class="main-pane__head">
      <div>
        <h1>{{ meta.title }}</h1>
        <p>{{ meta.subtitle }}</p>
      </div>
      <div class="main-pane__actions">
        <button type="button" class="btn-secondary" disabled>停止</button>
        <button type="button" class="btn-primary" disabled>
          <Icon name="play" :size="12" />
          一键 R1
        </button>
      </div>
    </header>

    <PlaceholderPanel
      title="探索进度占位"
      description="后续展示搜索词进度、候选 URL 列表，并驱动 discover-leads。"
      hint="右侧 Agent 面板将同步实时日志"
    />
  </section>
</template>
