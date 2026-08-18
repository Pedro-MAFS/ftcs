<script setup lang="ts">
import { computed } from 'vue'
import type { LibraryTreeNode } from '../../types/library'
import Icon from '../shared/Icon.vue'

const props = defineProps<{
  nodes: LibraryTreeNode[]
  expanded: Set<string>
  focusDir: string
  activePath: string
  selectedIds: Set<string>
  busy?: boolean
}>()

const emit = defineEmits<{
  'select-root': []
  'activate-dir': [relativePath: string]
  'activate-file': [relativePath: string]
  'toggle-select': [relativePath: string]
  delete: [node: LibraryTreeNode]
}>()

const visibleNodes = computed(() => flattenVisible(props.nodes, props.expanded))

const rootFocused = computed(
  () => props.activePath === '' && props.focusDir === '',
)

function flattenVisible(
  nodes: LibraryTreeNode[],
  expanded: Set<string>,
): LibraryTreeNode[] {
  const out: LibraryTreeNode[] = []
  for (const node of nodes) {
    out.push(node)
    if (node.kind === 'dir' && expanded.has(node.relativePath)) {
      out.push(...flattenVisible(node.children, expanded))
    }
  }
  return out
}

function formatSize(n?: number): string {
  if (n == null) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function isFocused(node: LibraryTreeNode): boolean {
  if (props.activePath) return props.activePath === node.relativePath
  return node.kind === 'dir' && props.focusDir === node.relativePath
}

function onActivate(node: LibraryTreeNode) {
  if (node.kind === 'dir') emit('activate-dir', node.relativePath)
  else emit('activate-file', node.relativePath)
}
</script>

<template>
  <div class="library-tree">
    <div
      class="library-tree-row"
      :class="{ 'is-focused': rootFocused }"
      :style="{ paddingLeft: '8px' }"
      @click="emit('select-root')"
    >
      <span class="library-tree-chevron" aria-hidden="true">
        <Icon name="chevron-down" :size="12" />
      </span>
      <span class="library-tree-check-slot" />
      <Icon name="folder" :size="14" class="library-type-icon" />
      <div class="library-meta">
        <div class="library-title">资料库</div>
        <div class="muted">data/library/files</div>
      </div>
    </div>

    <div
      v-for="node in visibleNodes"
      :key="node.relativePath"
      class="library-tree-row"
      :class="{
        'is-focused': isFocused(node),
        'is-checked': node.kind === 'file' && selectedIds.has(node.relativePath),
      }"
      :style="{ paddingLeft: `${8 + node.depth * 16}px` }"
      @click="!busy && onActivate(node)"
    >
      <button
        v-if="node.kind === 'dir'"
        type="button"
        class="library-tree-chevron"
        :aria-expanded="expanded.has(node.relativePath)"
        :disabled="busy"
        @click.stop="emit('activate-dir', node.relativePath)"
      >
        <Icon
          :name="expanded.has(node.relativePath) ? 'chevron-down' : 'chevron-right'"
          :size="12"
        />
      </button>
      <span v-else class="library-tree-chevron" aria-hidden="true" />

      <button
        type="button"
        class="library-check"
        :class="{ on: selectedIds.has(node.relativePath) }"
        :aria-pressed="selectedIds.has(node.relativePath)"
        :disabled="busy || node.kind === 'dir'"
        :title="node.kind === 'file' ? '勾选后参与生成画像' : '文件夹勾选将在后续版本开放'"
        @click.stop="node.kind === 'file' && emit('toggle-select', node.relativePath)"
      >
        <Icon v-if="selectedIds.has(node.relativePath)" name="check" :size="10" />
      </button>

      <div class="library-open">
        <Icon
          :name="node.kind === 'dir' ? 'folder' : 'file-text'"
          :size="14"
          class="library-type-icon"
        />
        <div class="library-meta">
          <div class="library-title">{{ node.name }}</div>
          <div class="muted">
            {{ node.kind === 'dir' ? '文件夹' : formatSize(node.sizeBytes) }}
          </div>
        </div>
      </div>

      <button
        type="button"
        class="icon-btn library-delete"
        title="删除"
        :disabled="busy"
        @click.stop="emit('delete', node)"
      >
        <Icon name="trash" :size="13" />
      </button>
    </div>
  </div>
</template>
