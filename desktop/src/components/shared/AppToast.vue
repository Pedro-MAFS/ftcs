<script setup lang="ts">
import { ref } from 'vue'
import { useToast } from '../../composables/useToast'
import DiagnosticDetails from './DiagnosticDetails.vue'

const { toasts, dismissToast } = useToast()
const openDiag = ref<number | null>(null)
</script>

<template>
  <Teleport to="body">
    <div class="app-toast-stack" aria-live="polite" aria-relevant="additions">
      <div
        v-for="item in toasts"
        :key="item.id"
        class="app-toast"
        :class="`is-${item.tone}`"
        role="status"
      >
        <p class="app-toast__text">{{ item.message }}</p>
        <DiagnosticDetails
          v-if="item.diagnostic && openDiag === item.id"
          :text="item.diagnostic"
        />
        <button
          v-if="item.diagnostic"
          type="button"
          class="btn-secondary btn-sm"
          @click="openDiag = openDiag === item.id ? null : item.id"
        >
          诊断信息
        </button>
        <button
          type="button"
          class="app-toast__close"
          aria-label="关闭"
          @click="dismissToast(item.id)"
        >
          ×
        </button>
      </div>
    </div>
  </Teleport>
</template>
