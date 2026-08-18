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
  dropImportDir?: string | null
}>()

const emit = defineEmits<{
  'select-root': []
  'activate-dir': [relativePath: string]
  'activate-file': [relativePath: string]
  'toggle-select': [relativePath: string]
  'context-blank': [event: MouseEvent]
  'context-root': [event: MouseEvent]
  'context-node': [event: MouseEvent, node: LibraryTreeNode]
  'drag-over-import': [dir: string]
  'drop-import': [dir: string, event: DragEvent]
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

function dropDirFor(node: LibraryTreeNode): string {
  if (node.kind === 'dir') return node.relativePath
  const parts = node.relativePath.replace(/\\/g, '/').split('/').filter(Boolean)
  parts.pop()
  return parts.join('/')
}

function isFileDrag(event: DragEvent): boolean {
  return Boolean(event.dataTransfer?.types?.includes('Files'))
}

function onRowDragOver(event: DragEvent, node: LibraryTreeNode) {
  if (!isFileDrag(event)) return
  event.preventDefault()
  event.stopPropagation()
  if (props.busy) return
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
  emit('drag-over-import', dropDirFor(node))
}

function onRowDrop(event: DragEvent, node: LibraryTreeNode) {
  event.preventDefault()
  event.stopPropagation()
  if (props.busy) return
  emit('drop-import', dropDirFor(node), event)
}

function onRootDragOver(event: DragEvent) {
  if (!isFileDrag(event)) return
  event.preventDefault()
  event.stopPropagation()
  if (props.busy) return
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
  emit('drag-over-import', '')
}

function onRootDrop(event: DragEvent) {
  event.preventDefault()
  event.stopPropagation()
  if (props.busy) return
  emit('drop-import', '', event)
}

function onTreeBlankDragOver(event: DragEvent) {
  if (!isFileDrag(event)) return
  event.preventDefault()
  event.stopPropagation()
  if (props.busy) return
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
  emit('drag-over-import', '')
}

function onTreeBlankDrop(event: DragEvent) {
  event.preventDefault()
  event.stopPropagation()
  if (props.busy) return
  emit('drop-import', '', event)
}

function isDropTarget(node: LibraryTreeNode): boolean {
  if (props.dropImportDir == null) return false
  return node.kind === 'dir' && node.relativePath === props.dropImportDir
}

function onActivate(node: LibraryTreeNode) {
  if (node.kind === 'dir') emit('activate-dir', node.relativePath)
  else emit('activate-file', node.relativePath)
}

function onRowContext(event: MouseEvent, node: LibraryTreeNode) {
  event.preventDefault()
  event.stopPropagation()
  if (props.busy) return
  emit('context-node', event, node)
}

function onRootContext(event: MouseEvent) {
  event.preventDefault()
  event.stopPropagation()
  if (props.busy) return
  emit('context-root', event)
}

function onTreeBlankContext(event: MouseEvent) {
  event.preventDefault()
  event.stopPropagation()
  if (props.busy) return
  emit('context-blank', event)
}
</script>

<template>
  <div
    class="library-tree"
    @contextmenu="onTreeBlankContext"
    @dragover="onTreeBlankDragOver"
    @drop="onTreeBlankDrop"
  >
    <div
      class="library-tree-row"
      :class="{
        'is-focused': rootFocused,
        'is-drop-target': dropImportDir === '',
      }"
      :style="{ paddingLeft: '8px' }"
      @click="emit('select-root')"
      @contextmenu="onRootContext"
      @dragover="onRootDragOver"
      @drop="onRootDrop"
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
        'is-drop-target': isDropTarget(node),
      }"
      :style="{ paddingLeft: `${8 + node.depth * 16}px` }"
      @click="!busy && onActivate(node)"
      @contextmenu="onRowContext($event, node)"
      @dragover="onRowDragOver($event, node)"
      @drop="onRowDrop($event, node)"
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
    </div>
  </div>
</template>
