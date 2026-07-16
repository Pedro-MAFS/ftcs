<script setup lang="ts">
import { useRouter } from 'vue-router'
import Icon from '../shared/Icon.vue'
import { useWorkspace } from '../../composables/useWorkspace'
import {
  PIPELINE_TO_SECTION,
  type PipelineStepStatus,
  type WorkspaceSection,
} from '../../types/workspace'

defineProps<{
  section: WorkspaceSection
}>()

const router = useRouter()
const { products, activeProductId, pipelineSteps, selectProduct } = useWorkspace()

function statusClass(status: PipelineStepStatus): string {
  return `is-${status}`
}

function onPipelineClick(stepId: string): void {
  const target = PIPELINE_TO_SECTION[stepId as keyof typeof PIPELINE_TO_SECTION]
  if (target) void router.push({ name: target })
}
</script>

<template>
  <aside class="sidebar" aria-label="产品与流水线">
    <div class="sidebar__head">
      <span>产品</span>
      <button type="button" class="icon-btn" title="新建产品" aria-label="新建产品" disabled>
        <Icon name="plus" :size="14" />
      </button>
    </div>

    <button
      v-for="product in products"
      :key="product.id"
      type="button"
      class="product-item"
      :class="{ 'is-active': product.id === activeProductId }"
      @click="selectProduct(product.id)"
    >
      <span class="product-item__name">{{ product.name }}</span>
      <span class="product-item__meta">{{ product.meta }}</span>
    </button>

    <div class="sidebar__gap" />

    <div class="sidebar__head">
      <span>流水线</span>
    </div>

    <button
      v-for="step in pipelineSteps"
      :key="step.id"
      type="button"
      class="pipeline-item"
      :class="statusClass(step.status)"
      @click="onPipelineClick(step.id)"
    >
      <i class="pipeline-item__dot" />
      <span class="pipeline-item__label">{{ step.label }}</span>
      <span class="pipeline-item__status">{{ step.statusLabel }}</span>
    </button>
  </aside>
</template>
