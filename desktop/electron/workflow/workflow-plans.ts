import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { BUILTIN_WORKFLOW_PLANS } from './builtin-plans'
import { isWorkflowNodeId } from './workflow-nodes'
import type {
  WorkflowPlan,
  WorkflowPlanSaveInput,
  WorkflowPlanStep,
} from './workflow-plans-types'

const PLANS_FILE = path.join('data', 'prefs', 'workflow-plans.json')

type PlansFileEnvelope = {
  version?: unknown
  plans?: unknown
}

function userPlansFilePath(workspaceRoot: string): string {
  return path.join(workspaceRoot, PLANS_FILE)
}

function isBuiltinPlanId(id: string): boolean {
  return id.startsWith('builtin-')
}

function normalizeName(name: string): string {
  return name.trim()
}

function validateSteps(steps: WorkflowPlanStep[]): WorkflowPlanStep[] {
  if (!Array.isArray(steps) || steps.length < 1 || steps.length > 10) {
    throw new Error('方案须包含 1～10 个步骤')
  }
  return steps.map((step) => {
    const nodeId = String(step?.nodeId || '').trim()
    if (!isWorkflowNodeId(nodeId)) {
      throw new Error(`未知步骤：${nodeId || '(空)'}`)
    }
    return { nodeId }
  })
}

function parseUserPlan(raw: unknown): WorkflowPlan | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const record = raw as Record<string, unknown>
  const id = String(record.id || '').trim()
  const name = typeof record.name === 'string' ? record.name : ''
  const stepsRaw = record.steps
  if (!id || isBuiltinPlanId(id) || record.builtin === true) return null
  if (!Array.isArray(stepsRaw)) return null

  const steps: WorkflowPlanStep[] = []
  for (const step of stepsRaw) {
    if (!step || typeof step !== 'object' || Array.isArray(step)) return null
    const nodeId = String((step as { nodeId?: unknown }).nodeId || '').trim()
    if (!isWorkflowNodeId(nodeId)) return null
    steps.push({ nodeId })
  }
  if (steps.length < 1 || steps.length > 10) return null

  const plan: WorkflowPlan = { id, name, steps }
  if (typeof record.createdAt === 'string') plan.createdAt = record.createdAt
  if (typeof record.updatedAt === 'string') plan.updatedAt = record.updatedAt
  return plan
}

function writeUserPlansFile(workspaceRoot: string, plans: WorkflowPlan[]): void {
  const file = userPlansFilePath(workspaceRoot)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(
    file,
    `${JSON.stringify({ version: 1, plans }, null, 2)}\n`,
    'utf8',
  )
}

export function loadUserWorkflowPlans(workspaceRoot: string): WorkflowPlan[] {
  const file = userPlansFilePath(workspaceRoot)
  if (!fs.existsSync(file)) return []

  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as PlansFileEnvelope
    if (raw.version !== 1 || !Array.isArray(raw.plans)) {
      console.warn('[workflow-plans] invalid envelope, using empty user plans')
      return []
    }

    const plans: WorkflowPlan[] = []
    for (const entry of raw.plans) {
      const plan = parseUserPlan(entry)
      if (plan) {
        plans.push(plan)
        continue
      }
      const id =
        entry && typeof entry === 'object' && !Array.isArray(entry)
          ? String((entry as { id?: unknown }).id || '')
          : ''
      if (id && isBuiltinPlanId(id)) {
        console.warn(`[workflow-plans] dropped builtin record from user file: ${id}`)
      }
    }
    return plans
  } catch (err) {
    console.warn('[workflow-plans] failed to read plans file, using empty user plans', err)
    return []
  }
}

function sortUserPlans(plans: WorkflowPlan[]): WorkflowPlan[] {
  return [...plans].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
}

export function listWorkflowPlans(workspaceRoot: string): WorkflowPlan[] {
  const userPlans = sortUserPlans(loadUserWorkflowPlans(workspaceRoot))
  return [...BUILTIN_WORKFLOW_PLANS, ...userPlans]
}

export function getWorkflowPlanById(workspaceRoot: string, id: string): WorkflowPlan | null {
  const trimmed = id.trim()
  if (!trimmed) return null
  return listWorkflowPlans(workspaceRoot).find((plan) => plan.id === trimmed) ?? null
}

function generateUserPlanId(existingIds: Set<string>): string {
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const id = `user_${crypto.randomBytes(4).toString('hex')}`
    if (!existingIds.has(id)) return id
  }
  throw new Error('无法生成方案 id')
}

function assertUniqueUserPlanName(
  plans: WorkflowPlan[],
  name: string,
  excludeId?: string,
): void {
  const normalized = normalizeName(name).toLocaleLowerCase('zh-CN')
  const conflict = plans.find(
    (plan) =>
      plan.id !== excludeId &&
      normalizeName(plan.name).toLocaleLowerCase('zh-CN') === normalized,
  )
  if (conflict) {
    throw new Error(`已存在同名方案「${conflict.name}」`)
  }
}

export function saveUserWorkflowPlan(
  workspaceRoot: string,
  input: WorkflowPlanSaveInput,
): WorkflowPlan {
  const name = normalizeName(input.name)
  if (name.length < 1 || name.length > 40) {
    throw new Error('方案名称须为 1～40 个字符')
  }

  const steps = validateSteps(input.steps)
  const userPlans = loadUserWorkflowPlans(workspaceRoot)
  const now = new Date().toISOString()

  const requestedId = String(input.id || '').trim()
  if (requestedId && isBuiltinPlanId(requestedId)) {
    throw new Error('内置方案不可修改')
  }

  if (requestedId) {
    const index = userPlans.findIndex((plan) => plan.id === requestedId)
    if (index < 0) {
      throw new Error(`方案不存在：${requestedId}`)
    }
    assertUniqueUserPlanName(userPlans, name, requestedId)
    const existing = userPlans[index]
    const updated: WorkflowPlan = {
      id: existing.id,
      name,
      steps,
      createdAt: existing.createdAt ?? now,
      updatedAt: now,
    }
    userPlans[index] = updated
    writeUserPlansFile(workspaceRoot, userPlans)
    return updated
  }

  assertUniqueUserPlanName(userPlans, name)
  const id = generateUserPlanId(new Set(userPlans.map((plan) => plan.id)))
  const created: WorkflowPlan = {
    id,
    name,
    steps,
    createdAt: now,
    updatedAt: now,
  }
  userPlans.push(created)
  writeUserPlansFile(workspaceRoot, userPlans)
  return created
}

export function deleteUserWorkflowPlan(workspaceRoot: string, id: string): void {
  const trimmed = id.trim()
  if (!trimmed) {
    throw new Error('缺少方案 id')
  }
  if (isBuiltinPlanId(trimmed)) {
    throw new Error('内置方案不可删除')
  }

  const userPlans = loadUserWorkflowPlans(workspaceRoot)
  const index = userPlans.findIndex((plan) => plan.id === trimmed)
  if (index < 0) {
    throw new Error(`方案不存在：${trimmed}`)
  }

  userPlans.splice(index, 1)
  writeUserPlansFile(workspaceRoot, userPlans)
}
