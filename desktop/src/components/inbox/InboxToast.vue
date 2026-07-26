<script setup lang="ts">
import { ref, watch } from 'vue'
import Icon from '../shared/Icon.vue'
import { useInbox } from '../../composables/useInbox'
import type { InboxBlock } from '../../types/inbox'

const {
  visible,
  currentMessage,
  currentIndex,
  positionLabel,
  items,
  busy,
  error,
  getDraft,
  setSingleAnswer,
  toggleMultiAnswer,
  setTextAnswer,
  ackCurrent,
  dismissPanel,
  goPrev,
  goNext,
} = useInbox()

const localHint = ref('')

const canPrev = () => currentIndex.value > 0
const canNext = () => currentIndex.value < items.value.length - 1

watch(currentMessage, () => {
  localHint.value = ''
})

function optionChecked(
  messageId: string,
  block: Extract<InboxBlock, { type: 'SINGLE' | 'MULTI' }>,
  index: number,
): boolean {
  const draft = getDraft(messageId, block.id)
  return (draft.optionIndexes ?? []).includes(index)
}

/** 关闭 / 知道了：ack 已读（不强制作答） */
async function onConfirmRead(): Promise<void> {
  localHint.value = ''
  const res = await ackCurrent()
  if (res.message && res.message !== '已确认' && res.message !== '已关闭') {
    localHint.value = res.message
  }
}

function formatTime(raw: string): string {
  if (!raw) return ''
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return raw
  return d.toLocaleString()
}
</script>

<template>
  <div
    v-if="visible && currentMessage"
    class="inbox-toast"
    role="dialog"
    aria-label="站内信"
  >
    <header class="inbox-toast__head">
      <div class="inbox-toast__title-row">
        <Icon name="mail" :size="14" />
        <strong>站内信</strong>
        <span v-if="items.length > 1" class="inbox-toast__pos mono">{{ positionLabel }}</span>
      </div>
      <div class="inbox-toast__nav">
        <button
          type="button"
          class="inbox-toast__icon-btn"
          :disabled="!canPrev()"
          title="上一封"
          @click="goPrev"
        >
          <Icon name="chevron-left" :size="14" />
        </button>
        <button
          type="button"
          class="inbox-toast__icon-btn"
          :disabled="!canNext()"
          title="下一封"
          @click="goNext"
        >
          <Icon name="chevron-right" :size="14" />
        </button>
        <button
          type="button"
          class="inbox-toast__icon-btn"
          title="关闭（已读）"
          :disabled="busy"
          @click="onConfirmRead"
        >
          <Icon name="x" :size="14" />
        </button>
      </div>
    </header>

    <div class="inbox-toast__meta muted">
      <span v-if="currentMessage.createTime">{{ formatTime(currentMessage.createTime) }}</span>
      <span v-if="currentMessage.expireAt">
        · 有效至 {{ formatTime(currentMessage.expireAt) }}
      </span>
    </div>

    <div class="inbox-toast__body">
      <template
        v-for="(block, bi) in currentMessage.blocks"
        :key="`${currentMessage.messageId}-${bi}`"
      >
        <p v-if="block.type === 'TEXT'" class="inbox-toast__text">{{ block.body }}</p>

        <fieldset v-else-if="block.type === 'SINGLE'" class="inbox-toast__field">
          <legend>{{ block.title }}</legend>
          <label
            v-for="(opt, oi) in block.options"
            :key="oi"
            class="inbox-toast__option"
          >
            <input
              type="radio"
              :name="`${currentMessage.messageId}-${block.id}`"
              :checked="optionChecked(currentMessage.messageId, block, oi)"
              @change="setSingleAnswer(currentMessage.messageId, block.id, oi)"
            />
            <span>{{ opt }}</span>
          </label>
        </fieldset>

        <fieldset v-else-if="block.type === 'MULTI'" class="inbox-toast__field">
          <legend>{{ block.title }}</legend>
          <label
            v-for="(opt, oi) in block.options"
            :key="oi"
            class="inbox-toast__option"
          >
            <input
              type="checkbox"
              :checked="optionChecked(currentMessage.messageId, block, oi)"
              @change="toggleMultiAnswer(currentMessage.messageId, block.id, oi)"
            />
            <span>{{ opt }}</span>
          </label>
        </fieldset>

        <label
          v-else-if="block.type === 'TEXT_REPLY'"
          class="inbox-toast__field inbox-toast__field--text"
        >
          <span class="inbox-toast__q-title">{{ block.title }}</span>
          <textarea
            rows="3"
            :maxlength="block.maxLength ?? undefined"
            :value="getDraft(currentMessage.messageId, block.id).text ?? ''"
            @input="
              setTextAnswer(
                currentMessage.messageId,
                block.id,
                ($event.target as HTMLTextAreaElement).value,
              )
            "
          />
          <span v-if="block.maxLength" class="inbox-toast__limit muted">
            最多 {{ block.maxLength }} 字
          </span>
        </label>
      </template>
    </div>

    <p v-if="localHint || error" class="inbox-toast__hint">{{ localHint || error }}</p>

    <footer class="inbox-toast__foot">
      <button type="button" class="btn-secondary btn-sm" :disabled="busy" @click="dismissPanel">
        稍后
      </button>
      <button type="button" class="btn-primary btn-sm" :disabled="busy" @click="onConfirmRead">
        知道了
      </button>
    </footer>
  </div>
</template>

<style scoped>
.inbox-toast {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 80;
  width: min(400px, calc(100vw - 32px));
  max-height: min(70vh, 560px);
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-elevated);
  box-shadow: 0 12px 40px rgb(0 0 0 / 45%);
  color: var(--text, #e4e4e4);
  animation: inbox-in 0.22s ease-out;
}

@keyframes inbox-in {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.inbox-toast__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.inbox-toast__title-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.inbox-toast__pos {
  font-size: 12px;
  color: var(--muted, #9ca3af);
  margin-left: 4px;
}

.inbox-toast__nav {
  display: flex;
  align-items: center;
  gap: 2px;
}

.inbox-toast__icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.inbox-toast__icon-btn:hover:not(:disabled) {
  background: var(--bg-hover, #2a2a2a);
}

.inbox-toast__icon-btn:disabled {
  opacity: 0.35;
  cursor: default;
}

.inbox-toast__meta {
  font-size: 12px;
}

.inbox-toast__body {
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  flex: 1;
  padding-right: 2px;
}

.inbox-toast__text {
  margin: 0;
  white-space: pre-wrap;
  line-height: 1.5;
  font-size: 13px;
}

.inbox-toast__field {
  margin: 0;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.inbox-toast__field legend,
.inbox-toast__q-title {
  font-size: 13px;
  font-weight: 600;
  padding: 0 4px;
}

.inbox-toast__option {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 13px;
  cursor: pointer;
}

.inbox-toast__field--text textarea {
  width: 100%;
  resize: vertical;
  min-height: 64px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-input, #141414);
  color: inherit;
  padding: 8px;
  font: inherit;
}

.inbox-toast__limit {
  font-size: 11px;
}

.inbox-toast__hint {
  margin: 0;
  font-size: 12px;
  color: var(--danger, #f87171);
}

.inbox-toast__foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 4px;
  border-top: 1px solid var(--border-subtle, var(--border));
}

.muted {
  color: var(--muted, #9ca3af);
}
</style>
