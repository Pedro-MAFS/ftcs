<script setup lang="ts">
import { useToast } from '../../composables/useToast'

const { toasts, dismissToast } = useToast()
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
