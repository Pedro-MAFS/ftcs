<script setup lang="ts">
import { ref } from 'vue'

defineProps<{
  pending: {
    permission: string
    tool?: string
    command?: string
    directory?: string
  }
}>()

const submitting = ref(false)
const errorMessage = ref('')

async function choose(reply: 'once' | 'reject'): Promise<void> {
  if (submitting.value) return
  submitting.value = true
  errorMessage.value = ''
  try {
    const res = await window.ftcs?.replyPermission?.(reply)
    if (res && !res.ok && res.message) errorMessage.value = res.message
  } catch {
    errorMessage.value = '没能提交授权，请再试一次。'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <section class="perm-card" aria-label="需要你的授权">
    <h3 class="perm-card__title">需要你的授权</h3>
    <p class="perm-card__line">操作：{{ pending.permission }}</p>
    <p v-if="pending.tool" class="perm-card__line">工具：{{ pending.tool }}</p>
    <p v-if="pending.directory" class="perm-card__line">工作目录：{{ pending.directory }}</p>
    <pre v-if="pending.command" class="perm-card__line">{{ pending.command }}</pre>
    <p v-if="pending.command" class="perm-card__hint">命令及其子进程以你的用户权限运行，可能访问站点目录以外的文件和网络。</p>
    <p v-if="errorMessage" class="perm-card__alert" role="alert">{{ errorMessage }}</p>
    <div class="perm-card__actions">
      <button type="button" class="btn-secondary btn-sm" :disabled="submitting" @click="choose('reject')">
        拒绝
      </button>
      <button type="button" class="btn-primary btn-sm" :disabled="submitting" @click="choose('once')">
        同意这一次
      </button>
    </div>
    <p class="perm-card__hint">同一会话里其它还在等的授权会一起取消。</p>
  </section>
</template>
