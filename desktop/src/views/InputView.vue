<script setup lang="ts">
import { SECTION_META } from '../types/workspace'
import Icon from '../components/shared/Icon.vue'
import PlaceholderPanel from '../components/shared/PlaceholderPanel.vue'

const meta = SECTION_META.input
</script>

<template>
  <section class="main-pane">
    <header class="main-pane__head">
      <div>
        <h1>{{ meta.title }}</h1>
        <p>{{ meta.subtitle }}</p>
      </div>
      <div class="main-pane__actions">
        <button type="button" class="btn-secondary" disabled>导入文件</button>
        <button type="button" class="btn-primary" disabled>
          <Icon name="sparkles" :size="12" />
          提取画像
        </button>
      </div>
    </header>

    <PlaceholderPanel
      title="录入区占位"
      description="后续在此接入 URL / 文本输入，并调用 extract-product-profile。"
      hint="支持 .txt / .md / .json / .csv"
    >
      <div class="form-skeleton">
        <label>公司网站</label>
        <div class="input-skeleton">https://www.example.com</div>
        <label>或粘贴产品说明文本</label>
        <div class="textarea-skeleton">产品名称、规格、应用场景、目标市场、认证信息…</div>
      </div>
    </PlaceholderPanel>
  </section>
</template>
