<script setup lang="ts">
import { ref } from 'vue'

const props = withDefaults(
  defineProps<{
    text: string
    title?: string
  }>(),
  { title: '诊断信息' },
)

const copied = ref(false)

async function copy(): Promise<void> {
  const value = props.text
  if (!value) return
  let ok = false
  try {
    await navigator.clipboard.writeText(value)
    ok = true
  } catch {
    try {
      const area = document.createElement('textarea')
      area.value = value
      area.setAttribute('readonly', 'true')
      area.style.position = 'fixed'
      area.style.left = '-9999px'
      document.body.appendChild(area)
      area.select()
      ok = document.execCommand('copy')
      area.remove()
    } catch {
      ok = false
    }
  }
  copied.value = ok
  if (ok) {
    window.setTimeout(() => {
      copied.value = false
    }, 1500)
  }
}
</script>

<template>
  <details v-if="text.trim()" class="diag-details">
    <summary>{{ title }}</summary>
    <pre class="diag-details__body">{{ text }}</pre>
    <button type="button" class="btn-secondary btn-sm" @click="copy">
      {{ copied ? '已复制' : '复制' }}
    </button>
  </details>
</template>
