<script setup lang="ts">
import { ref } from 'vue'
import Icon from '../shared/Icon.vue'
import ConfirmDialog from '../shared/ConfirmDialog.vue'
import { useWorkspace } from '../../composables/useWorkspace'
import { useWorkspaceLayout } from '../../composables/useWorkspaceLayout'
import { isPageKey, useMainViewTabs } from '../../composables/useMainViewTabs'
import { useSettingsNav } from '../../composables/useSettingsNav'
import { productAvatarGlyph } from './product-avatar'
import {
  PIPELINE_TO_SECTION,
  type PipelineStepStatus,
  type ProductStatusTone,
} from '../../types/workspace'
import type { SettingsCategory } from '../../types/settings'

defineProps<{
  settings: boolean
}>()
const { products, activeProductId, pipelineSteps, selectProduct, deleteProduct, createDraftProduct } =
  useWorkspace()
const { widths, pipelineColumnCollapsed, collapsePipelineColumn, expandPipelineColumn } =
  useWorkspaceLayout()
const { openPageTab } = useMainViewTabs()
const { activeCategory, setCategory } = useSettingsNav()

const deletingId = ref('')
const creatingDraft = ref(false)
const deleteError = ref('')
const confirmOpen = ref(false)
const pendingDelete = ref<{ id: string; label: string } | null>(null)

const settingsCats: Array<{ id: SettingsCategory; label: string }> = [
  { id: 'account', label: '账号与授权' },
  { id: 'model', label: '模型与提供商' },
  { id: 'search', label: '搜索服务' },
  { id: 'explore', label: '探索' },
  { id: 'integrations', label: '集成' },
  { id: 'outreach', label: '开发信' },
  { id: 'appearance', label: '外观' },
  { id: 'startup', label: '启动与托盘' },
  { id: 'notifications', label: '通知' },
  { id: 'workspace', label: '工作区' },
  { id: 'opencode', label: '运行状态' },
  { id: 'about', label: '关于与隐私' },
]

function statusClass(status: PipelineStepStatus): string {
  return `is-${status}`
}

function productToneClass(tone: ProductStatusTone): string {
  return `is-${tone}`
}

function onPipelineClick(stepId: string): void {
  const target = PIPELINE_TO_SECTION[stepId as keyof typeof PIPELINE_TO_SECTION]
  if (target && isPageKey(target)) void openPageTab(target)
}

function onSettingsCat(id: SettingsCategory): void {
  setCategory(id)
  const el = document.getElementById(`settings-${id}`)
  el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function requestDelete(
  event: MouseEvent,
  productId: string,
  companyName: string,
): void {
  event.stopPropagation()
  event.preventDefault()
  if (deletingId.value) return
  pendingDelete.value = {
    id: productId,
    label: companyName || productId,
  }
  deleteError.value = ''
  confirmOpen.value = true
}

function cancelDelete(): void {
  if (deletingId.value) return
  confirmOpen.value = false
  pendingDelete.value = null
}

async function confirmDelete(): Promise<void> {
  const target = pendingDelete.value
  if (!target || deletingId.value) return

  deletingId.value = target.id
  deleteError.value = ''
  try {
    const res = await deleteProduct(target.id)
    if (!res.ok) {
      deleteError.value = res.message
      return
    }
    confirmOpen.value = false
    pendingDelete.value = null
  } catch (err) {
    deleteError.value = err instanceof Error ? err.message : String(err)
  } finally {
    deletingId.value = ''
  }
}

async function onCreateDraft(): Promise<void> {
  if (creatingDraft.value) return
  creatingDraft.value = true
  deleteError.value = ''
  try {
    const res = await createDraftProduct()
    if (!res.ok) {
      deleteError.value = res.message
      return
    }
    await openPageTab('profile')
  } catch (err) {
    deleteError.value = err instanceof Error ? err.message : String(err)
  } finally {
    creatingDraft.value = false
  }
}
</script>

<template>
  <aside
    class="sidebar"
    :class="{ 'is-collapsed': pipelineColumnCollapsed }"
    :style="{ width: `${widths.pipeline}px` }"
    :aria-label="pipelineColumnCollapsed ? (settings ? '设置分类' : '产品') : settings ? '设置分类' : '产品与流水线'"
  >
    <template v-if="pipelineColumnCollapsed && settings">
      <button
        type="button"
        class="icon-btn"
        title="展开"
        aria-label="展开设置分类"
        @click="expandPipelineColumn"
      >
        <Icon name="panel-left-open" :size="14" />
      </button>
    </template>

    <template v-else-if="pipelineColumnCollapsed">
      <button
        type="button"
        class="icon-btn"
        title="展开"
        aria-label="展开产品栏"
        @click="expandPipelineColumn"
      >
        <Icon name="panel-left-open" :size="14" />
      </button>
      <div class="sidebar__avatars">
        <button
          v-for="product in products"
          :key="product.id"
          type="button"
          class="product-avatar"
          :class="{ 'is-current': product.id === activeProductId }"
          :title="product.name"
          @click="selectProduct(product.id)"
        >
          {{ productAvatarGlyph(product.name) }}
        </button>
      </div>
    </template>

    <template v-else-if="settings">
      <div class="sidebar__head">
        <span>设置分类</span>
        <button
          type="button"
          class="icon-btn"
          title="收起"
          aria-label="收起设置分类"
          @click="collapsePipelineColumn"
        >
          <Icon name="panel-left-close" :size="14" />
        </button>
      </div>
      <button
        v-for="cat in settingsCats"
        :key="cat.id"
        type="button"
        class="product-item product-item--simple"
        :class="{ 'is-active': activeCategory === cat.id }"
        @click="onSettingsCat(cat.id)"
      >
        <span class="product-item__name">{{ cat.label }}</span>
      </button>
    </template>

    <template v-else>
      <div class="sidebar__head">
        <span>产品</span>
        <div class="sidebar__head-actions">
          <button
            type="button"
            class="icon-btn"
            title="新建空白草稿"
            aria-label="新建空白草稿"
            :disabled="creatingDraft"
            @click="onCreateDraft"
          >
            <Icon name="plus" :size="14" />
          </button>
          <button
            type="button"
            class="icon-btn"
            title="收起"
            aria-label="收起产品栏"
            @click="collapsePipelineColumn"
          >
            <Icon name="panel-left-close" :size="14" />
          </button>
        </div>
      </div>

      <p v-if="deleteError" class="sidebar__error">{{ deleteError }}</p>

      <div
        v-for="product in products"
        :key="product.id"
        class="product-item"
        :class="{ 'is-active': product.id === activeProductId }"
        :title="product.productsTooltip"
        role="button"
        tabindex="0"
        @click="selectProduct(product.id)"
        @keydown.enter="selectProduct(product.id)"
      >
        <div class="product-item__top">
          <span class="product-item__name">{{ product.companyName }}</span>
          <button
            type="button"
            class="product-item__delete"
            :disabled="deletingId === product.id"
            :title="deletingId === product.id ? '删除中…' : '删除产品'"
            aria-label="删除产品"
            @click="requestDelete($event, product.id, product.companyName)"
          >
            <Icon name="trash" :size="12" />
          </button>
        </div>
        <span class="product-item__products">{{ product.productsLabel }}</span>
        <span class="product-item__meta">
          <span
            class="product-item__status"
            :class="productToneClass(product.statusTone)"
          >{{ product.statusLabel }}</span>
          <span class="product-item__sep">·</span>
          <span class="product-item__date">{{ product.updatedLabel }}</span>
        </span>
      </div>

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
    </template>
  </aside>

  <ConfirmDialog
    :open="confirmOpen"
    title="删除产品"
    :message="pendingDelete ? `确定删除「${pendingDelete.label}」吗？删除后将不再显示在列表中。` : ''"
    confirm-label="删除"
    cancel-label="取消"
    danger
    :busy="Boolean(deletingId)"
    @confirm="confirmDelete"
    @cancel="cancelDelete"
  />
</template>
