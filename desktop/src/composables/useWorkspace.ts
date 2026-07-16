import { computed, ref } from 'vue'
import type {
  AgentLogLine,
  AgentMetaItem,
  PipelineStep,
  ProductSummary,
  WorkspaceSection,
} from '../types/workspace'

/** 占位数据：后续接 lead-store / IPC 后替换 */
const products = ref<ProductSummary[]>([
  {
    id: 'prod_valve_a',
    name: 'Industrial Valve Series A',
    meta: '就绪 · 42 线索',
  },
  {
    id: 'prod_led',
    name: 'LED Grow Light Pro',
    meta: '探索中 · R1',
  },
  {
    id: 'prod_mug',
    name: 'Ceramic Mug Set',
    meta: '草稿 · 未就绪',
  },
])

const activeProductId = ref(products.value[0]?.id ?? '')

const pipelineSteps = ref<PipelineStep[]>([
  { id: 'input', label: '1 产品录入', status: 'done', statusLabel: '完成' },
  { id: 'keywords', label: '2 关键词扩展', status: 'done', statusLabel: '完成' },
  { id: 'explore', label: '3 R1 探索', status: 'running', statusLabel: '运行中' },
  { id: 'score', label: '4 线索评分', status: 'pending', statusLabel: '待执行' },
  { id: 'email', label: '5 邮件草稿', status: 'pending', statusLabel: '待执行' },
])

const agentSkill = ref('discover-leads')
const agentMeta = ref<AgentMetaItem[]>([
  { label: '进度', value: '7 / 12 词' },
  { label: '新线索', value: '+18', tone: 'success' },
  { label: '耗时', value: '04:12' },
])
const agentLogs = ref<AgentLogLine[]>([
  { time: '12:04:01', tag: '搜索', message: 'industrial valve distributor Europe' },
  { time: '12:04:18', tag: '验证', message: 'nordicflow.se — 判定为目标客户' },
  { time: '12:04:22', tag: '写入', message: 'lead_a8f2 · A 候选' },
  { time: '12:04:41', tag: '搜索', message: 'ball valve importer Middle East' },
  { time: '12:05:02', tag: '验证', message: 'gulfvalve.ae — 有询盘入口' },
  { time: '12:05:08', tag: '写入', message: 'lead_b3c1 · A 候选' },
  { time: '12:05:33', tag: '跳过', message: 'alibaba.com — 平台页' },
  { time: '12:05:51', tag: '搜索', message: 'steam valve wholesale USA' },
])
const agentPrompt = ref('')

const activeProduct = computed(
  () => products.value.find((p) => p.id === activeProductId.value) ?? products.value[0],
)

const SECTION_SKILL: Partial<Record<WorkspaceSection, string>> = {
  input: 'extract-product-profile',
  profile: 'expand-keywords',
  explore: 'discover-leads',
  leads: 'score-and-dedupe',
  email: 'draft-outreach-email',
  settings: 'idle',
}

export function useWorkspace() {
  function selectProduct(id: string): void {
    activeProductId.value = id
  }

  function setAgentContext(section: WorkspaceSection): void {
    agentSkill.value = SECTION_SKILL[section] ?? 'idle'
  }

  return {
    products,
    activeProductId,
    activeProduct,
    pipelineSteps,
    agentSkill,
    agentMeta,
    agentLogs,
    agentPrompt,
    selectProduct,
    setAgentContext,
  }
}
