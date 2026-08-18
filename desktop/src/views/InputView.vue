<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { SECTION_META } from '../types/workspace'
import type { LibrarySnapshot, LibraryTreeNode, WebsiteItem } from '../types/library'
import { useWorkspace } from '../composables/useWorkspace'
import { ensureAgentReady } from '../composables/useAgentPreflight'
import Icon from '../components/shared/Icon.vue'
import LibraryTree from '../components/library/LibraryTree.vue'

const meta = SECTION_META.input
const router = useRouter()
const { resetAgentForGenerate, generating } = useWorkspace()

const websiteUrl = ref('')
const websites = ref<WebsiteItem[]>([])
const focusDir = ref('')
const activePath = ref('')
const tree = ref<LibraryTreeNode[]>([])
const truncated = ref(false)
const expanded = ref<Set<string>>(new Set())
const selectedIds = ref<Set<string>>(new Set())
const selectedWebsiteIds = ref<Set<string>>(new Set())
const busy = ref(false)
const message = ref('')
const error = ref('')
const dragOver = ref(false)
const creatingFolder = ref(false)
const newFolderName = ref('')
const folderInputRef = ref<HTMLInputElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)

function collectFilePaths(nodes: LibraryTreeNode[]): string[] {
  const out: string[] = []
  for (const node of nodes) {
    if (node.kind === 'file') out.push(node.relativePath)
    if (node.children.length) out.push(...collectFilePaths(node.children))
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
const selectedFileCount = computed(
  () => [...selectedIds.value].filter((id) => filePaths.value.includes(id)).length,
)
const selectedWebsiteCount = computed(() => selectedWebsiteIds.value.size)
const selectedCount = computed(() => selectedFileCount.value + selectedWebsiteCount.value)
const canGenerate = computed(
  () => selectedCount.value > 0 && !busy.value && !generating.value,
)
const isEmpty = computed(() => tree.value.length === 0)

function applySnapshot(snap: LibrarySnapshot) {
  websites.value = snap.websites
  tree.value = snap.tree ?? []
  truncated.value = Boolean(snap.truncated)
  focusDir.value = snap.focusDir ?? snap.cwd ?? ''
  const validFiles = new Set(collectFilePaths(tree.value))
  selectedIds.value = new Set([...selectedIds.value].filter((id) => validFiles.has(id)))
  const validSites = new Set(snap.websites.map((w) => w.relativePath))
  selectedWebsiteIds.value = new Set(
    [...selectedWebsiteIds.value].filter((id) => validSites.has(id)),
  )
  const all = collectAllPaths(tree.value)
  if (activePath.value && !all.has(activePath.value)) {
    activePath.value = focusDir.value
  }
}

function applyResult(res: { ok: boolean; message: string; snapshot: LibrarySnapshot }) {
  applySnapshot(res.snapshot)
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

function toggleSelect(id: string) {
  const next = new Set(selectedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedIds.value = next
}

function toggleWebsite(id: string) {
  const next = new Set(selectedWebsiteIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedWebsiteIds.value = next
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

async function addWebsite() {
  if (!window.ftcs?.addWebsite || busy.value) return
  busy.value = true
  error.value = ''
  message.value = ''
  try {
    const res = await window.ftcs.addWebsite(websiteUrl.value, focusDir.value)
    applyResult(res)
    if (res.ok) {
      websiteUrl.value = ''
      const added = res.snapshot.websites[0]
      if (added) {
        const next = new Set(selectedWebsiteIds.value)
        next.add(added.relativePath)
        selectedWebsiteIds.value = next
      }
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

async function removeWebsite(item: WebsiteItem) {
  if (!window.ftcs?.deleteWebsite || busy.value) return
  if (!window.confirm(`删除网站「${item.title}」？`)) return
  busy.value = true
  error.value = ''
  message.value = ''
  try {
    applyResult(await window.ftcs.deleteWebsite(item.relativePath, focusDir.value))
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

async function startCreateFolder() {
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

async function importPaths(paths: string[]) {
  if (!window.ftcs?.importLibraryPaths || !paths.length || busy.value) return
  busy.value = true
  error.value = ''
  message.value = ''
  try {
    const res = await window.ftcs.importLibraryPaths(paths, focusDir.value)
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
  const key = e.key.toLowerCase()
  const withMod = e.ctrlKey || e.metaKey
  if (!withMod || key !== 'v') return

  const target = e.target as HTMLElement | null
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return

  e.preventDefault()
  void pasteFromClipboard()
}

async function onDrop(e: DragEvent) {
  dragOver.value = false
  const paths = collectDroppedPaths(e.dataTransfer?.files)
  if (!paths.length) {
    error.value = '拖入的内容无法识别为本地文件'
    return
  }
  e.preventDefault()
  await importPaths(paths)
}

async function removeEntry(node: LibraryTreeNode) {
  if (!window.ftcs?.deleteLibraryEntry || busy.value) return
  const tip =
    node.kind === 'dir'
      ? `删除目录「${node.name}」及其全部内容？`
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

async function generateProfile() {
  if (!window.ftcs?.generateProfile || !canGenerate.value) return

  const websitePaths = [...selectedWebsiteIds.value]
  const validFiles = new Set(filePaths.value)
  const fileList = [...selectedIds.value].filter((id) => validFiles.has(id))
  if (!websitePaths.length && !fileList.length) {
    error.value = '请先勾选至少一个公司网站或资料文件'
    return
  }

  const preflightError = await ensureAgentReady('extract-profile')
  if (preflightError) {
    error.value = preflightError
    return
  }

  busy.value = true
  error.value = ''
  message.value = ''
  resetAgentForGenerate(websitePaths.length + fileList.length)

  try {
    const res = await window.ftcs.generateProfile({ websitePaths, filePaths: fileList })
    if (!res.ok) {
      error.value = res.message
      return
    }
    message.value = res.message
    if (res.skipped?.length) {
      message.value += `（跳过：${res.skipped.join('；')}）`
    }
    await router.push({ name: 'profile' })
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
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
        <button
          type="button"
          class="btn-secondary"
          :disabled="busy || generating"
          @click="startCreateFolder"
        >
          <Icon name="folder-plus" :size="12" />
          新建目录
        </button>
        <button
          type="button"
          class="btn-secondary"
          :disabled="busy || generating"
          @click="pasteFromClipboard"
        >
          粘贴文件
        </button>
        <button
          type="button"
          class="btn-secondary"
          :disabled="busy || generating"
          @click="uploadFiles"
        >
          上传文件
        </button>
        <button
          type="button"
          class="btn-primary"
          :disabled="!canGenerate"
          :title="selectedCount ? '基于勾选资料生成画像' : '请先勾选网站或文件'"
          @click="generateProfile"
        >
          <Icon name="sparkles" :size="12" />
          {{ generating ? '生成中…' : '生成画像' }}
        </button>
      </div>
    </header>

    <div ref="panelRef" class="library-panel" tabindex="0" @paste="onPaste">
      <label class="field-label">公司网站</label>
      <div class="input-row">
        <input
          v-model="websiteUrl"
          class="text-input"
          type="url"
          placeholder="https://www.example.com"
          :disabled="busy || generating"
          @keydown.enter.prevent="addWebsite"
        />
        <button
          type="button"
          class="btn-accent-ghost"
          :disabled="busy || generating || !websiteUrl.trim()"
          @click="addWebsite"
        >
          <Icon name="plus" :size="14" />
          保存网站
        </button>
      </div>

      <ul v-if="websites.length" class="website-chips">
        <li
          v-for="site in websites"
          :key="site.id"
          class="website-chip"
          :class="{ selected: selectedWebsiteIds.has(site.relativePath) }"
        >
          <button
            type="button"
            class="library-check"
            :class="{ on: selectedWebsiteIds.has(site.relativePath) }"
            :aria-pressed="selectedWebsiteIds.has(site.relativePath)"
            title="勾选后参与生成画像"
            @click="toggleWebsite(site.relativePath)"
          >
            <Icon v-if="selectedWebsiteIds.has(site.relativePath)" name="check" :size="10" />
          </button>
          <Icon name="globe" :size="12" />
          <div class="website-chip__meta">
            <a class="website-chip__title" :href="site.url" target="_blank" rel="noreferrer">
              {{ site.title }}
            </a>
            <span class="muted">{{ site.url }}</span>
          </div>
          <button
            type="button"
            class="icon-btn"
            title="删除网站"
            :disabled="busy || generating"
            @click="removeWebsite(site)"
          >
            <Icon name="trash" :size="12" />
          </button>
        </li>
      </ul>

      <div class="library-head">
        <div class="field-label" style="margin: 0">资料库</div>
        <span class="library-count">
          已选网站 {{ selectedWebsiteCount }} / 文件 {{ selectedFileCount }}
        </span>
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

      <div
        class="library-tree-wrap"
        :class="{ 'is-drag': dragOver }"
        @dragover.prevent="dragOver = true"
        @dragleave="dragOver = false"
        @drop.prevent="onDrop"
      >
        <LibraryTree
          v-if="!isEmpty"
          :nodes="tree"
          :expanded="expanded"
          :focus-dir="focusDir"
          :active-path="activePath"
          :selected-ids="selectedIds"
          :busy="busy || generating"
          @select-root="onSelectRoot"
          @activate-dir="onActivateDir"
          @activate-file="onActivateFile"
          @toggle-select="toggleSelect"
          @delete="removeEntry"
        />
        <div v-else class="library-empty muted">
          当前还没有资料。可用「新建目录」或「上传文件」添加。
        </div>
      </div>

      <p class="library-hint muted">
        <Icon name="info" :size="14" />
        资料保存在 data/library/；生成画像时再分配产品 ID，并复制快照到 products/{id}/inputs/。
      </p>

      <p v-if="message" class="library-feedback ok">{{ message }}</p>
      <p v-if="error" class="library-feedback err">{{ error }}</p>
    </div>
  </section>
</template>
