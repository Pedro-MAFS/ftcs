/** 子代理卡片。父时间线只挂一张，步骤来自 metadata.sessionId 对应的子会话。 */

export type AgentSubagentStep = {
  id: string
  kind: 'tool' | 'reasoning' | 'error'
  title: string
  body: string
  status?: 'running' | 'done' | 'error'
}

export type AgentSubagent = {
  sessionId: string
  agent: string
  description: string
  current: string
  toolCount: number
  running: boolean
  awaiting: boolean
  startedAt: number
  finishedAt?: number
  steps: AgentSubagentStep[]
}

type TaskState = {
  status: string
  input?: unknown
  output?: unknown
  metadata?: unknown
  error?: unknown
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function readTaskIdentity(state: TaskState): {
  sessionId: string
  agent: string
  description: string
} | null {
  const input = asRecord(state.input)
  const metadata = asRecord(state.metadata)
  const description = asString(input?.description).trim()
  const agent = asString(input?.subagent_type).trim()
  const sessionId = asString(metadata?.sessionId).trim()
  if (!description && !agent && !sessionId) return null
  return {
    sessionId,
    agent: agent || 'general',
    description: description || '子代理',
  }
}

export function emptySubagent(
  identity: { sessionId: string; agent: string; description: string },
  running: boolean,
  startedAt: number,
): AgentSubagent {
  return {
    sessionId: identity.sessionId,
    agent: identity.agent,
    description: identity.description,
    current: '',
    toolCount: 0,
    running,
    awaiting: false,
    startedAt,
    steps: [],
  }
}

/** 父工具再次更新时保留已追到的步骤。 */
export function mergeSubagent(prev: AgentSubagent | undefined, next: AgentSubagent): AgentSubagent {
  if (!prev) return next
  if (prev.sessionId && next.sessionId && prev.sessionId !== next.sessionId) return next
  return {
    ...prev,
    sessionId: next.sessionId || prev.sessionId,
    agent: next.agent || prev.agent,
    description: next.description || prev.description,
    running: next.running,
    startedAt: prev.startedAt || next.startedAt,
  }
}

export function withSubagentStep(sub: AgentSubagent, step: AgentSubagentStep): AgentSubagent {
  const index = sub.steps.findIndex((item) => item.id === step.id)
  const steps =
    index >= 0 ? sub.steps.map((item, i) => (i === index ? step : item)) : [...sub.steps, step]
  const tools = steps.filter((item) => item.kind === 'tool')
  const running = [...tools].reverse().find((item) => item.status === 'running')
  const latest = tools[tools.length - 1]
  const currentSource = running ?? latest
  return {
    ...sub,
    steps,
    toolCount: tools.length,
    current: currentSource ? currentSource.title : sub.current,
  }
}

export function withoutSubagentStep(sub: AgentSubagent, stepId: string): AgentSubagent {
  return withSubagentStepsRemoved(sub, sub.steps.filter((item) => item.id !== stepId))
}

function withSubagentStepsRemoved(sub: AgentSubagent, steps: AgentSubagentStep[]): AgentSubagent {
  const tools = steps.filter((item) => item.kind === 'tool')
  const running = [...tools].reverse().find((item) => item.status === 'running')
  const latest = tools[tools.length - 1]
  const currentSource = running ?? latest
  return {
    ...sub,
    steps,
    toolCount: tools.length,
    current: currentSource ? currentSource.title : '',
  }
}

export function taskResultBody(state: TaskState): string {
  if (state.status === 'error') {
    const message = asString(state.error).trim()
    return message || '子代理失败'
  }
  if (state.status !== 'completed') return ''
  const output = asString(state.output).trim()
  if (!output) return ''
  return output.length > 500 ? `${output.slice(0, 500)}…` : output
}
