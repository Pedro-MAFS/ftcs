<script setup lang="ts">
import { computed, ref } from 'vue'
import { seoCopy } from '../config/site'
import {
  filterSupportPlanItems,
  groupSupportPlanByStatus,
  supportPlanItems,
  supportPlanPriorityLabels,
  supportPlanStatusLabels,
  type SupportPlanPriority,
  type SupportPlanStatus,
} from '../config/support-plan'
import { usePageSeo } from '../composables/usePageSeo'

usePageSeo({
  title: seoCopy.supportPlan.title,
  description: seoCopy.supportPlan.description,
  path: seoCopy.supportPlan.path,
})

const priority = ref<SupportPlanPriority | 'all'>('all')
const status = ref<SupportPlanStatus | 'all'>('all')
const keyword = ref('')

const filtered = computed(() =>
  filterSupportPlanItems(supportPlanItems, {
    priority: priority.value,
    status: status.value,
    keyword: keyword.value,
  }),
)

const grouped = computed(() => groupSupportPlanByStatus(filtered.value))

const hasActiveFilter = computed(
  () => priority.value !== 'all' || status.value !== 'all' || keyword.value.trim().length > 0,
)

const resultHint = computed(() => {
  const total = supportPlanItems.length
  const count = filtered.value.length
  if (!hasActiveFilter.value) {
    return `共 ${total} 项已纳入计划。`
  }
  if (count === 0) {
    return '没有符合当前筛选条件的条目，请调整筛选或清空关键字。'
  }
  return `筛选结果：${count} / ${total} 项。`
})

function resetFilters(): void {
  priority.value = 'all'
  status.value = 'all'
  keyword.value = ''
}
</script>

<template>
  <div>
    <header class="page-head">
      <div class="container">
        <h1>支持计划</h1>
        <p>
          根据用户反馈整理的支持方向，按优先级持续更新。
        </p>
      </div>
    </header>

    <div class="container support-plan">
      <div class="support-plan__filters" aria-label="筛选支持计划">
        <label class="support-plan__field">
          <span>优先级</span>
          <select v-model="priority">
            <option value="all">全部</option>
            <option value="P0">P0</option>
            <option value="P1">P1</option>
            <option value="P2">P2</option>
          </select>
        </label>
        <label class="support-plan__field">
          <span>状态</span>
          <select v-model="status">
            <option value="all">全部</option>
            <option value="developing">开发中</option>
            <option value="planned">规划中</option>
          </select>
        </label>
        <label class="support-plan__field support-plan__field--grow">
          <span>关键字</span>
          <input
            v-model.trim="keyword"
            type="search"
            placeholder="搜索标题或说明"
            autocomplete="off"
          />
        </label>
        <button
          v-if="hasActiveFilter"
          type="button"
          class="support-plan__reset"
          @click="resetFilters"
        >
          清空筛选
        </button>
      </div>

      <p class="support-plan__hint">{{ resultHint }}</p>

      <div v-if="filtered.length" class="support-plan__groups">
        <section
          v-for="group in grouped"
          :key="group.status"
          class="support-plan__group"
        >
          <header class="support-plan__group-head">
            <h2>{{ supportPlanStatusLabels[group.status] }}</h2>
            <span class="support-plan__group-count">{{ group.items.length }} 项</span>
          </header>

          <article
            v-for="item in group.items"
            :key="item.id"
            class="support-plan__item"
          >
            <div class="support-plan__item-head">
              <span
                class="support-plan__badge support-plan__badge--priority"
                :class="`support-plan__badge--${item.priority.toLowerCase()}`"
              >
                {{ item.priority }}
              </span>
              <span
                class="support-plan__badge support-plan__badge--status"
                :class="`support-plan__badge--${item.status}`"
              >
                {{ supportPlanStatusLabels[item.status] }}
              </span>
              <h3>{{ item.title }}</h3>
            </div>
            <p>{{ item.description }}</p>
            <p class="support-plan__priority-note muted">
              {{ supportPlanPriorityLabels[item.priority] }}
            </p>
          </article>
        </section>
      </div>

      <p v-else class="support-plan__empty muted">暂无匹配条目。</p>

      <p class="muted support-plan__foot">
        有新想法或问题？请通过桌面版设置中的「意见反馈」提交（需登录，便于跟进）。已交付能力见
        <RouterLink to="/changelog">发布日志</RouterLink>。
      </p>
    </div>
  </div>
</template>
