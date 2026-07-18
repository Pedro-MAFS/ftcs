<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { LeadRowDto, LeadScoreBreakdownDto } from '../../types/electron'
import Icon from './Icon.vue'

const props = defineProps<{
  open: boolean
  lead: LeadRowDto | null
}>()

const emit = defineEmits<{
  close: []
}>()

const showRawJson = ref(false)
const copied = ref(false)

const title = computed(() => props.lead?.companyName || '线索详情')

const phaseLabel = computed(() =>
  props.lead?.phase === 'scored' ? '已评分（scored）' : '未评分（raw）',
)

const statusLabel = computed(() => {
  const s = props.lead?.status
  if (!s) return '—'
  const map: Record<string, string> = {
    new: 'new · 新建',
    reviewed: 'reviewed · 已审阅',
    email_drafted: 'email_drafted · 已写邮件',
    email_approved: 'email_approved · 邮件已通过',
    contacted: 'contacted · 已触达',
    replied: 'replied · 已回复',
    converted: 'converted · 已转化',
    rejected: 'rejected · 已拒绝',
  }
  return map[s] || s
})

const tierFullLabel = computed(() => {
  const lead = props.lead
  if (!lead?.tier) return '—'
  const map: Record<string, string> = {
    high: 'high · A',
    medium: 'medium · B',
    low: 'low · C',
  }
  return map[lead.tier] || lead.tier
})

function formatTime(raw?: string): string {
  if (!raw) return '—'
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return raw
  return `${d.toLocaleString('zh-CN', { hour12: false })}（${raw}）`
}

const discoveredLabel = computed(() => formatTime(props.lead?.discoveredAt))

const websiteHref = computed(() => {
  const website = props.lead?.company.website || ''
  if (!website) {
    const domain = props.lead?.domain
    return domain ? `https://${domain}` : ''
  }
  return website.startsWith('http') ? website : `https://${website}`
})

const BREAKDOWN_LABELS: Array<{
  key: keyof LeadScoreBreakdownDto
  label: string
}> = [
  { key: 'product_match', label: '产品匹配 product_match' },
  { key: 'purchase_intent', label: '采购意向 purchase_intent' },
  { key: 'size_fit', label: '规模匹配 size_fit' },
  { key: 'geo_match', label: '地理匹配 geo_match' },
  { key: 'reachability', label: '可触达性 reachability' },
  { key: 'competition', label: '竞争情况 competition' },
]

const breakdownRows = computed(() => {
  const b = props.lead?.scoreBreakdown
  if (!b) return []
  return BREAKDOWN_LABELS.map((item) => ({
    ...item,
    value: b[item.key] ?? 0,
  }))
})

const recordJson = computed(() => {
  if (!props.lead?.record) return ''
  try {
    return JSON.stringify(props.lead.record, null, 2)
  } catch {
    return String(props.lead.record)
  }
})

const displayOrDash = (value: string | number | null | undefined): string => {
  if (value == null) return '—'
  if (typeof value === 'string' && !value.trim()) return '—'
  return String(value)
}

async function copyJson(): Promise<void> {
  if (!recordJson.value) return
  try {
    await navigator.clipboard.writeText(recordJson.value)
    copied.value = true
    window.setTimeout(() => {
      copied.value = false
    }, 1500)
  } catch {
    copied.value = false
  }
}

function onKeydown(event: KeyboardEvent): void {
  if (!props.open) return
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
  }
}

watch(
  () => props.open,
  (open) => {
    document.body.style.overflow = open ? 'hidden' : ''
    if (open) {
      showRawJson.value = false
      copied.value = false
    }
  },
)

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open && lead"
      class="lead-drawer"
      role="dialog"
      aria-modal="true"
      :aria-label="title"
    >
      <button
        type="button"
        class="lead-drawer__backdrop"
        aria-label="关闭"
        @click="emit('close')"
      />
      <aside class="lead-drawer__panel">
        <header class="lead-drawer__head">
          <div class="lead-drawer__head-text">
            <h3>{{ title }}</h3>
            <p>{{ lead.id }}</p>
          </div>
          <button
            type="button"
            class="lead-drawer__close"
            aria-label="关闭"
            @click="emit('close')"
          >
            <Icon name="x" :size="14" />
          </button>
        </header>

        <div class="lead-drawer__body">
          <div class="lead-drawer__badges">
            <span
              class="lead-phase"
              :class="lead.phase === 'scored' ? 'is-scored' : 'is-raw'"
            >
              {{ phaseLabel }}
            </span>
            <span
              v-if="lead.tierLabel"
              class="lead-tier"
              :class="`is-${lead.tier}`"
            >
              {{ lead.tierLabel }}
            </span>
            <span v-if="lead.score != null" class="lead-drawer__score-pill">
              score {{ lead.score }}
            </span>
            <span v-if="lead.rawScore != null" class="lead-drawer__score-pill">
              raw_score {{ lead.rawScore }}
            </span>
          </div>

          <section class="lead-drawer__section">
            <h4>标识与元数据</h4>
            <dl class="lead-drawer__fields">
              <div class="lead-drawer__field">
                <dt>id</dt>
                <dd>{{ displayOrDash(lead.id) }}</dd>
              </div>
              <div class="lead-drawer__field">
                <dt>product_id</dt>
                <dd>{{ displayOrDash(lead.productId) }}</dd>
              </div>
              <div class="lead-drawer__field">
                <dt>phase</dt>
                <dd>{{ lead.phase }}</dd>
              </div>
              <div class="lead-drawer__field">
                <dt>round</dt>
                <dd>{{ displayOrDash(lead.round) }}</dd>
              </div>
              <div class="lead-drawer__field">
                <dt>query_id</dt>
                <dd>{{ displayOrDash(lead.queryId) }}</dd>
              </div>
              <div class="lead-drawer__field">
                <dt>discovered_at</dt>
                <dd>{{ discoveredLabel }}</dd>
              </div>
              <div class="lead-drawer__field">
                <dt>status</dt>
                <dd>{{ statusLabel }}</dd>
              </div>
              <div class="lead-drawer__field">
                <dt>dedupe_key</dt>
                <dd>{{ displayOrDash(lead.dedupeKey) }}</dd>
              </div>
            </dl>
          </section>

          <section class="lead-drawer__section">
            <h4>公司 company</h4>
            <dl class="lead-drawer__fields">
              <div class="lead-drawer__field">
                <dt>name</dt>
                <dd>{{ displayOrDash(lead.company.name) }}</dd>
              </div>
              <div class="lead-drawer__field">
                <dt>website</dt>
                <dd>
                  <a
                    v-if="websiteHref"
                    class="lead-link"
                    :href="websiteHref"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {{ lead.company.website || websiteHref }}
                  </a>
                  <span v-else>—</span>
                </dd>
              </div>
              <div class="lead-drawer__field">
                <dt>country</dt>
                <dd>{{ displayOrDash(lead.company.country || lead.country) }}</dd>
              </div>
              <div class="lead-drawer__field lead-drawer__field--block">
                <dt>description</dt>
                <dd class="lead-drawer__multiline">
                  {{ displayOrDash(lead.company.description) }}
                </dd>
              </div>
            </dl>
          </section>

          <section class="lead-drawer__section">
            <h4>来源 source</h4>
            <dl class="lead-drawer__fields">
              <div class="lead-drawer__field">
                <dt>url / source_url</dt>
                <dd>
                  <a
                    v-if="lead.source.url || lead.sourceUrl"
                    class="lead-link"
                    :href="lead.source.url || lead.sourceUrl"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {{ lead.source.url || lead.sourceUrl }}
                  </a>
                  <span v-else>—</span>
                </dd>
              </div>
              <div class="lead-drawer__field">
                <dt>type</dt>
                <dd>{{ displayOrDash(lead.source.type) }}</dd>
              </div>
              <div class="lead-drawer__field lead-drawer__field--block">
                <dt>snippet</dt>
                <dd class="lead-drawer__multiline">
                  {{ displayOrDash(lead.source.snippet) }}
                </dd>
              </div>
            </dl>
          </section>

          <section class="lead-drawer__section">
            <h4>联系方式 contacts</h4>
            <ul v-if="lead.contacts.length" class="lead-drawer__contacts">
              <li v-for="(c, i) in lead.contacts" :key="`${c.type}-${i}`">
                <div class="lead-drawer__contact-meta">
                  <span class="lead-drawer__contact-type">{{ c.type }}</span>
                  <span v-if="c.confidence" class="lead-drawer__contact-conf">
                    confidence: {{ c.confidence }}
                  </span>
                </div>
                <span class="lead-drawer__contact-value">{{ c.value }}</span>
              </li>
            </ul>
            <p v-else class="lead-drawer__empty">[]（无联系方式）</p>
          </section>

          <section class="lead-drawer__section">
            <h4>匹配与评分</h4>
            <dl class="lead-drawer__fields">
              <div class="lead-drawer__field lead-drawer__field--block">
                <dt>match_reason</dt>
                <dd class="lead-drawer__multiline">
                  {{ displayOrDash(lead.matchReason) }}
                </dd>
              </div>
              <div class="lead-drawer__field">
                <dt>score</dt>
                <dd>{{ lead.score != null ? lead.score : '—' }}</dd>
              </div>
              <div class="lead-drawer__field">
                <dt>raw_score</dt>
                <dd>{{ lead.rawScore != null ? lead.rawScore : '—' }}</dd>
              </div>
              <div class="lead-drawer__field">
                <dt>tier</dt>
                <dd>{{ tierFullLabel }}</dd>
              </div>
            </dl>

            <div v-if="breakdownRows.length" class="lead-drawer__breakdown">
              <p class="lead-drawer__breakdown-title">score_breakdown</p>
              <div
                v-for="row in breakdownRows"
                :key="row.key"
                class="lead-drawer__breakdown-row"
              >
                <div class="lead-drawer__breakdown-label">
                  <span>{{ row.label }}</span>
                  <span>{{ row.value }}</span>
                </div>
                <div class="lead-drawer__breakdown-track">
                  <div
                    class="lead-drawer__breakdown-fill"
                    :style="{ width: `${Math.max(0, Math.min(100, row.value))}%` }"
                  />
                </div>
              </div>
            </div>
            <p v-else class="lead-drawer__empty">无 score_breakdown（原始线索常见）</p>
          </section>

          <section class="lead-drawer__section">
            <div class="lead-drawer__section-head">
              <h4>完整落盘数据 record</h4>
              <div class="lead-drawer__section-actions">
                <button
                  type="button"
                  class="btn-secondary btn-sm"
                  @click="copyJson"
                >
                  {{ copied ? '已复制' : '复制 JSON' }}
                </button>
                <button
                  type="button"
                  class="btn-secondary btn-sm"
                  @click="showRawJson = !showRawJson"
                >
                  {{ showRawJson ? '收起' : '展开' }}
                </button>
              </div>
            </div>
            <pre v-if="showRawJson" class="lead-drawer__json">{{ recordJson }}</pre>
            <p v-else class="lead-drawer__empty">
              点击「展开」查看该线索在 data/ 中的完整 JSON 对象
            </p>
          </section>
        </div>

        <footer class="lead-drawer__foot">
          <button type="button" class="btn-secondary" @click="emit('close')">
            关闭
          </button>
          <button
            v-if="lead.phase === 'scored'"
            type="button"
            class="btn-primary"
            disabled
            title="邮件草稿后续接入"
          >
            写邮件
          </button>
        </footer>
      </aside>
    </div>
  </Teleport>
</template>
