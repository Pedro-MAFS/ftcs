<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { SECTION_META } from '../types/workspace'
import type { LibrarySnapshot, LibraryTreeNode } from '../types/library'
import { useWorkspace } from '../composables/useWorkspace'
import { ensureAgentReady } from '../composables/useAgentPreflight'
import Icon from '../components/shared/Icon.vue'
import LibraryTree from '../components/library/LibraryTree.vue'
import LibraryContextMenu from '../components/library/LibraryContextMenu.vue'
import {
  libraryContextItems,
  type LibraryContextAction,
  type LibraryContextKind,
} from '../components/library/library-context'
import { LIBRARY_DRAG_TYPE, remapPathPrefix, remapPathSet } from '../components/library/library-paths'
import {
  applyLibrarySelect,
  flattenVisibleIds,
  normalizeFolderChecks,
  type LibrarySelectGesture,
} from '../components/library/library-select'
import { expandGenerateSelection } from '../components/library/library-generate'
import ConfirmDialog from '../components/shared/ConfirmDialog.vue'

const meta = SECTION_META.input
const router = useRouter()
const { resetAgentForGenerate, clearAgentStartFailed, generating } = useWorkspace()

const websiteUrl = ref('')
const savingWebsite = ref(false)
const websiteInputRef = ref<HTMLInputElement | null>(null)
const focusDir = ref('')
const activePath = ref('')
const tree = ref<LibraryTreeNode[]>([])
const truncated = ref(false)
const expanded = ref<Set<string>>(new Set())
const selectedIds = ref<Set<string>>(new Set())
const busy = ref(false)
const message = ref('')
const error = ref('')
const dragOver = ref(false)
const dropImportDir = ref<string | null>(null)
const dragDepth = ref(0)
const creatingFolder = ref(false)
const newFolderName = ref('')
const folderInputRef = ref<HTMLInputElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)
const ctxMenu = ref<{ kind: LibraryContextKind; x: number; y: number } | null>(null)
const ctxNode = ref<LibraryTreeNode | null>(null)
const renamingPath = ref<string | null>(null)
const selectAnchor = ref<string | null>(null)
const confirmGenerate = ref(false)
const confirmGenerateMessage = ref('')
/** 不要放进 ref：Vue Proxy 无法经 Electron IPC 克隆 */
let pendingGenerate: { websitePaths: string[]; filePaths: string[] } | null = null

function collectFilePaths(nodes: LibraryTreeNode[]): string[] {
  const out: string[] = []
  for (const node of nodes) {
    if (node.kind === 'file') out.push(node.relativePath)
    if (node.children.length) out.push(...collectFilePaths(node.children))
  }
  return out
}

function collectWebsitePaths(nodes: LibraryTreeNode[]): string[] {
  const out: string[] = []
  for (const node of nodes) {
    if (node.kind === 'website') out.push(node.relativePath)
    if (node.children.length) out.push(...collectWebsitePaths(node.children))
  }
  return out
}

function collectCheckablePaths(nodes: LibraryTreeNode[]): string[] {
  const out: string[] = []
  for (const node of nodes) {
    out.push(node.relativePath)
    if (node.children.length) out.push(...collectCheckablePaths(node.children))
  }
  return out
}

function collectAllPaths(nodes: LibraryTreeNode[]): Set<string> {
  const out = new Set<string>([''])
  for (const node of nodes) {
    out.add(node.relativePath)
    for (const child of collectAllPaths(node.children)) out.add(child)
  }
  return out
}

function parentDir(relativePath: string): string {
  const parts = relativePath.replace(/\\/g, '/').split('/').filter(Boolean)
  parts.pop()
  return parts.join('/')
}

const filePaths = computed(() => collectFilePaths(tree.value))
const websitePathsInTree = computed(() => collectWebsitePaths(tree.value))
const selectedFileCount = computed(
  () => [...selectedIds.value].filter((id) => filePaths.value.includes(id)).length,
)
const selectedWebsiteCount = computed(
  () => [...selectedIds.value].filter((id) => websitePathsInTree.value.includes(id)).length,
)
const selectedFolderCount = computed(
  () =>
    [...selectedIds.value].filter(
      (id) => !filePaths.value.includes(id) && !websitePathsInTree.value.includes(id),
    ).length,
)
const selectedCount = computed(() => selectedIds.value.size)
const generatePickCount = computed(() => selectedFileCount.value + selectedWebsiteCount.value)
const canGenerate = computed(
  () =>
    selectedCount.value > 0 &&
    !busy.value &&
    !generating.value &&
    !confirmGenerate.value,
)
const selectedCountTitle = computed(() => {
  const parts = [
    selectedFileCount.value ? `文件 ${selectedFileCount.value}` : '',
    selectedWebsiteCount.value ? `网站 ${selectedWebsiteCount.value}` : '',
    selectedFolderCount.value ? `文件夹 ${selectedFolderCount.value}` : '',
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : '尚未勾选'
})
const generateButtonTitle = computed(() => {
  if (generatePickCount.value || selectedFolderCount.value) return '基于勾选资料生成一份画像'
  return '请先勾选文件、网站或文件夹'
})
const isEmpty = computed(() => tree.value.length === 0)
const ctxItems = computed(() =>
  ctxMenu.value ? libraryContextItems(ctxMenu.value.kind) : [],
)

watch(
  () => busy.value || generating.value,
  (blocked) => {
    if (blocked) {
      closeCtxMenu()
      renamingPath.value = null
    }
  },
)

function applySnapshot(snap: LibrarySnapshot, remap?: { from: string; to: string }) {
  if (remap?.from && remap.to && remap.from !== remap.to) {
    selectedIds.value = remapPathSet(selectedIds.value, remap.from, remap.to)
    expanded.value = remapPathSet(expanded.value, remap.from, remap.to)
    activePath.value = remapPathPrefix(activePath.value, remap.from, remap.to)
    if (selectAnchor.value) {
      selectAnchor.value = remapPathPrefix(selectAnchor.value, remap.from, remap.to)
    }
  }
  tree.value = snap.tree ?? []
  truncated.value = Boolean(snap.truncated)
  focusDir.value = snap.focusDir ?? snap.cwd ?? ''
  const valid = new Set(collectCheckablePaths(tree.value))
  selectedIds.value = normalizeFolderChecks(
    tree.value,
    new Set([...selectedIds.value].filter((id) => valid.has(id))),
  )
  if (selectAnchor.value && !valid.has(selectAnchor.value) && selectAnchor.value !== '') {
    selectAnchor.value = null
  }
  const all = collectAllPaths(tree.value)
  if (activePath.value && !all.has(activePath.value)) {
    activePath.value = focusDir.value
  }
}

function applyResult(
  res: { ok: boolean; message: string; snapshot: LibrarySnapshot },
  remap?: { from: string; to: string },
) {
  applySnapshot(res.snapshot, remap)
  if (res.ok) {
    if (res.message) message.value = res.message
  } else {
    error.value = res.message
  }
}

async function refresh() {
  if (!window.ftcs?.listLibrary) {
    error.value = '桌面 API 不可用'
    return
  }
  error.value = ''
  const snap = await window.ftcs.listLibrary(focusDir.value)
  applySnapshot(snap)
}

function onSelectGesture(id: string, gesture: LibrarySelectGesture) {
  const visible = flattenVisibleIds(tree.value, expanded.value)
  const result = applyLibrarySelect(
    tree.value,
    selectedIds.value,
    visible,
    id,
    gesture,
    selectAnchor.value,
  )
  selectedIds.value = result.selected
  selectAnchor.value = result.anchor
}

function onFocusNode(rel: string, kind: LibraryTreeNode['kind']) {
  if (kind === 'dir') {
    focusDir.value = rel
    activePath.value = rel
    return
  }
  focusDir.value = parentDir(rel)
  activePath.value = rel
}

function toggleExpanded(rel: string) {
  const next = new Set(expanded.value)
  if (next.has(rel)) next.delete(rel)
  else next.add(rel)
  expanded.value = next
}

function onSelectRoot() {
  focusDir.value = ''
  activePath.value = ''
}

function onActivateDir(rel: string) {
  focusDir.value = rel
  activePath.value = rel
  toggleExpanded(rel)
}

function onActivateFile(rel: string) {
  focusDir.value = parentDir(rel)
  activePath.value = rel
}

function findNode(nodes: LibraryTreeNode[], rel: string): LibraryTreeNode | null {
  for (const node of nodes) {
    if (node.relativePath === rel) return node
    const child = findNode(node.children, rel)
    if (child) return child
  }
  return null
}

function closeCtxMenu() {
  ctxMenu.value = null
  ctxNode.value = null
}

function startRename(node: LibraryTreeNode) {
  if (busy.value || generating.value) return
  cancelCreateFolder()
  cancelSaveWebsite()
  closeCtxMenu()
  if (node.kind === 'dir') {
    focusDir.value = node.relativePath
    activePath.value = node.relativePath
  } else {
    focusDir.value = parentDir(node.relativePath)
    activePath.value = node.relativePath
  }
  renamingPath.value = node.relativePath
}

function cancelRename() {
  renamingPath.value = null
}

async function commitRename(rel: string, newName: string) {
  if (renamingPath.value !== rel) return
  renamingPath.value = null
  if (!window.ftcs?.renameLibraryEntry || busy.value) return
  const name = newName.trim()
  if (!name) {
    error.value = '请输入名称'
    return
  }
  busy.value = true
  error.value = ''
  message.value = ''
  try {
    const res = await window.ftcs.renameLibraryEntry(rel, name, focusDir.value)
    applyResult(
      res,
      res.ok && res.createdPath ? { from: rel, to: res.createdPath } : undefined,
    )
    if (res.ok && res.createdPath) activePath.value = res.createdPath
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

async function moveEntry(src: string, destDir: string) {
  if (!window.ftcs?.moveLibraryEntry || !src || busy.value || generating.value) return
  busy.value = true
  error.value = ''
  message.value = ''
  try {
    const res = await window.ftcs.moveLibraryEntry(src, destDir, focusDir.value)
    applyResult(
      res,
      res.ok && res.createdPath ? { from: src, to: res.createdPath } : undefined,
    )
    if (res.ok && res.createdPath) activePath.value = res.createdPath
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

function openCtxMenu(kind: LibraryContextKind, event: MouseEvent, node: LibraryTreeNode | null) {
  if (busy.value || generating.value) return
  ctxNode.value = node
  ctxMenu.value = { kind, x: event.clientX, y: event.clientY }
}

function onBlankContext(event: MouseEvent) {
  event.preventDefault()
  onSelectRoot()
  openCtxMenu('blank', event, null)
}

function onRootContext(event: MouseEvent) {
  event.preventDefault()
  onSelectRoot()
  openCtxMenu('root', event, null)
}

function onNodeContext(event: MouseEvent, node: LibraryTreeNode) {
  event.preventDefault()
  if (node.kind === 'dir') {
    focusDir.value = node.relativePath
    activePath.value = node.relativePath
  } else {
    focusDir.value = parentDir(node.relativePath)
    activePath.value = node.relativePath
  }
  openCtxMenu(node.kind, event, node)
}

async function onCtxPick(id: LibraryContextAction) {
  const node = ctxNode.value
  closeCtxMenu()
  if (id === 'mkdir') {
    await startCreateFolder()
    return
  }
  if (id === 'paste') {
    await pasteFromClipboard()
    return
  }
  if (id === 'upload') {
    await uploadFiles()
    return
  }
  if (id === 'import-folder') {
    await importFolders()
    return
  }
  if (id === 'save-website') {
    await startSaveWebsite()
    return
  }
  if (id === 'rename' && node) {
    startRename(node)
    return
  }
  if (id === 'open-website' && node) {
    await openWebsite(node)
    return
  }
  if (id === 'delete' && node) await removeEntry(node)
}

async function startSaveWebsite() {
  cancelCreateFolder()
  cancelRename()
  savingWebsite.value = true
  websiteUrl.value = ''
  error.value = ''
  message.value = ''
  await nextTick()
  websiteInputRef.value?.focus()
}

function cancelSaveWebsite() {
  savingWebsite.value = false
  websiteUrl.value = ''
}

async function confirmSaveWebsite() {
  if (!window.ftcs?.addWebsite || busy.value) return
  const url = websiteUrl.value.trim()
  if (!url) {
    error.value = '请输入公司网站 URL'
    return
  }
  busy.value = true
  error.value = ''
  message.value = ''
  try {
    const res = await window.ftcs.addWebsite(url, focusDir.value)
    applyResult(res)
    if (res.ok) {
      savingWebsite.value = false
      websiteUrl.value = ''
      const created = res.createdPath
      if (created) {
        selectedIds.value = normalizeFolderChecks(
          tree.value,
          new Set([...selectedIds.value, created]),
        )
        const parent = parentDir(created)
        const expandedNext = new Set(expanded.value)
        if (parent) expandedNext.add(parent)
        expanded.value = expandedNext
        activePath.value = created
      }
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

async function openWebsite(node: LibraryTreeNode) {
  const url = node.url
  if (!url || !window.ftcs?.openExternal) return
  try {
    const res = await window.ftcs.openExternal(url)
    if (!res.ok) error.value = res.message
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
}

async function startCreateFolder() {
  cancelSaveWebsite()
  cancelRename()
  creatingFolder.value = true
  newFolderName.value = ''
  error.value = ''
  message.value = ''
  await nextTick()
  folderInputRef.value?.focus()
}

function cancelCreateFolder() {
  creatingFolder.value = false
  newFolderName.value = ''
}

async function confirmCreateFolder() {
  if (!window.ftcs?.createLibraryFolder || busy.value) return
  const name = newFolderName.value.trim()
  if (!name) {
    error.value = '请输入目录名'
    return
  }
  busy.value = true
  error.value = ''
  message.value = ''
  const parent = focusDir.value
  try {
    const res = await window.ftcs.createLibraryFolder(name, parent)
    applyResult(res)
    if (res.ok) {
      creatingFolder.value = false
      newFolderName.value = ''
      const next = new Set(expanded.value)
      if (parent) next.add(parent)
      if (res.snapshot.focusDir) {
        next.add(res.snapshot.focusDir)
        activePath.value = res.snapshot.focusDir
      }
      expanded.value = next
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

async function uploadFiles() {
  if (!window.ftcs?.uploadLibraryFiles || busy.value) return
  busy.value = true
  error.value = ''
  message.value = ''
  try {
    const res = await window.ftcs.uploadLibraryFiles(focusDir.value)
    applySnapshot(res.snapshot)
    if (res.message) {
      if (res.ok) message.value = res.message
      else error.value = res.message
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

async function importFolders() {
  if (!window.ftcs?.importLibraryFolders || busy.value) return
  busy.value = true
  error.value = ''
  message.value = ''
  try {
    const res = await window.ftcs.importLibraryFolders(focusDir.value)
    applySnapshot(res.snapshot)
    if (res.message) {
      if (res.ok) message.value = res.message
      else error.value = res.message
    }
    if (res.ok && focusDir.value) {
      const next = new Set(expanded.value)
      next.add(focusDir.value)
      expanded.value = next
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

async function importPaths(paths: string[], destDir?: string) {
  if (!window.ftcs?.importLibraryPaths || !paths.length || busy.value) return
  const dir = destDir ?? focusDir.value
  busy.value = true
  error.value = ''
  message.value = ''
  try {
    const res = await window.ftcs.importLibraryPaths(paths, dir)
    applySnapshot(res.snapshot)
    if (res.message) {
      if (res.ok) message.value = res.message
      else error.value = res.message
    }
    if (res.ok) {
      focusDir.value = dir
      activePath.value = dir
      if (dir) {
        const next = new Set(expanded.value)
        next.add(dir)
        expanded.value = next
      }
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

async function pasteFromClipboard() {
  if (!window.ftcs?.pasteClipboardFiles || busy.value) return
  busy.value = true
  error.value = ''
  message.value = ''
  try {
    const res = await window.ftcs.pasteClipboardFiles(focusDir.value)
    applySnapshot(res.snapshot)
    if (res.message) {
      if (res.ok) message.value = res.message
      else error.value = res.message
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

function collectDroppedPaths(fileList: FileList | File[] | null | undefined): string[] {
  if (!fileList || !window.ftcs?.getPathForFile) return []
  const files = Array.from(fileList)
  return files.map((f) => window.ftcs!.getPathForFile(f)).filter(Boolean)
}

async function onPaste(e: ClipboardEvent) {
  const target = e.target as HTMLElement | null
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
    const hasOsFiles = (e.clipboardData?.files?.length ?? 0) > 0
    if (!hasOsFiles) return
  }

  const fromEvent = collectDroppedPaths(e.clipboardData?.files)
  if (fromEvent.length) {
    e.preventDefault()
    await importPaths(fromEvent)
    return
  }

  e.preventDefault()
  await pasteFromClipboard()
}

function onGlobalKeydown(e: KeyboardEvent) {
  const target = e.target as HTMLElement | null
  const inField = Boolean(target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'))

  if (e.key === 'F2' && !inField && !busy.value && !generating.value) {
    if (!activePath.value) return
    const node = findNode(tree.value, activePath.value)
    if (!node) return
    e.preventDefault()
    closeCtxMenu()
    startRename(node)
    return
  }

  if (e.key === 'Delete' && !inField && !busy.value && !generating.value) {
    if (!activePath.value) return
    const node = findNode(tree.value, activePath.value)
    if (!node) return
    e.preventDefault()
    closeCtxMenu()
    void removeEntry(node)
    return
  }

  const key = e.key.toLowerCase()
  const withMod = e.ctrlKey || e.metaKey
  if (!withMod || key !== 'v') return
  if (inField) return

  e.preventDefault()
  void pasteFromClipboard()
}

function isLibraryDrag(e: DragEvent): boolean {
  return Boolean(e.dataTransfer?.types?.includes(LIBRARY_DRAG_TYPE))
}

function isFileDrag(e: DragEvent): boolean {
  return Boolean(e.dataTransfer?.types?.includes('Files'))
}

function clearDrag() {
  dragDepth.value = 0
  dragOver.value = false
  dropImportDir.value = null
}

function onDragOverImport(dir: string) {
  dragOver.value = true
  dropImportDir.value = dir
}

function onWrapDragEnter(e: DragEvent) {
  if (busy.value || generating.value) return
  if (!isFileDrag(e) && !isLibraryDrag(e)) return
  e.preventDefault()
  dragDepth.value += 1
  dragOver.value = true
  if (dropImportDir.value == null) dropImportDir.value = ''
}

function onWrapDragOver(e: DragEvent) {
  if (busy.value || generating.value) return
  if (isLibraryDrag(e)) {
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
    onDragOverImport('')
    return
  }
  if (!isFileDrag(e)) return
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
  onDragOverImport('')
}

function onWrapDragLeave() {
  dragDepth.value -= 1
  if (dragDepth.value <= 0) clearDrag()
}

async function onDropImport(dir: string, e: DragEvent) {
  e.preventDefault()
  clearDrag()
  const src = e.dataTransfer?.getData(LIBRARY_DRAG_TYPE)
  if (src) {
    await moveEntry(src, dir)
    return
  }
  const paths = collectDroppedPaths(e.dataTransfer?.files)
  if (!paths.length) {
    error.value = '拖入的内容无法识别为本地文件'
    return
  }
  await importPaths(paths, dir)
}

async function onDrop(e: DragEvent) {
  await onDropImport('', e)
}

async function removeEntry(node: LibraryTreeNode) {
  if (!window.ftcs?.deleteLibraryEntry || busy.value) return
  const tip =
    node.kind === 'dir'
      ? `删除目录「${node.name}」及其全部内容？`
      : node.kind === 'website'
        ? `删除网站「${node.name}」？`
        : `删除文件「${node.name}」？`
  if (!window.confirm(tip)) return
  busy.value = true
  error.value = ''
  message.value = ''
  try {
    const res = await window.ftcs.deleteLibraryEntry(node.relativePath, focusDir.value)
    applyResult(res)
    if (res.ok) {
      const next = new Set(expanded.value)
      next.delete(node.relativePath)
      expanded.value = next
      if (activePath.value === node.relativePath || activePath.value.startsWith(`${node.relativePath}/`)) {
        activePath.value = res.snapshot.focusDir || ''
      }
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

function generateProfile() {
  if (!window.ftcs?.generateProfile || !canGenerate.value) return

  error.value = ''
  message.value = ''
  const expand = expandGenerateSelection(tree.value, selectedIds.value)
  if (truncated.value && selectedFolderCount.value > 0) {
    error.value = '资料超过显示上限，请把目录拆得更浅后再勾选文件夹生成。'
    return
  }
  if (expand.empty) {
    error.value = '没有可生成的资料'
    return
  }

  if (expand.needsConfirm) {
    pendingGenerate = {
      websitePaths: [...expand.websitePaths],
      filePaths: [...expand.filePaths],
    }
    confirmGenerateMessage.value = expand.confirmMessage
    confirmGenerate.value = true
    return
  }

  void runGenerate(expand.websitePaths, expand.filePaths)
}

function cancelGenerateConfirm() {
  confirmGenerate.value = false
  pendingGenerate = null
}

function confirmGenerateMerge() {
  const pending = pendingGenerate
  confirmGenerate.value = false
  pendingGenerate = null
  if (!pending) return
  void runGenerate(pending.websitePaths, pending.filePaths)
}

async function runGenerate(websitePaths: string[], fileList: string[]) {
  if (!window.ftcs?.generateProfile) return

  const preflightError = await ensureAgentReady('extract-profile')
  if (preflightError) {
    error.value = preflightError
    return
  }

  busy.value = true
  error.value = ''
  message.value = ''
  const plainWebsites = Array.from(websitePaths, (p) => String(p))
  const plainFiles = Array.from(fileList, (p) => String(p))
  resetAgentForGenerate(plainWebsites.length + plainFiles.length)

  try {
    const res = await window.ftcs.generateProfile({
      websitePaths: plainWebsites,
      filePaths: plainFiles,
    })
    if (!res.ok) {
      error.value = res.message
      clearAgentStartFailed()
      return
    }
    message.value = res.message
    if (res.skipped?.length) {
      message.value += `（跳过：${res.skipped.join('；')}）`
    }
    await router.push({ name: 'profile' })
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
    clearAgentStartFailed()
  } finally {
    busy.value = false
  }
}

onMounted(() => {
  void refresh()
  window.addEventListener('keydown', onGlobalKeydown)
  void nextTick(() => panelRef.value?.focus())
})

onUnmounted(() => {
  window.removeEventListener('keydown', onGlobalKeydown)
})
</script>

<template>
  <section class="main-pane">
    <header class="main-pane__head">
      <div>
        <h1>{{ meta.title }}</h1>
        <p>{{ meta.subtitle }}</p>
      </div>
      <div class="main-pane__actions">
        <span class="library-count" :title="selectedCountTitle">
          已选 {{ selectedCount }} 项
        </span>
        <button
          type="button"
          class="btn-primary"
          :disabled="!canGenerate"
          :title="generateButtonTitle"
          @click="generateProfile"
        >
          <Icon name="sparkles" :size="12" />
          {{ generating ? '生成中…' : '生成画像' }}
        </button>
      </div>
    </header>

    <div ref="panelRef" class="library-panel" tabindex="0" @paste="onPaste">
      <div class="library-head">
        <div class="field-label" style="margin: 0">资料库</div>
      </div>

      <p v-if="truncated" class="library-trunc muted">
        资料超过显示上限，仅展示部分节点。请把目录拆得更浅后再打开。
      </p>

      <div v-if="creatingFolder" class="mkdir-row">
        <input
          ref="folderInputRef"
          v-model="newFolderName"
          class="text-input"
          type="text"
          placeholder="新目录名称（将建在当前焦点目录下）"
          :disabled="busy"
          @keydown.enter.prevent="confirmCreateFolder"
          @keydown.esc.prevent="cancelCreateFolder"
        />
        <button
          type="button"
          class="btn-primary btn-sm"
          :disabled="busy"
          @click="confirmCreateFolder"
        >
          创建
        </button>
        <button
          type="button"
          class="btn-secondary btn-sm"
          :disabled="busy"
          @click="cancelCreateFolder"
        >
          取消
        </button>
      </div>

      <div v-if="savingWebsite" class="mkdir-row">
        <input
          ref="websiteInputRef"
          v-model="websiteUrl"
          class="text-input"
          type="url"
          placeholder="https://www.example.com（将保存到当前焦点目录）"
          :disabled="busy"
          @keydown.enter.prevent="confirmSaveWebsite"
          @keydown.esc.prevent="cancelSaveWebsite"
        />
        <button
          type="button"
          class="btn-primary btn-sm"
          :disabled="busy || !websiteUrl.trim()"
          @click="confirmSaveWebsite"
        >
          保存
        </button>
        <button
          type="button"
          class="btn-secondary btn-sm"
          :disabled="busy"
          @click="cancelSaveWebsite"
        >
          取消
        </button>
      </div>

      <div
        class="library-tree-wrap"
        :class="{ 'is-drag': dragOver && dropImportDir === '' }"
        @dragenter="onWrapDragEnter"
        @dragover="onWrapDragOver"
        @dragleave="onWrapDragLeave"
        @drop.prevent="onDrop"
        @scroll="closeCtxMenu"
        @contextmenu.prevent="onBlankContext"
      >
        <LibraryTree
          v-if="!isEmpty"
          :nodes="tree"
          :expanded="expanded"
          :focus-dir="focusDir"
          :active-path="activePath"
          :selected-ids="selectedIds"
          :busy="busy || generating"
          :drop-import-dir="dropImportDir"
          :renaming-path="renamingPath"
          @select-root="onSelectRoot"
          @activate-dir="onActivateDir"
          @activate-file="onActivateFile"
          @open-website="openWebsite"
          @select-gesture="onSelectGesture"
          @focus-node="onFocusNode"
          @context-blank="onBlankContext"
          @context-root="onRootContext"
          @context-node="onNodeContext"
          @drag-over-import="onDragOverImport"
          @drop-import="onDropImport"
          @drop-move="moveEntry"
          @rename-commit="commitRename"
          @rename-cancel="cancelRename"
        />
        <div v-else class="library-empty muted">
          当前还没有资料。在空白处右键可新建文件夹、粘贴、上传、保存网站或导入文件夹。
        </div>
      </div>

      <LibraryContextMenu
        v-if="ctxMenu"
        :x="ctxMenu.x"
        :y="ctxMenu.y"
        :items="ctxItems"
        @pick="onCtxPick"
        @close="closeCtxMenu"
      />

      <p class="library-hint muted">
        <Icon name="info" :size="14" />
        资料保存在 data/library/。Ctrl 点选、Shift 范围选；F2 或右键可重命名；拖到另一夹移动。勾选文件夹后生成时纳入该夹下全部文件与网站。双击书签用浏览器打开。Ctrl+V 粘贴到焦点目录。生成画像时再分配产品 ID。
      </p>

      <p v-if="message" class="library-feedback ok">{{ message }}</p>
      <p v-if="error" class="library-feedback err">{{ error }}</p>
    </div>

    <ConfirmDialog
      :open="confirmGenerate"
      title="合并生成一份画像"
      :message="confirmGenerateMessage"
      confirm-label="生成"
      @confirm="confirmGenerateMerge"
      @cancel="cancelGenerateConfirm"
    />
  </section>
</template>
