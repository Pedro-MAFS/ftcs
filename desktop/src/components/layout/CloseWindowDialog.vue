<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import type { CloseChoice } from '../../../shared/background-preferences'

const dialog = ref<HTMLDialogElement>()
const remember = ref(false)
let requestId: number | null = null
let unsubscribe: (() => void) | undefined

onMounted(() => {
  if (window.ftcs?.platform !== 'win32') return
  unsubscribe = window.ftcs.onClosePrompt(id => {
    if (id === requestId) return
    requestId = id
    remember.value = false
    if (id === null) dialog.value?.close()
    else if (!dialog.value?.open) dialog.value?.showModal()
  })
})
onUnmounted(() => unsubscribe?.())

function answer(action: CloseChoice['action']) {
  if (requestId !== null) window.ftcs.answerClosePrompt(requestId, action, action !== 'cancel' && remember.value)
}
</script>

<template>
  <dialog ref="dialog" class="close-window-dialog confirm-dialog__panel"
    aria-labelledby="close-window-title" aria-describedby="close-window-description"
    @cancel.prevent="answer('cancel')" @keydown.esc.stop.prevent="answer('cancel')">
    <h3 id="close-window-title" class="confirm-dialog__title">关闭 FTCS 后，是否继续在后台运行？</h3>
    <button type="button" class="close-window-dialog__dismiss" aria-label="关闭弹框" @click="answer('cancel')">×</button>
    <p id="close-window-description" class="confirm-dialog__message">后台运行时，邮箱会继续同步，定时任务会按计划执行。</p>
    <label class="close-window-dialog__remember">
      <input v-model="remember" type="checkbox">记住我的选择
    </label>
    <div class="confirm-dialog__actions">
      <button type="button" class="btn-secondary" @click="answer('cancel')">取消</button>
      <button type="button" class="btn-secondary" @click="answer('quit')">退出 FTCS</button>
      <button type="button" class="btn-primary" autofocus @click="answer('background')">后台运行</button>
    </div>
  </dialog>
</template>

<style scoped>
.close-window-dialog { position: fixed; margin: auto; color: var(--text); -webkit-app-region: no-drag; }
.close-window-dialog::backdrop { background: rgb(0 0 0 / 55%); }
.confirm-dialog__title { padding-right: 28px; }
.close-window-dialog__dismiss { position: absolute; top: 9px; right: 9px; padding: 2px 8px; font-size: 18px; color: var(--text-secondary); }
.close-window-dialog__dismiss:hover { background: var(--bg-hover); }
.close-window-dialog__remember { display: inline-flex; align-items: center; gap: 7px; margin-top: 16px; font-size: 12px; cursor: pointer; }
.close-window-dialog__remember input { margin: 0; accent-color: var(--accent); }
</style>
