<script setup lang="ts">
import { computed, ref } from 'vue'
import type { AwaitingReplyQuestion } from '../../types/electron'

const props = defineProps<{
  pending: {
    questions: AwaitingReplyQuestion[]
    renderable: boolean
  }
}>()

const SUBMIT_FAILED = '没能提交，请再试一次，或结束任务。'

const selected = ref<string[][]>(props.pending.questions.map(() => []))
const customTexts = ref<string[]>(props.pending.questions.map(() => ''))
const submitting = ref(false)
const errorMessage = ref('')

const canSubmit = computed(() => {
  if (!props.pending.renderable || submitting.value) return false
  return props.pending.questions.every((question, index) =>
    answerReady(question, selected.value[index] ?? [], customTexts.value[index] ?? ''),
  )
})

function answerReady(
  question: AwaitingReplyQuestion,
  labels: string[],
  customText: string,
): boolean {
  const text = customText.trim()
  if (!question.multiple && question.custom && text) return true
  const known = labels.filter((label) =>
    question.options.some((option) => option.label === label),
  )
  if (question.multiple) return known.length > 0 || (question.custom && text.length > 0)
  return known.length === 1
}

function isChecked(index: number, label: string): boolean {
  return (selected.value[index] ?? []).includes(label)
}

function onPick(index: number, label: string, multiple: boolean): void {
  const current = selected.value[index] ?? []
  if (!multiple) {
    selected.value[index] = [label]
    return
  }
  selected.value[index] = current.includes(label)
    ? current.filter((item) => item !== label)
    : [...current, label]
}

async function onSubmit(): Promise<void> {
  if (!canSubmit.value || submitting.value) return
  submitting.value = true
  try {
    const res = await window.ftcs?.replyQuestion?.({
      selections: props.pending.questions.map((_, index) => ({
        optionLabels: selected.value[index] ?? [],
        customText: customTexts.value[index] ?? '',
      })),
    })
    if (res && !res.ok && res.message) errorMessage.value = res.message
    else if (res?.ok) errorMessage.value = ''
  } catch {
    errorMessage.value = SUBMIT_FAILED
  } finally {
    submitting.value = false
  }
}

async function onEnd(): Promise<void> {
  if (submitting.value) return
  submitting.value = true
  try {
    await window.ftcs?.abortProfile?.()
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <section class="await-reply" aria-label="需要你的回复">
    <template v-if="pending.renderable">
      <div class="await-reply__list">
        <article
          v-for="(question, index) in pending.questions"
          :key="`${question.header}-${index}`"
          class="await-reply__item"
        >
          <h3 class="await-reply__header">{{ question.header }}</h3>
          <p class="await-reply__question">{{ question.question }}</p>
          <div class="await-reply__options">
            <label
              v-for="(option, optionIndex) in question.options"
              :key="`${option.label}-${optionIndex}`"
              class="await-reply__option"
            >
              <input
                :type="question.multiple ? 'checkbox' : 'radio'"
                :name="`await-reply-${index}`"
                :checked="isChecked(index, option.label)"
                :disabled="submitting"
                @change="onPick(index, option.label, question.multiple)"
              />
              <span class="await-reply__option-copy">
                <span class="await-reply__label">{{ option.label }}</span>
                <span v-if="option.description" class="await-reply__desc">{{ option.description }}</span>
              </span>
            </label>
          </div>
          <textarea
            v-if="question.custom"
            v-model="customTexts[index]"
            class="await-reply__custom"
            rows="2"
            placeholder="其他，请填写"
            :disabled="submitting"
          />
        </article>
      </div>
      <p v-if="errorMessage" class="await-reply__alert" role="alert">{{ errorMessage }}</p>
      <div class="await-reply__actions">
        <button type="button" class="btn-secondary btn-sm" :disabled="submitting" @click="onEnd">
          结束任务
        </button>
        <button type="button" class="btn-primary btn-sm" :disabled="!canSubmit" @click="onSubmit">
          提交
        </button>
      </div>
    </template>
    <template v-else>
      <p class="await-reply__fallback">这项操作需要你处理，当前无法代为回答。</p>
      <div class="await-reply__actions">
        <button type="button" class="btn-secondary btn-sm" :disabled="submitting" @click="onEnd">
          结束任务
        </button>
      </div>
    </template>
  </section>
</template>
