<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { LibraryTreeNode } from '../../types/library'
import Icon from '../shared/Icon.vue'
import { LIBRARY_DRAG_TYPE } from './library-paths'
import { selectGestureFromEvent, type LibrarySelectGesture } from './library-select'

const props = defineProps<{
  nodes: LibraryTreeNode[]
  expanded: Set<string>
  focusDir: string
  activePath: string
  selectedIds: Set<string>
  busy?: boolean
  dropImportDir?: string | null
  renamingPath?: string | null
}>()

const emit = defineEmits<{
  'select-root': []
  'activate-dir': [relativePath: string]
  'activate-file': [relativePath: string]
  'open-website': [node: LibraryTreeNode]
  'context-blank': [event: MouseEvent]
  'context-root': [event: MouseEvent]
  'context-node': [event: MouseEvent, node: LibraryTreeNode]
  'drag-over-import': [dir: string]
  'drop-import': [dir: string, event: DragEvent]
  'drop-move': [src: string, destDir: string]
  'rename-commit': [relativePath: string, newName: string]
  'rename-cancel': []
  'select-gesture': [relativePath: string, gesture: LibrarySelectGesture]
  'focus-node': [relativePath: string, kind: LibraryTreeNode['kind']]
}>()

const renameDraft = ref('')
const renameInputRef = ref<HTMLInputElement | null>(null)
let skipClick = false
let renameCancelled = false
let renameSubmitted = false

const visibleNodes = computed(() => flattenVisible(props.nodes, props.expanded))

const rootFocused = computed(
  () => props.activePath === '' && props.focusDir === '',
)

watch(
  () => props.renamingPath,
  async (rel) => {
    renameCancelled = false
    renameSubmitted = false
    if (!rel) return
    const node = visibleNodes.value.find((item) => item.relativePath === rel)
    renameDraft.value = node?.name ?? ''
    await nextTick()
    const input = renameInputRef.value
    if (!input) return
    input.focus()
    selectRenameRange(input, node)
  },
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

function isLibraryDrag(event: DragEvent): boolean {
  return Boolean(event.dataTransfer?.types?.includes(LIBRARY_DRAG_TYPE))
}

function isFileDrag(event: DragEvent): boolean {
  return Boolean(event.dataTransfer?.types?.includes('Files'))
}

function acceptDrop(event: DragEvent, dir: string, copy: boolean) {
  event.preventDefault()
  event.stopPropagation()
  if (props.busy) return
  if (event.dataTransfer) event.dataTransfer.dropEffect = copy ? 'copy' : 'move'
  emit('drag-over-import', dir)
}

function onRowDragStart(event: DragEvent, node: LibraryTreeNode) {
  if (props.busy || props.renamingPath) {
    event.preventDefault()
    return
  }
  skipClick = true
  event.dataTransfer?.setData(LIBRARY_DRAG_TYPE, node.relativePath)
  event.dataTransfer?.setData('text/plain', node.relativePath)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

function onRowDragEnd() {
  window.setTimeout(() => {
    skipClick = false
  }, 0)
}

function onRowDragOver(event: DragEvent, node: LibraryTreeNode) {
  if (isLibraryDrag(event)) {
    acceptDrop(event, dropDirFor(node), false)
    return
  }
  if (!isFileDrag(event)) return
  acceptDrop(event, dropDirFor(node), true)
}

function finishDrop(event: DragEvent, dir: string) {
  event.preventDefault()
  event.stopPropagation()
  if (props.busy) return
  const src = event.dataTransfer?.getData(LIBRARY_DRAG_TYPE)
  if (src) {
    emit('drop-move', src, dir)
    return
  }
  emit('drop-import', dir, event)
}

function onRowDrop(event: DragEvent, node: LibraryTreeNode) {
  finishDrop(event, dropDirFor(node))
}

function onRootDragOver(event: DragEvent) {
  if (isLibraryDrag(event)) {
    acceptDrop(event, '', false)
    return
  }
  if (!isFileDrag(event)) return
  acceptDrop(event, '', true)
}

function onRootDrop(event: DragEvent) {
  finishDrop(event, '')
}

function onTreeBlankDragOver(event: DragEvent) {
  if (isLibraryDrag(event)) {
    acceptDrop(event, '', false)
    return
  }
  if (!isFileDrag(event)) return
  acceptDrop(event, '', true)
}

function onTreeBlankDrop(event: DragEvent) {
  finishDrop(event, '')
}

function isDropTarget(node: LibraryTreeNode): boolean {
  if (props.dropImportDir == null) return false
  return node.kind === 'dir' && node.relativePath === props.dropImportDir
}

function onRowClick(node: LibraryTreeNode, event: MouseEvent) {
  if (skipClick || props.renamingPath) return
  const gesture = selectGestureFromEvent(event)
  if (gesture) {
    event.preventDefault()
    emit('select-gesture', node.relativePath, gesture)
    emit('focus-node', node.relativePath, node.kind)
    return
  }
  if (node.kind === 'dir') emit('activate-dir', node.relativePath)
  else emit('activate-file', node.relativePath)
}

function onCheckClick(node: LibraryTreeNode, event: MouseEvent) {
  event.preventDefault()
  const gesture = selectGestureFromEvent(event) ?? 'toggle'
  emit('select-gesture', node.relativePath, gesture)
}

function onRowDblClick(node: LibraryTreeNode) {
  if (props.renamingPath) return
  if (node.kind === 'website') emit('open-website', node)
}

function checkTitle(node: LibraryTreeNode): string {
  if (node.kind === 'dir') return '勾选该文件夹（生成画像时暂不递归）'
  return '勾选后参与生成画像'
}

function nodeIcon(node: LibraryTreeNode): 'folder' | 'globe' | 'file-text' {
  if (node.kind === 'dir') return 'folder'
  if (node.kind === 'website') return 'globe'
  return 'file-text'
}

function nodeSubtitle(node: LibraryTreeNode): string {
  if (node.kind === 'dir') return '文件夹'
  if (node.kind === 'website') return node.url || '网站'
  return formatSize(node.sizeBytes)
}

function selectRenameRange(input: HTMLInputElement, node?: LibraryTreeNode) {
  if (node?.kind === 'file') {
    const lastDot = node.name.lastIndexOf('.')
    if (lastDot > 0) {
      input.setSelectionRange(0, lastDot)
      return
    }
  }
  input.select()
}

function commitRename(rel: string) {
  if (renameCancelled || renameSubmitted) return
  renameSubmitted = true
  emit('rename-commit', rel, renameDraft.value)
}

function cancelRename() {
  renameCancelled = true
  emit('rename-cancel')
}

function onRenameKeydown(event: KeyboardEvent, rel: string) {
  if (event.key === 'Enter') {
    event.preventDefault()
    commitRename(rel)
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    cancelRename()
  }
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
        'is-checked': selectedIds.has(node.relativePath),
        'is-drop-target': isDropTarget(node),
        'is-renaming': renamingPath === node.relativePath,
      }"
      :style="{ paddingLeft: `${8 + node.depth * 16}px` }"
      :draggable="!busy && renamingPath !== node.relativePath"
      @click="!busy && onRowClick(node, $event)"
      @dblclick.stop="onRowDblClick(node)"
      @contextmenu="onRowContext($event, node)"
      @dragstart="onRowDragStart($event, node)"
      @dragend="onRowDragEnd"
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
        :disabled="busy"
        :title="checkTitle(node)"
        @click.stop="onCheckClick(node, $event)"
      >
        <Icon v-if="selectedIds.has(node.relativePath)" name="check" :size="10" />
      </button>

      <div class="library-open">
        <Icon
          :name="nodeIcon(node)"
          :size="14"
          class="library-type-icon"
        />
        <div class="library-meta">
          <input
            v-if="renamingPath === node.relativePath"
            ref="renameInputRef"
            v-model="renameDraft"
            class="library-rename-input"
            :disabled="busy"
            @click.stop
            @dblclick.stop
            @keydown="onRenameKeydown($event, node.relativePath)"
            @blur="commitRename(node.relativePath)"
          />
          <div v-else class="library-title">{{ node.name }}</div>
          <div class="muted">{{ nodeSubtitle(node) }}</div>
        </div>
      </div>
    </div>
  </div>
</template>
