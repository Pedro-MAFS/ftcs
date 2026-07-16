<script setup lang="ts">
import Icon from '../shared/Icon.vue'
import { useWorkspace } from '../../composables/useWorkspace'

const { agentSkill, agentMeta, agentLogs, agentPrompt } = useWorkspace()

function tagClass(tag: string): string {
  if (tag === '写入') return 'tag-success'
  if (tag === '跳过') return 'tag-warn'
  return 'tag-accent'
}

function onSend(): void {
  // 功能占位：后续接入 OpenCode session prompt
}
</script>

<template>
  <aside class="agent-panel" aria-label="Agent">
    <div class="agent-panel__head">
      <div class="agent-panel__title">
        <i class="agent-panel__pulse" />
        <span>Agent</span>
      </div>
      <span class="agent-panel__skill">{{ agentSkill }}</span>
    </div>

    <div class="agent-panel__meta">
      <div v-for="item in agentMeta" :key="item.label" class="meta-card">
        <span class="meta-card__label">{{ item.label }}</span>
        <span class="meta-card__value" :class="item.tone ? `tone-${item.tone}` : undefined">
          {{ item.value }}
        </span>
      </div>
    </div>

    <div class="agent-panel__logs">
      <div v-for="(line, idx) in agentLogs" :key="`${line.time}-${idx}`" class="log-line">
        <div class="log-line__top">
          <span class="log-line__time">{{ line.time }}</span>
          <span class="log-line__tag" :class="tagClass(line.tag)">{{ line.tag }}</span>
        </div>
        <p class="log-line__msg">{{ line.message }}</p>
      </div>
      <p v-if="!agentLogs.length" class="agent-panel__empty">暂无 Agent 日志</p>
    </div>

    <div class="agent-panel__composer">
      <textarea
        v-model="agentPrompt"
        class="composer-input"
        rows="3"
        placeholder="向 Agent 发送指令…"
      />
      <div class="composer-actions">
        <span class="composer-skill">Skill · {{ agentSkill }}</span>
        <button type="button" class="btn-primary btn-sm" @click="onSend">
          <Icon name="send" :size="12" />
          发送
        </button>
      </div>
    </div>
  </aside>
</template>
