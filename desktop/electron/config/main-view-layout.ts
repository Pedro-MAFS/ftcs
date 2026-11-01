export interface LayoutRatios {
  pipeline: number
  main: number
  agent: number
}

export interface LayoutSnapshot {
  ratios: LayoutRatios
  pipelineCollapsed: boolean
  agentCollapsed: boolean
}

export type LayoutFill = 'none' | 'main' | 'agent'

export interface MainViewLayout {
  ratios: LayoutRatios
  pipelineCollapsed: boolean
  agentCollapsed: boolean
  fill: LayoutFill
  beforeFill: LayoutSnapshot | null
}

/** 与渲染进程 US-LY-01 的默认比例一致。 */
export const DEFAULT_LAYOUT_RATIOS: LayoutRatios = {
  pipeline: 0.2107,
  main: 0.4857,
  agent: 0.3036,
}

const RATIO_SUM_TOLERANCE = 0.001

export function defaultMainViewLayout(): MainViewLayout {
  return {
    ratios: { ...DEFAULT_LAYOUT_RATIOS },
    pipelineCollapsed: false,
    agentCollapsed: false,
    fill: 'none',
    beforeFill: null,
  }
}

/** 盘上没有字段时返回 null。占满但快照坏了时返回默认展开，不当成占满打开。 */
export function storedMainViewLayout(raw: unknown): MainViewLayout | null {
  if (raw == null) return null
  const strict = writableMainViewLayout(raw)
  if (strict) return strict
  if (isFilledFlag(raw)) return defaultMainViewLayout()
  return null
}

/** 校验失败返回 null。调用方丢弃这次写入。 */
export function writableMainViewLayout(raw: unknown): MainViewLayout | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const ratios = readRatios(record.ratios)
  if (!ratios) return null
  if (typeof record.pipelineCollapsed !== 'boolean') return null
  if (typeof record.agentCollapsed !== 'boolean') return null
  if (record.fill === 'none') {
    if (record.beforeFill !== null) return null
    return {
      ratios,
      pipelineCollapsed: record.pipelineCollapsed,
      agentCollapsed: record.agentCollapsed,
      fill: 'none',
      beforeFill: null,
    }
  }
  if (record.fill !== 'main' && record.fill !== 'agent') return null
  const beforeFill = readSnapshot(record.beforeFill)
  if (!beforeFill) return null
  return {
    ratios,
    pipelineCollapsed: record.pipelineCollapsed,
    agentCollapsed: record.agentCollapsed,
    fill: record.fill,
    beforeFill,
  }
}

function isFilledFlag(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false
  const fill = (raw as { fill?: unknown }).fill
  return fill === 'main' || fill === 'agent'
}

function readRatios(raw: unknown): LayoutRatios | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  if (!isPositiveFinite(record.pipeline) || !isPositiveFinite(record.main) || !isPositiveFinite(record.agent)) {
    return null
  }
  const sum = record.pipeline + record.main + record.agent
  if (Math.abs(sum - 1) > RATIO_SUM_TOLERANCE) return null
  return { pipeline: record.pipeline, main: record.main, agent: record.agent }
}

function readSnapshot(raw: unknown): LayoutSnapshot | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const ratios = readRatios(record.ratios)
  if (!ratios) return null
  if (typeof record.pipelineCollapsed !== 'boolean') return null
  if (typeof record.agentCollapsed !== 'boolean') return null
  return {
    ratios,
    pipelineCollapsed: record.pipelineCollapsed,
    agentCollapsed: record.agentCollapsed,
  }
}

function isPositiveFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}
