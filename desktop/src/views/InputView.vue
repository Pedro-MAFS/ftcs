<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { SECTION_META } from '../types/workspace'
import type { FileEntry, LibrarySnapshot, WebsiteItem } from '../types/library'
import Icon from '../components/shared/Icon.vue'

const meta = SECTION_META.input
const websiteUrl = ref('')
const websites = ref<WebsiteItem[]>([])
const cwd = ref('')
const entries = ref<FileEntry[]>([])
const filesRootLabel = ref('data/library/files')
const selectedIds = ref<Set<string>>(new Set())
const busy = ref(false)
const message = ref('')
const error = ref('')
const dragOver = ref(false)
const creatingFolder = ref(false)
const newFolderName = ref('')
const folderInputRef = ref<HTMLInputElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)

const selectedCount = computed(() => selectedIds.value.size)
const crumbs = computed(() => {
  if (!cwd.value) return [] as Array<{ label: string; path: string }>
  const parts = cwd.value.split('/').filter(Boolean)
  const out: Array<{ label: string; path: string }> = []
  let acc = ''
  for (const part of parts) {
    acc = acc ? `${acc}/${part}` : part
    out.push({ label: part, path: acc })
  }
  return out
})

function applySnapshot(snap: LibrarySnapshot) {
  websites.value = snap.websites
  cwd.value = snap.cwd
  entries.value = snap.entries
  filesRootLabel.value = snap.filesRootLabel
  const valid = new Set(snap.entries.map((e) => e.relativePath))
  selectedIds.value = new Set([...selectedIds.value].filter((id) => valid.has(id)))
}

function applyResult(res: { ok: boolean; message: string; snapshot: LibrarySnapshot }) {
  applySnapshot(res.snapshot)
  if (res.ok) {
    if (res.message) message.value = res.message
  } else {
    error.value = res.message
  }
}

async function refresh(nextCwd = cwd.value) {
  if (!window.ftcs?.listLibrary) {
    error.value = '桌面 API 不可用'
    return
  }
  error.value = ''
  const snap = await window.ftcs.listLibrary(nextCwd)
  applySnapshot(snap)
}

function toggleSelect(id: string) {
  const next = new Set(selectedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedIds.value = next
}

function formatSize(n?: number): string {
  if (n == null) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

async function addWebsite() {
  if (!window.ftcs?.addWebsite || busy.value) return
  busy.value = true
  error.value = ''
  message.value = ''
  try {
    const res = await window.ftcs.addWebsite(websiteUrl.value, cwd.value)
    applyResult(res)
    if (res.ok) websiteUrl.value = ''
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
    applyResult(await window.ftcs.deleteWebsite(item.relativePath, cwd.value))
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

async function openDir(rel: string) {
  busy.value = true
  error.value = ''
  try {
    await refresh(rel)
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

async function goUp() {
  if (!cwd.value) return
  const parts = cwd.value.split('/').filter(Boolean)
  parts.pop()
  await openDir(parts.join('/'))
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
  try {
    applyResult(await window.ftcs.createLibraryFolder(name, cwd.value))
    creatingFolder.value = false
    newFolderName.value = ''
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
    const res = await window.ftcs.uploadLibraryFiles(cwd.value)
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
    const res = await window.ftcs.importLibraryPaths(paths, cwd.value)
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
    const res = await window.ftcs.pasteClipboardFiles(cwd.value)
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

function collectFilePaths(fileList: FileList | File[] | null | undefined): string[] {
  if (!fileList || !window.ftcs?.getPathForFile) return []
  const files = Array.from(fileList)
  return files.map((f) => window.ftcs!.getPathForFile(f)).filter(Boolean)
}

async function onPaste(e: ClipboardEvent) {
  const target = e.target as HTMLElement | null
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
    // 在输入框内允许普通文本粘贴；若剪贴板是文件则仍走文件粘贴
    const hasOsFiles = (e.clipboardData?.files?.length ?? 0) > 0
    if (!hasOsFiles) return
  }

  const fromEvent = collectFilePaths(e.clipboardData?.files)
  if (fromEvent.length) {
    e.preventDefault()
    await importPaths(fromEvent)
    return
  }

  // 资源管理器复制的文件：网页 paste 通常拿不到 File，改走主进程读系统剪贴板
  e.preventDefault()
  await pasteFromClipboard()
}

function onGlobalKeydown(e: KeyboardEvent) {
  const key = e.key.toLowerCase()
  const withMod = e.ctrlKey || e.metaKey
  if (!withMod || key !== 'v') return

  const target = e.target as HTMLElement | null
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return

  // 拦截默认粘贴，走文件导入
  e.preventDefault()
  void pasteFromClipboard()
}

async function onDrop(e: DragEvent) {
  dragOver.value = false
  const paths = collectFilePaths(e.dataTransfer?.files)
  if (!paths.length) {
    error.value = '拖入的内容无法识别为本地文件'
    return
  }
  e.preventDefault()
  await importPaths(paths)
}

async function removeEntry(entry: FileEntry) {
  if (!window.ftcs?.deleteLibraryEntry || busy.value) return
  const tip =
    entry.kind === 'dir'
      ? `删除目录「${entry.name}」及其全部内容？`
      : `删除文件「${entry.name}」？`
  if (!window.confirm(tip)) return
  busy.value = true
  error.value = ''
  message.value = ''
  try {
    applyResult(await window.ftcs.deleteLibraryEntry(entry.relativePath, cwd.value))
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

function onEntryActivate(entry: FileEntry) {
  if (entry.kind === 'dir') void openDir(entry.relativePath)
  else toggleSelect(entry.relativePath)
}

onMounted(() => {
  void refresh('')
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
        <button type="button" class="btn-secondary" :disabled="busy" @click="startCreateFolder">
          <Icon name="folder-plus" :size="12" />
          新建目录
        </button>
        <button type="button" class="btn-secondary" :disabled="busy" @click="pasteFromClipboard">
          粘贴文件
        </button>
        <button type="button" class="btn-secondary" :disabled="busy" @click="uploadFiles">
          上传文件
        </button>
        <button type="button" class="btn-primary" disabled title="下一步实现">
          <Icon name="sparkles" :size="12" />
          生成画像
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
          :disabled="busy"
          @keydown.enter.prevent="addWebsite"
        />
        <button
          type="button"
          class="btn-accent-ghost"
          :disabled="busy || !websiteUrl.trim()"
          @click="addWebsite"
        >
          <Icon name="plus" :size="14" />
          保存网站
        </button>
      </div>

      <ul v-if="websites.length" class="website-chips">
        <li v-for="site in websites" :key="site.id" class="website-chip">
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
            :disabled="busy"
            @click="removeWebsite(site)"
          >
            <Icon name="trash" :size="12" />
          </button>
        </li>
      </ul>

      <div class="library-head">
        <div>
          <div class="field-label" style="margin: 0">文件管理器</div>
          <div class="library-crumbs mono muted">
            <button type="button" class="crumb" :disabled="!cwd || busy" @click="openDir('')">
              files
            </button>
            <template v-for="c in crumbs" :key="c.path">
              <span>/</span>
              <button type="button" class="crumb" :disabled="busy" @click="openDir(c.path)">
                {{ c.label }}
              </button>
            </template>
          </div>
        </div>
        <span class="library-count">{{ entries.length }} 项 · 已选 {{ selectedCount }}</span>
      </div>

      <div class="library-toolbar">
        <button type="button" class="btn-secondary btn-sm" :disabled="!cwd || busy" @click="goUp">
          <Icon name="chevron-left" :size="12" />
          上级
        </button>
        <span class="mono muted library-path">{{ filesRootLabel }}</span>
        <span class="muted library-tip">Ctrl+V 粘贴 / 拖入文件</span>
      </div>

      <div v-if="creatingFolder" class="mkdir-row">
        <input
          ref="folderInputRef"
          v-model="newFolderName"
          class="text-input"
          type="text"
          placeholder="新目录名称"
          :disabled="busy"
          @keydown.enter.prevent="confirmCreateFolder"
          @keydown.esc.prevent="cancelCreateFolder"
        />
        <button type="button" class="btn-primary btn-sm" :disabled="busy" @click="confirmCreateFolder">
          创建
        </button>
        <button type="button" class="btn-secondary btn-sm" :disabled="busy" @click="cancelCreateFolder">
          取消
        </button>
      </div>

      <ul
        v-if="entries.length"
        class="library-list"
        :class="{ 'is-drag': dragOver }"
        @dragover.prevent="dragOver = true"
        @dragleave="dragOver = false"
        @drop.prevent="onDrop"
      >
        <li
          v-for="entry in entries"
          :key="entry.relativePath"
          class="library-row"
          :class="{ selected: selectedIds.has(entry.relativePath) }"
          @dblclick="onEntryActivate(entry)"
        >
          <button
            type="button"
            class="library-check"
            :class="{ on: selectedIds.has(entry.relativePath) }"
            :aria-pressed="selectedIds.has(entry.relativePath)"
            @click="toggleSelect(entry.relativePath)"
          >
            <Icon v-if="selectedIds.has(entry.relativePath)" name="check" :size="10" />
          </button>
          <button type="button" class="library-open" @click="onEntryActivate(entry)">
            <Icon
              :name="entry.kind === 'dir' ? 'folder' : 'file-text'"
              :size="14"
              class="library-type-icon"
            />
            <div class="library-meta">
              <div class="library-title">{{ entry.name }}</div>
              <div class="muted">
                {{ entry.kind === 'dir' ? '文件夹' : formatSize(entry.sizeBytes) }}
              </div>
            </div>
          </button>
          <button
            type="button"
            class="icon-btn library-delete"
            title="删除"
            :disabled="busy"
            @click="removeEntry(entry)"
          >
            <Icon name="trash" :size="13" />
          </button>
        </li>
      </ul>
      <div
        v-else
        class="library-empty muted"
        :class="{ 'is-drag': dragOver }"
        @dragover.prevent="dragOver = true"
        @dragleave="dragOver = false"
        @drop.prevent="onDrop"
      >
        当前目录为空。可「上传文件」、Ctrl+V /「粘贴文件」，或「新建目录」。
      </div>

      <p class="library-hint muted">
        <Icon name="info" :size="14" />
        网站保存在 data/library/websites/；文件在 data/library/files/。在资源管理器复制文件后，于本页按 Ctrl+V 或点「粘贴文件」。
      </p>

      <p v-if="message" class="library-feedback ok">{{ message }}</p>
      <p v-if="error" class="library-feedback err">{{ error }}</p>
    </div>
  </section>
</template>
