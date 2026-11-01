import { computed, reactive, ref } from 'vue'

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

export interface ColumnWidths {
  rail: number
  pipeline: number
  main: number
  agent: number
  splitter: number
}

export type SplitterSide = 'left' | 'right'

/** 默认窗宽 1180、D = 1120 时约为 236 / 544 / 340。 */
export const DEFAULT_RATIOS: LayoutRatios = {
  pipeline: 0.2107,
  main: 0.4857,
  agent: 0.3036,
}

/** 与样式里的 `--rail-width` 一致。 */
export const RAIL_WIDTH = 48
export const COLLAPSED_COLUMN_WIDTH = 44
export const SPLITTER_WIDTH = 6
export const MIN_PIPELINE = 200
export const MIN_MAIN = 360
export const MIN_AGENT = 300

const MIN_WIDTH: LayoutRatios = {
  pipeline: MIN_PIPELINE,
  main: MIN_MAIN,
  agent: MIN_AGENT,
}

type PanelKey = keyof LayoutRatios

export interface WorkspaceLayoutOptions {
  /** 测试或 US-LY-04 之前的注入写入。缺省时尝试 `window.ftcs.setMainViewLayout`。 */
  write?: (layout: MainViewLayout) => void
  bodyWidth?: number
}

function defaultLayout(): MainViewLayout {
  return {
    ratios: { ...DEFAULT_RATIOS },
    pipelineCollapsed: false,
    agentCollapsed: false,
    fill: 'none',
    beforeFill: null,
  }
}

function cloneLayout(layout: MainViewLayout): MainViewLayout {
  return {
    ratios: { ...layout.ratios },
    pipelineCollapsed: layout.pipelineCollapsed,
    agentCollapsed: layout.agentCollapsed,
    fill: layout.fill,
    beforeFill: layout.beforeFill
      ? {
          ratios: { ...layout.beforeFill.ratios },
          pipelineCollapsed: layout.beforeFill.pipelineCollapsed,
          agentCollapsed: layout.beforeFill.agentCollapsed,
        }
      : null,
  }
}

function expandedKeys(layout: Pick<MainViewLayout, 'pipelineCollapsed' | 'agentCollapsed'>): PanelKey[] {
  const keys: PanelKey[] = []
  if (!layout.pipelineCollapsed) keys.push('pipeline')
  keys.push('main')
  if (!layout.agentCollapsed) keys.push('agent')
  return keys
}

function allocateByRatio(total: number, ratios: LayoutRatios, expanded: PanelKey[]): LayoutRatios {
  const result: LayoutRatios = { pipeline: 0, main: 0, agent: 0 }
  if (total <= 0 || expanded.length === 0) return result
  const sum = expanded.reduce((acc, key) => acc + ratios[key], 0)
  if (!(sum > 0)) return result

  let used = 0
  for (const key of expanded) {
    if (key === 'main') continue
    const px = Math.round((total * ratios[key]) / sum)
    result[key] = px
    used += px
  }

  if (expanded.includes('main')) {
    result.main = total - used
    if (result.main < 0) {
      let debt = -result.main
      result.main = 0
      for (const key of expanded) {
        if (key === 'main' || debt === 0) continue
        const take = Math.min(result[key], debt)
        result[key] -= take
        debt -= take
      }
    }
    return result
  }

  const last = expanded[expanded.length - 1]
  if (last) result[last] += total - used
  return result
}

function clampToMinimums(widths: LayoutRatios, total: number, expanded: PanelKey[]): LayoutRatios {
  const next: LayoutRatios = { pipeline: 0, main: 0, agent: 0 }
  for (const key of expanded) next[key] = widths[key]
  const minSum = expanded.reduce((sum, key) => sum + MIN_WIDTH[key], 0)
  if (minSum > total) return next

  let deficit = 0
  for (const key of expanded) {
    if (next[key] < MIN_WIDTH[key]) {
      deficit += MIN_WIDTH[key] - next[key]
      next[key] = MIN_WIDTH[key]
    }
  }
  if (deficit === 0) return next

  for (const key of ['main', 'pipeline', 'agent'] as const) {
    if (!expanded.includes(key) || deficit === 0) continue
    const spare = next[key] - MIN_WIDTH[key]
    if (spare <= 0) continue
    const take = Math.min(spare, deficit)
    next[key] -= take
    deficit -= take
  }
  return next
}

export function computeColumnPixels(bodyWidth: number, layout: MainViewLayout): ColumnWidths {
  const width = Math.max(0, Math.round(bodyWidth))
  if (layout.fill === 'main') {
    return { rail: 0, pipeline: 0, main: width, agent: 0, splitter: 0 }
  }
  if (layout.fill === 'agent') {
    return { rail: 0, pipeline: 0, main: 0, agent: width, splitter: 0 }
  }

  const fixed =
    RAIL_WIDTH +
    (layout.pipelineCollapsed ? COLLAPSED_COLUMN_WIDTH : 0) +
    (layout.agentCollapsed ? COLLAPSED_COLUMN_WIDTH : 0) +
    SPLITTER_WIDTH * 2
  const distributable = Math.max(0, width - fixed)
  const expanded = expandedKeys(layout)
  const shared = allocateByRatio(distributable, layout.ratios, expanded)
  const clamped = clampToMinimums(shared, distributable, expanded)
  return {
    rail: RAIL_WIDTH,
    pipeline: layout.pipelineCollapsed ? COLLAPSED_COLUMN_WIDTH : clamped.pipeline,
    main: clamped.main,
    agent: layout.agentCollapsed ? COLLAPSED_COLUMN_WIDTH : clamped.agent,
    splitter: SPLITTER_WIDTH,
  }
}

function clampDelta(delta: number, min: number, max: number): number {
  if (min > max) return 0
  return Math.min(max, Math.max(min, delta))
}

export function moveSplitter(
  origin: LayoutRatios,
  side: SplitterSide,
  deltaX: number,
): LayoutRatios {
  const next = { ...origin }
  const delta = Math.round(deltaX)
  if (side === 'left') {
    const applied = clampDelta(delta, MIN_PIPELINE - origin.pipeline, origin.main - MIN_MAIN)
    next.pipeline = origin.pipeline + applied
    next.main = origin.main - applied
    return next
  }
  const applied = clampDelta(delta, MIN_MAIN - origin.main, origin.agent - MIN_AGENT)
  next.main = origin.main + applied
  next.agent = origin.agent - applied
  return next
}

export function ratiosFromExpandedPixels(
  current: LayoutRatios,
  pixels: LayoutRatios,
  collapsed: { pipeline: boolean; agent: boolean },
): LayoutRatios {
  const next = { ...current }
  const keys = expandedKeys({
    pipelineCollapsed: collapsed.pipeline,
    agentCollapsed: collapsed.agent,
  })
  if (keys.some((key) => pixels[key] <= 0)) return current
  const reserved =
    (collapsed.pipeline ? current.pipeline : 0) + (collapsed.agent ? current.agent : 0)
  const share = 1 - reserved
  const pixelSum = keys.reduce((sum, key) => sum + pixels[key], 0)
  if (!(share > 0) || !(pixelSum > 0)) return current
  for (const key of keys) {
    next[key] = (share * pixels[key]) / pixelSum
  }
  next.main += 1 - (next.pipeline + next.main + next.agent)
  return next
}

function initialBodyWidth(): number {
  if (typeof window === 'undefined') return 1180
  return Math.max(0, Math.round(window.innerWidth))
}

function persistToHost(layout: MainViewLayout): void {
  if (typeof window === 'undefined' || !window.ftcs) return
  const write = (
    window.ftcs as { setMainViewLayout?: (value: MainViewLayout) => Promise<unknown> }
  ).setMainViewLayout
  if (!write) return
  void Promise.resolve(write(layout)).catch(() => {})
}

function setDragCursor(active: boolean): void {
  if (typeof document === 'undefined') return
  document.body.style.cursor = active ? 'col-resize' : ''
  document.body.style.userSelect = active ? 'none' : ''
}

export function createWorkspaceLayout(options: WorkspaceLayoutOptions = {}) {
  const state = reactive<MainViewLayout>(defaultLayout())
  const bodyWidth = ref(options.bodyWidth ?? initialBodyWidth())
  const preview = ref<LayoutRatios | null>(null)
  const draggingSide = ref<SplitterSide | null>(null)
  /** 进入设置时按展开宽度画分类，不改 pipelineCollapsed。 */
  const relaxPipelineCollapse = ref(false)
  let settingsOpen = false
  let dragOrigin: { x: number; pixels: LayoutRatios } | null = null

  function readLayout(): MainViewLayout {
    return cloneLayout(state)
  }

  function pixelLayout(): MainViewLayout {
    const layout = readLayout()
    if (relaxPipelineCollapse.value && layout.fill === 'none') {
      return { ...layout, pipelineCollapsed: false }
    }
    return layout
  }

  function displayedWidths(): ColumnWidths {
    const layout = pixelLayout()
    const base = computeColumnPixels(bodyWidth.value, layout)
    if (!preview.value || layout.fill !== 'none') return base
    return {
      rail: RAIL_WIDTH,
      pipeline: layout.pipelineCollapsed ? COLLAPSED_COLUMN_WIDTH : preview.value.pipeline,
      main: preview.value.main,
      agent: layout.agentCollapsed ? COLLAPSED_COLUMN_WIDTH : preview.value.agent,
      splitter: SPLITTER_WIDTH,
    }
  }

  const widths = computed(displayedWidths)

  function commit(): void {
    const snapshot = readLayout()
    options.write?.(cloneLayout(snapshot))
    persistToHost(cloneLayout(snapshot))
  }

  function clearDrag(): void {
    dragOrigin = null
    draggingSide.value = null
    preview.value = null
    setDragCursor(false)
  }

  function setBodyWidth(width: number): void {
    if (!Number.isFinite(width)) return
    const next = Math.max(0, Math.round(width))
    if (next === bodyWidth.value) return
    bodyWidth.value = next
  }

  function noteSettingsOpen(open: boolean): void {
    settingsOpen = open
    relaxPipelineCollapse.value = open
  }

  function collapsePipelineColumn(): void {
    if (state.fill !== 'none') return
    clearDrag()
    relaxPipelineCollapse.value = false
    if (!state.pipelineCollapsed) {
      state.pipelineCollapsed = true
      commit()
    }
  }

  function expandPipelineColumn(): void {
    if (state.fill !== 'none') return
    clearDrag()
    if (settingsOpen) relaxPipelineCollapse.value = true
    if (state.pipelineCollapsed) {
      state.pipelineCollapsed = false
      commit()
    }
  }

  function togglePipelineCollapsed(): void {
    if (state.pipelineCollapsed) expandPipelineColumn()
    else collapsePipelineColumn()
  }

  function toggleAgentCollapsed(): void {
    if (state.fill !== 'none') return
    clearDrag()
    state.agentCollapsed = !state.agentCollapsed
    commit()
  }

  function enterFill(target: 'main' | 'agent'): void {
    if (state.fill === target || state.fill !== 'none') return
    clearDrag()
    state.beforeFill = {
      ratios: { ...state.ratios },
      pipelineCollapsed: state.pipelineCollapsed,
      agentCollapsed: state.agentCollapsed,
    }
    state.fill = target
    commit()
  }

  function exitFill(): void {
    if (state.fill === 'none') return
    clearDrag()
    const snap = state.beforeFill
    if (snap) {
      state.ratios = { ...snap.ratios }
      state.pipelineCollapsed = snap.pipelineCollapsed
      state.agentCollapsed = snap.agentCollapsed
    }
    state.fill = 'none'
    state.beforeFill = null
    commit()
  }

  function canDragSplitter(side: SplitterSide): boolean {
    const layout = pixelLayout()
    if (layout.fill !== 'none') return false
    if (side === 'left') return !layout.pipelineCollapsed
    return !layout.agentCollapsed
  }

  function beginSplitterDrag(side: SplitterSide, clientX: number): void {
    if (dragOrigin || !canDragSplitter(side)) return
    const current = computeColumnPixels(bodyWidth.value, pixelLayout())
    const pixels = {
      pipeline: current.pipeline,
      main: current.main,
      agent: current.agent,
    }
    dragOrigin = { x: clientX, pixels }
    draggingSide.value = side
    preview.value = { ...pixels }
    setDragCursor(true)
  }

  function updateSplitterDrag(clientX: number): void {
    if (!dragOrigin || !draggingSide.value) return
    preview.value = moveSplitter(dragOrigin.pixels, draggingSide.value, clientX - dragOrigin.x)
  }

  function endSplitterDrag(): void {
    const origin = dragOrigin
    const pixels = preview.value
    clearDrag()
    if (!origin || !pixels) return
    const changed =
      pixels.pipeline !== origin.pixels.pipeline ||
      pixels.main !== origin.pixels.main ||
      pixels.agent !== origin.pixels.agent
    if (!changed) return
    const shown = pixelLayout()
    state.ratios = ratiosFromExpandedPixels(state.ratios, pixels, {
      pipeline: shown.pipelineCollapsed,
      agent: shown.agentCollapsed,
    })
    commit()
  }

  return {
    fill: computed(() => state.fill),
    pipelineCollapsed: computed(() => state.pipelineCollapsed),
    pipelineColumnCollapsed: computed(() => state.pipelineCollapsed && !relaxPipelineCollapse.value),
    agentCollapsed: computed(() => state.agentCollapsed),
    widths,
    draggingSide,
    setBodyWidth,
    noteSettingsOpen,
    collapsePipelineColumn,
    expandPipelineColumn,
    togglePipelineCollapsed,
    toggleAgentCollapsed,
    enterFill,
    exitFill,
    canDragSplitter,
    beginSplitterDrag,
    updateSplitterDrag,
    endSplitterDrag,
    getLayout: readLayout,
    getWidths: displayedWidths,
  }
}

export type WorkspaceLayoutController = ReturnType<typeof createWorkspaceLayout>

let shared: WorkspaceLayoutController | null = null

export function useWorkspaceLayout(): WorkspaceLayoutController {
  if (!shared) shared = createWorkspaceLayout()
  return shared
}
