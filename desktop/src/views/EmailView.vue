<script setup lang="ts">
import { SECTION_META } from '../types/workspace'
import Icon from '../components/shared/Icon.vue'
import PlaceholderPanel from '../components/shared/PlaceholderPanel.vue'

const meta = SECTION_META.email
</script>

<template>
  <section class="main-pane">
    <header class="main-pane__head">
      <div>
        <h1>{{ meta.title }}</h1>
        <p>{{ meta.subtitle }}</p>
      </div>
      <div class="main-pane__actions">
        <button type="button" class="btn-secondary" disabled>驳回</button>
        <button type="button" class="btn-primary" disabled>
          <Icon name="check" :size="12" />
          通过并保存
        </button>
      </div>
    </header>

    <div class="email-layout">
      <aside class="draft-list">
        <div class="draft-list__head">草稿队列</div>
        <p class="muted draft-list__empty">暂无草稿 · 后续接入 email_draft_list</p>
      </aside>
      <PlaceholderPanel
        title="邮件编辑占位"
        description="后续展示 To / Subject / Body，并调用 draft-outreach-email。"
      />
    </div>
  </section>
</template>
