<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import type { MessageView } from '../../../electron/mailbox/types'
const props = defineProps<{ html: NonNullable<MessageView['html']>; subject: string }>()
const allowExternal = ref(false)
const frame = ref<HTMLIFrameElement>()
const height = ref(100)
let observer: ResizeObserver | undefined
const documentSource = computed(() => {
  const images = allowExternal.value ? 'data: https: http:' : 'data:'
  const policy =
    "default-src 'none'; script-src 'none'; base-uri 'none'; form-action 'none'; style-src 'unsafe-inline'; img-src " +
    images
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="referrer" content="no-referrer"><style>
    :root{color-scheme:light;background:white;color:#202124;font:14px/1.5 system-ui,sans-serif;overflow-wrap:anywhere}
    body{margin:0;padding:10px;display:flow-root}img,table{max-width:100%}img{height:auto}a[role=link]{color:#2458a8;text-decoration:underline;cursor:pointer}
  </style></head><body>${props.html.fragment}</body></html>`
})
function ready() {
  observer?.disconnect()
  const doc = frame.value?.contentDocument
  if (!doc?.body) return
  function openLink(event: Event) {
    if (event.type === 'keydown' && (event as KeyboardEvent).key !== 'Enter') return
    const link = (event.target as HTMLElement)?.closest?.('a[data-mail-link]')?.getAttribute('data-mail-link')
    if (link && /^https?:\/\//i.test(link)) {
      event.preventDefault()
      void window.ftcs?.openExternal(link)
    }
  }
  doc.addEventListener('click', openLink)
  doc.addEventListener('keydown', openLink)
  function measure() {
    height.value = Math.max(32, Math.min(620, Math.ceil(doc!.body.getBoundingClientRect().height)))
  }
  observer = new ResizeObserver(measure)
  observer.observe(doc.body)
  measure()
}
onBeforeUnmount(() => observer?.disconnect())
</script>
<template>
  <div class="html-body">
    <button v-if="html.remoteImages && !allowExternal" type="button" @click="allowExternal = true">
      加载此邮件的外部图片
    </button>
    <iframe
      ref="frame"
      :title="subject + ' · HTML 正文'"
      credentialless
      sandbox="allow-same-origin"
      referrerpolicy="no-referrer"
      :srcdoc="documentSource"
      :style="{ height: height + 'px' }"
      @load="ready"
    />
  </div>
</template>
<style scoped>
.html-body {
  margin-top: 9px;
}
iframe {
  display: block;
  width: 100%;
  background: #fff;
  border: 0;
  border-radius: 6px;
}
button {
  margin: 0 0 7px;
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--bg-panel);
  color: var(--text);
  font: inherit;
  cursor: pointer;
}
</style>
