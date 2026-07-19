<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import Icon from '../shared/Icon.vue'
import ConfirmDialog from '../shared/ConfirmDialog.vue'
import { useWorkspace } from '../../composables/useWorkspace'
import { useSettingsNav } from '../../composables/useSettingsNav'
import {
  PIPELINE_TO_SECTION,
  type PipelineStepStatus,
  type ProductStatusTone,
  type WorkspaceSection,
} from '../../types/workspace'
import type { SettingsCategory } from '../../types/settings'

defineProps<{
  section: WorkspaceSection
}>()

const router = useRouter()
const { products, activeProductId, pipelineSteps, selectProduct, deleteProduct, createDraftProduct } =
  useWorkspace()
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
  { id: 'workspace', label: '工作区' },
  { id: 'opencode', label: 'OpenCode 运行时' },
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
  if (target) void router.push({ name: target })
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
    await router.push({ name: 'profile' })
  } catch (err) {
    deleteError.value = err instanceof Error ? err.message : String(err)
  } finally {
    creatingDraft.value = false
  }
}
</script>

<template>
  <aside class="sidebar" :aria-label="section === 'settings' ? '设置分类' : '产品与流水线'">
    <template v-if="section === 'settings'">
      <div class="sidebar__head">
        <span>设置分类</span>
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
