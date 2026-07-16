<script setup lang="ts">
import { SECTION_META } from '../types/workspace'
import Icon from '../components/shared/Icon.vue'
import PlaceholderPanel from '../components/shared/PlaceholderPanel.vue'

const meta = SECTION_META.profile
</script>

<template>
  <section class="main-pane">
    <header class="main-pane__head">
      <div>
        <h1>{{ meta.title }}</h1>
        <p>{{ meta.subtitle }}</p>
      </div>
      <div class="main-pane__actions">
        <button type="button" class="btn-secondary" disabled>重新提取</button>
        <button type="button" class="btn-primary" disabled>
          <Icon name="save" :size="12" />
          保存并扩展
        </button>
      </div>
    </header>

    <PlaceholderPanel
      title="画像编辑占位"
      description="后续展示可编辑字段、就绪度进度条，并保存至 lead-store。"
    >
      <div class="profile-skeleton">
        <div class="ready-banner">就绪度 — · 待接入 profile_compute_readiness</div>
        <div class="field-grid">
          <div v-for="label in ['产品名称', '品类', '应用场景', '目标买家', '目标市场', '认证', '差异化卖点', '竞品参考']" :key="label" class="field-skel">
            <span>{{ label }}</span>
            <div class="input-skeleton">—</div>
          </div>
        </div>
      </div>
    </PlaceholderPanel>
  </section>
</template>
