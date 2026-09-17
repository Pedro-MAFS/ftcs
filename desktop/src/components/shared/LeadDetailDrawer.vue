<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import type {
  LeadPersonDto,
  LeadRowDto,
  LeadScoreBreakdownDto,
  RawLeadSaveInput,
  SaveScoredPeoplePersonInput,
} from '../../types/electron'
import Icon from './Icon.vue'
import { showToast } from '../../composables/useToast'

const props = defineProps<{
  open: boolean
  lead: LeadRowDto | null
  drafting?: boolean
  enriching?: boolean
  canEnrich?: boolean
  enrichTitle?: string
  hunterKeySet?: boolean
}>()

const emit = defineEmits<{
  close: []
  saved: [lead: LeadRowDto]
  draft: [lead: LeadRowDto]
  enrich: [lead: LeadRowDto]
  openEmail: [lead: LeadRowDto]
}>()

const hasEmailDraft = computed(
  () =>
    !!props.lead &&
    props.lead.phase === 'scored' &&
    (props.lead.status === 'email_drafted' ||
      props.lead.status === 'email_approved' ||
      props.lead.status === 'contacted'),
)

type ContactDraft = {
  type: string
  value: string
  confidence: string
}

type PersonDraft = {
  id?: string
  name: string
  firstName: string
  lastName: string
  title: string
  email: string
  matchReason: string
  emailStatus: string
  confidenceText: string
  provider: 'hunter' | 'manual'
}

type EditDraft = {
  companyName: string
  website: string
  country: string
  description: string
  sourceUrl: string
  sourceType: string
  snippet: string
  matchReason: string
  rawScoreText: string
  contacts: ContactDraft[]
}

const showRawJson = ref(false)
const copied = ref(false)
const editing = ref(false)
const editingPeople = ref(false)
const saving = ref(false)
const savingPeople = ref(false)
const verifyingPersonId = ref('')
const expandedSources = ref<Record<string, boolean>>({})
const saveMessage = ref('')
const saveError = ref(false)

watch(saveMessage, async (msg) => {
  const text = msg.trim()
  if (!text) return
  await nextTick()
  showToast(text, { tone: saveError.value ? 'error' : 'info' })
  saveMessage.value = ''
  saveError.value = false
})

const peopleDraft = ref<PersonDraft[]>([])
const draft = reactive<EditDraft>({
  companyName: '',
  website: '',
  country: '',
  description: '',
  sourceUrl: '',
  sourceType: 'tavily_search',
  snippet: '',
  matchReason: '',
  rawScoreText: '',
  contacts: [],
})

const title = computed(() => props.lead?.companyName || '线索详情')
const canEdit = computed(() => props.lead?.phase === 'raw')
const canEditPeople = computed(() => props.lead?.phase === 'scored')
const hasHunterKey = computed(() => Boolean(props.hunterKeySet))

const phaseLabel = computed(() => {
  const phase = props.lead?.phase
  if (phase === 'scored') return '已评分（scored）'
  if (phase === 'discarded') return '重复淘汰（discarded）'
  return '未评分（raw）'
})

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

function displayOrDash(value?: string | null): string {
  if (value == null) return '—'
  const text = String(value).trim()
  return text || '—'
}

function syncDraftFromLead(lead: LeadRowDto): void {
  draft.companyName = lead.company.name || lead.companyName || ''
  draft.website = lead.company.website || ''
  draft.country = lead.company.country || lead.country || ''
  draft.description = lead.company.description || ''
  draft.sourceUrl = lead.source.url || lead.sourceUrl || ''
  draft.sourceType = lead.source.type || 'tavily_search'
  draft.snippet = lead.source.snippet || ''
  draft.matchReason = lead.matchReason || ''
  draft.rawScoreText = lead.rawScore != null ? String(lead.rawScore) : ''
  draft.contacts = lead.contacts.map((c) => ({
    type: c.type || 'email',
    value: c.value || '',
    confidence: c.confidence || '',
  }))
  if (draft.contacts.length === 0) {
    draft.contacts.push({ type: 'email', value: '', confidence: '' })
  }
}

function startEdit(): void {
  if (!props.lead || !canEdit.value) return
  syncDraftFromLead(props.lead)
  editing.value = true
  saveMessage.value = ''
  saveError.value = false
}

function cancelEdit(): void {
  editing.value = false
  saving.value = false
  saveMessage.value = ''
  saveError.value = false
  if (props.lead) syncDraftFromLead(props.lead)
}

function addContact(): void {
  draft.contacts.push({ type: 'email', value: '', confidence: '' })
}

function removeContact(index: number): void {
  draft.contacts.splice(index, 1)
  if (draft.contacts.length === 0) {
    draft.contacts.push({ type: 'email', value: '', confidence: '' })
  }
}

function buildSaveInput(lead: LeadRowDto): RawLeadSaveInput {
  const rawScoreText = draft.rawScoreText.trim()
  let raw_score: number | null | undefined
  if (!rawScoreText) {
    raw_score = null
  } else {
    const n = Number(rawScoreText)
    if (!Number.isFinite(n)) {
      throw new Error('raw_score 须为数字')
    }
    raw_score = n
  }

  return {
    productId: lead.productId,
    leadId: lead.id,
    company: {
      name: draft.companyName,
      website: draft.website,
      country: draft.country,
      description: draft.description,
    },
    source: {
      url: draft.sourceUrl,
      type: draft.sourceType,
      snippet: draft.snippet,
    },
    match_reason: draft.matchReason,
    contacts: draft.contacts
      .map((c) => ({
        type: c.type,
        value: c.value.trim(),
        confidence: c.confidence || undefined,
      }))
      .filter((c) => c.value),
    raw_score,
  }
}

async function saveEdit(): Promise<void> {
  if (!props.lead || !window.ftcs?.saveRawLead) return
  saving.value = true
  saveMessage.value = ''
  saveError.value = false
  try {
    const input = buildSaveInput(props.lead)
    const res = await window.ftcs.saveRawLead(input)
    saveMessage.value = res.message
    saveError.value = !res.ok
    if (res.ok && res.lead) {
      editing.value = false
      emit('saved', res.lead)
    }
  } catch (err) {
    saveError.value = true
    saveMessage.value = err instanceof Error ? err.message : String(err)
  } finally {
    saving.value = false
  }
}

function emailStatusLabel(status: string): string {
  if (status === 'hunter_valid') return '已验证'
  if (status === 'hunter_accept_all') return '接受全部'
  if (status === 'hunter_invalid') return '无效'
  if (status === 'hunter_unknown') return '未知'
  if (status === 'hunter_unverified') return '未验证'
  return status || '—'
}

function canVerifyPerson(p: LeadPersonDto): boolean {
  return (
    p.emailStatus === 'hunter_unverified' || p.emailStatus === 'hunter_unknown'
  )
}

function isManualSourceUri(uri: string): boolean {
  return uri.startsWith('urn:') || uri.includes('ftcs:manual')
}

function isHttpUri(uri: string): boolean {
  return /^https?:\/\//i.test(uri)
}

function toggleSources(key: string): void {
  expandedSources.value = {
    ...expandedSources.value,
    [key]: !expandedSources.value[key],
  }
}

function syncPeopleDraftFromLead(lead: LeadRowDto): void {
  peopleDraft.value = (lead.people || []).map((p) => ({
    id: p.id || undefined,
    name: p.name || '',
    firstName: p.firstName || '',
    lastName: p.lastName || '',
    title: p.title || '',
    email: p.email || '',
    matchReason: p.matchReason || '',
    emailStatus: p.emailStatus || 'hunter_unverified',
    confidenceText: p.confidence != null ? String(p.confidence) : '0',
    provider: p.provider === 'manual' ? 'manual' : 'hunter',
  }))
  if (peopleDraft.value.length === 0) {
    peopleDraft.value.push({
      name: '',
      firstName: '',
      lastName: '',
      title: '',
      email: '',
      matchReason: '用户手工录入',
      emailStatus: 'hunter_unverified',
      confidenceText: '0',
      provider: 'manual',
    })
  }
}

function startEditPeople(): void {
  if (!props.lead || !canEditPeople.value) return
  syncPeopleDraftFromLead(props.lead)
  editingPeople.value = true
  saveMessage.value = ''
  saveError.value = false
}

function cancelEditPeople(): void {
  editingPeople.value = false
  savingPeople.value = false
  saveMessage.value = ''
  saveError.value = false
  if (props.lead) syncPeopleDraftFromLead(props.lead)
}

function addPersonDraft(): void {
  peopleDraft.value.push({
    name: '',
    firstName: '',
    lastName: '',
    title: '',
    email: '',
    matchReason: '用户手工录入',
    emailStatus: 'hunter_unverified',
    confidenceText: '0',
    provider: 'manual',
  })
}

function removePersonDraft(index: number): void {
  peopleDraft.value.splice(index, 1)
  if (peopleDraft.value.length === 0) addPersonDraft()
}

async function savePeopleEdit(): Promise<void> {
  if (!props.lead || !window.ftcs?.saveScoredPeople) return
  savingPeople.value = true
  saveMessage.value = ''
  saveError.value = false
  try {
    const people: SaveScoredPeoplePersonInput[] = []
    for (const row of peopleDraft.value) {
      const email = row.email.trim()
      if (!email && !row.name.trim()) continue
      if (!email) {
        throw new Error('邮箱不能为空')
      }
      const conf = Number.parseInt(row.confidenceText.trim() || '0', 10)
      people.push({
        id: row.id,
        name: row.name.trim() || email.split('@')[0] || 'unknown',
        firstName: row.firstName.trim() || null,
        lastName: row.lastName.trim() || null,
        title: row.title.trim() || null,
        matchReason: row.matchReason.trim() || '用户手工录入',
        email,
        emailStatus: row.emailStatus || 'hunter_unverified',
        confidence: Number.isFinite(conf) ? conf : 0,
        provider: row.id && row.provider === 'hunter' ? 'hunter' : 'manual',
      })
    }
    const res = await window.ftcs.saveScoredPeople({
      productId: props.lead.productId,
      leadId: props.lead.id,
      people,
    })
    saveMessage.value = res.message
    saveError.value = !res.ok
    if (res.ok && res.lead) {
      editingPeople.value = false
      emit('saved', res.lead)
    }
  } catch (err) {
    saveError.value = true
    saveMessage.value = err instanceof Error ? err.message : String(err)
  } finally {
    savingPeople.value = false
  }
}

async function onVerifyPerson(p: LeadPersonDto): Promise<void> {
  if (!props.lead || !window.ftcs?.verifyPersonEmail || !p.id) return
  if (!hasHunterKey.value) {
    saveMessage.value = '请先在设置 → 集成配置 Hunter API Key'
    saveError.value = true
    return
  }
  verifyingPersonId.value = p.id
  saveMessage.value = ''
  saveError.value = false
  try {
    const res = await window.ftcs.verifyPersonEmail({
      productId: props.lead.productId,
      leadId: props.lead.id,
      personId: p.id,
    })
    saveMessage.value = res.message
    saveError.value = !res.ok
    if (res.ok && res.lead) emit('saved', res.lead)
  } catch (err) {
    saveError.value = true
    saveMessage.value = err instanceof Error ? err.message : String(err)
  } finally {
    verifyingPersonId.value = ''
  }
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
    // ignore
  }
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key !== 'Escape' || !props.open) return
  if (editingPeople.value) {
    e.preventDefault()
    cancelEditPeople()
    return
  }
  if (editing.value) {
    e.preventDefault()
    cancelEdit()
    return
  }
  emit('close')
}

function resetEditorState(): void {
  editing.value = false
  editingPeople.value = false
  saving.value = false
  savingPeople.value = false
  verifyingPersonId.value = ''
  expandedSources.value = {}
  saveMessage.value = ''
  saveError.value = false
  showRawJson.value = false
  if (props.lead) {
    syncDraftFromLead(props.lead)
    syncPeopleDraftFromLead(props.lead)
  }
}

// 只盯 id / open 的标量；轮询刷新会换 lead 对象引用，不能触发退出编辑
watch(
  () => props.lead?.id ?? '',
  () => {
    resetEditorState()
  },
)

watch(
  () => props.open,
  (open) => {
    document.body.style.overflow = open ? 'hidden' : ''
    resetEditorState()
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
            <h3>
              {{
                editing
                  ? '编辑未评分线索'
                  : editingPeople
                    ? '编辑联系人'
                    : title
              }}
            </h3>
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
              :class="
                lead.phase === 'scored'
                  ? 'is-scored'
                  : lead.phase === 'discarded'
                    ? 'is-discarded'
                    : 'is-raw'
              "
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

          <template v-if="editingPeople">
            <section class="lead-drawer__section">
              <div class="lead-drawer__section-head">
                <h4>关键联系人 people</h4>
                <button type="button" class="btn-secondary btn-sm" @click="addPersonDraft">
                  添加联系人
                </button>
              </div>
              <div
                v-for="(row, i) in peopleDraft"
                :key="row.id || `new-${i}`"
                class="lead-drawer__person-edit"
              >
                <div class="lead-drawer__person-edit-grid">
                  <label>
                    <span>姓名</span>
                    <input v-model="row.name" type="text" />
                  </label>
                  <label>
                    <span>邮箱</span>
                    <input v-model="row.email" type="email" required />
                  </label>
                  <label>
                    <span>职位</span>
                    <input v-model="row.title" type="text" />
                  </label>
                  <label>
                    <span>first_name</span>
                    <input v-model="row.firstName" type="text" />
                  </label>
                  <label>
                    <span>last_name</span>
                    <input v-model="row.lastName" type="text" />
                  </label>
                  <label>
                    <span>email_status</span>
                    <select v-model="row.emailStatus">
                      <option value="hunter_unverified">未验证</option>
                      <option value="hunter_unknown">未知</option>
                      <option value="hunter_valid">已验证</option>
                      <option value="hunter_accept_all">接受全部</option>
                      <option value="hunter_invalid">无效</option>
                    </select>
                  </label>
                  <label>
                    <span>confidence</span>
                    <input
                      v-model="row.confidenceText"
                      type="text"
                      inputmode="numeric"
                    />
                  </label>
                  <label class="is-block">
                    <span>match_reason</span>
                    <input v-model="row.matchReason" type="text" />
                  </label>
                </div>
                <div class="lead-drawer__person-edit-foot">
                  <span class="lead-drawer__person-provider">
                    {{ row.provider === 'manual' || !row.id ? 'manual' : 'hunter' }}
                  </span>
                  <button
                    type="button"
                    class="btn-secondary btn-sm"
                    @click="removePersonDraft(i)"
                  >
                    删除
                  </button>
                </div>
              </div>
            </section>
          </template>

          <template v-else-if="editing">
            <section class="lead-drawer__section">
              <h4>公司 company</h4>
              <div class="lead-drawer__form">
                <label>
                  <span>name</span>
                  <input v-model="draft.companyName" type="text" />
                </label>
                <label>
                  <span>website</span>
                  <input v-model="draft.website" type="text" />
                </label>
                <label>
                  <span>country</span>
                  <input v-model="draft.country" type="text" placeholder="如 US / DE" />
                </label>
                <label class="is-block">
                  <span>description</span>
                  <textarea v-model="draft.description" rows="3" />
                </label>
              </div>
            </section>

            <section class="lead-drawer__section">
              <h4>来源 source</h4>
              <div class="lead-drawer__form">
                <label class="is-block">
                  <span>url（必填）</span>
                  <input v-model="draft.sourceUrl" type="text" required />
                </label>
                <label>
                  <span>type</span>
                  <select v-model="draft.sourceType">
                    <option value="tavily_search">tavily_search</option>
                    <option value="google_search">google_search</option>
                    <option value="manual">manual</option>
                  </select>
                </label>
                <label class="is-block">
                  <span>snippet</span>
                  <textarea v-model="draft.snippet" rows="3" />
                </label>
              </div>
            </section>

            <section class="lead-drawer__section">
              <div class="lead-drawer__section-head">
                <h4>联系方式 contacts</h4>
                <button type="button" class="btn-secondary btn-sm" @click="addContact">
                  添加
                </button>
              </div>
              <div
                v-for="(c, i) in draft.contacts"
                :key="i"
                class="lead-drawer__contact-edit"
              >
                <select v-model="c.type" aria-label="联系方式类型">
                  <option value="email">email</option>
                  <option value="phone">phone</option>
                  <option value="form">form</option>
                  <option value="linkedin">linkedin</option>
                </select>
                <input v-model="c.value" type="text" placeholder="值" />
                <select v-model="c.confidence" aria-label="置信度">
                  <option value="">confidence</option>
                  <option value="high">high</option>
                  <option value="medium">medium</option>
                  <option value="low">low</option>
                </select>
                <button
                  type="button"
                  class="btn-secondary btn-sm"
                  @click="removeContact(i)"
                >
                  删
                </button>
              </div>
            </section>

            <section class="lead-drawer__section">
              <h4>匹配与评分</h4>
              <div class="lead-drawer__form">
                <label class="is-block">
                  <span>match_reason</span>
                  <textarea v-model="draft.matchReason" rows="4" />
                </label>
                <label>
                  <span>raw_score</span>
                  <input
                    v-model="draft.rawScoreText"
                    type="text"
                    inputmode="decimal"
                    placeholder="可选"
                  />
                </label>
              </div>
            </section>
          </template>

          <template v-else>
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
                  <dt>run_id</dt>
                  <dd>{{ displayOrDash(lead.runId) }}</dd>
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
                <div v-if="lead.phase === 'discarded'" class="lead-drawer__field">
                  <dt>kept_lead_id</dt>
                  <dd>{{ displayOrDash(lead.keptLeadId) }}</dd>
                </div>
                <div v-if="lead.phase === 'discarded'" class="lead-drawer__field">
                  <dt>discard_reason</dt>
                  <dd>{{ displayOrDash(lead.discardReason) }}</dd>
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
              <h4>关键联系人 people</h4>
              <ul v-if="lead.people?.length" class="lead-drawer__people">
                <li
                  v-for="(p, i) in lead.people"
                  :key="p.id || `${p.email}-${i}`"
                  class="lead-drawer__person"
                >
                  <div class="lead-drawer__person-top">
                    <div class="lead-drawer__person-main">
                      <span class="lead-drawer__person-name">{{ p.name || '—' }}</span>
                      <span
                        v-if="p.emailStatus"
                        class="lead-drawer__person-status"
                        :class="`is-${p.emailStatus}`"
                      >
                        {{ emailStatusLabel(p.emailStatus) }}
                      </span>
                      <span
                        v-if="p.provider === 'manual'"
                        class="lead-drawer__person-provider"
                      >
                        手工
                      </span>
                      <span
                        v-if="p.confidence != null"
                        class="lead-drawer__contact-conf"
                      >
                        confidence: {{ p.confidence }}
                      </span>
                    </div>
                    <button
                      v-if="canVerifyPerson(p)"
                      type="button"
                      class="btn-secondary btn-sm"
                      :disabled="
                        !hasHunterKey ||
                        verifyingPersonId === p.id ||
                        !!verifyingPersonId
                      "
                      :title="
                        hasHunterKey
                          ? '调用 Hunter 验证该邮箱'
                          : '请先在设置 → 集成配置 Hunter API Key'
                      "
                      @click="onVerifyPerson(p)"
                    >
                      {{ verifyingPersonId === p.id ? '验证中…' : '验证' }}
                    </button>
                  </div>
                  <span v-if="p.title" class="lead-drawer__person-title">{{
                    p.title
                  }}</span>
                  <span class="lead-drawer__contact-value">{{ p.email || '—' }}</span>
                  <span v-if="p.matchReason" class="lead-drawer__person-role">
                    {{ p.matchReason }}
                  </span>
                  <span
                    v-else-if="p.roleMatch"
                    class="lead-drawer__person-role"
                  >
                    {{ p.roleMatch }}
                  </span>
                  <div
                    v-if="p.sources?.length"
                    class="lead-drawer__person-sources"
                  >
                    <button
                      type="button"
                      class="lead-drawer__sources-toggle"
                      @click="toggleSources(p.id || `${p.email}-${i}`)"
                    >
                      来源 {{ p.sources.length }}
                      {{
                        expandedSources[p.id || `${p.email}-${i}`]
                          ? '▾'
                          : '▸'
                      }}
                    </button>
                    <ul
                      v-if="expandedSources[p.id || `${p.email}-${i}`]"
                      class="lead-drawer__sources-list"
                    >
                      <li v-for="(s, si) in p.sources" :key="`${s.uri}-${si}`">
                        <template v-if="isManualSourceUri(s.uri)">
                          <span>手工录入</span>
                          <span v-if="s.domain" class="lead-drawer__source-meta">
                            · {{ s.domain }}
                          </span>
                        </template>
                        <template v-else>
                          <a
                            v-if="isHttpUri(s.uri)"
                            :href="s.uri"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {{ s.domain || s.uri }}
                          </a>
                          <span v-else>{{ s.domain || s.uri || '—' }}</span>
                          <span
                            v-if="s.lastSeenOn"
                            class="lead-drawer__source-meta"
                          >
                            · last_seen {{ s.lastSeenOn }}
                          </span>
                          <span
                            v-if="s.stillOnPage"
                            class="lead-drawer__source-meta"
                          >
                            · still_on_page
                          </span>
                        </template>
                      </li>
                    </ul>
                  </div>
                </li>
              </ul>
              <p v-else class="lead-drawer__empty">[]（尚未补全联系人）</p>
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
          </template>
        </div>

        <footer class="lead-drawer__foot">
          <template v-if="editing">
            <button
              type="button"
              class="btn-secondary"
              :disabled="saving"
              @click="cancelEdit"
            >
              取消
            </button>
            <button
              type="button"
              class="btn-primary"
              :disabled="saving || !draft.sourceUrl.trim()"
              @click="saveEdit"
            >
              {{ saving ? '保存中…' : '确认保存' }}
            </button>
          </template>
          <template v-else-if="editingPeople">
            <button
              type="button"
              class="btn-secondary"
              :disabled="savingPeople"
              @click="cancelEditPeople"
            >
              取消
            </button>
            <button
              type="button"
              class="btn-primary"
              :disabled="savingPeople"
              @click="savePeopleEdit"
            >
              {{ savingPeople ? '保存中…' : '确认保存' }}
            </button>
          </template>
          <template v-else>
            <button type="button" class="btn-secondary" @click="emit('close')">
              关闭
            </button>
            <button
              v-if="canEdit"
              type="button"
              class="btn-primary"
              @click="startEdit"
            >
              编辑
            </button>
            <template v-else-if="lead.phase === 'scored'">
              <button
                type="button"
                class="btn-secondary"
                :disabled="drafting || enriching || !!verifyingPersonId"
                @click="startEditPeople"
              >
                编辑联系人
              </button>
              <button
                type="button"
                class="btn-secondary"
                :disabled="drafting || enriching || !canEnrich || !!verifyingPersonId"
                :title="enrichTitle || '补全联系人'"
                @click="emit('enrich', lead)"
              >
                {{ enriching ? '补全中…' : '补全联系人' }}
              </button>
              <button
                v-if="hasEmailDraft"
                type="button"
                class="btn-secondary"
                title="跳转到该线索的开发信"
                @click="emit('openEmail', lead)"
              >
                邮件
              </button>
              <button
                type="button"
                class="btn-primary"
                :disabled="drafting || enriching || !!verifyingPersonId"
                :title="
                  hasEmailDraft
                    ? '重新生成开发信草稿'
                    : '为该线索生成开发信草稿'
                "
                @click="emit('draft', lead)"
              >
                {{
                  drafting
                    ? '起草中…'
                    : hasEmailDraft
                      ? '重写邮件'
                      : '写邮件'
                }}
              </button>
            </template>
          </template>
        </footer>
      </aside>
    </div>
  </Teleport>
</template>
