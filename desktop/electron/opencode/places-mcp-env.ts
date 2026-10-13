/**
 * 交给 places-api 的环境。官方 Key 只在本次注入对象里，不写 process.env。
 * PLACES_PROVIDER 固定 custom。
 */

export type PlacesMcpInjection =
  | { kind: 'default' }
  | { kind: 'official'; apiKey: string }

export interface PlacesMcpEnvInput {
  workspaceRoot: string
  channelMode?: string | null
  envByok?: string | null
  injection: PlacesMcpInjection
}

export function buildPlacesMcpEnvironment(
  input: PlacesMcpEnvInput,
): Record<string, string> {
  const env: Record<string, string> = {
    FTCS_WORKSPACE: input.workspaceRoot,
    PLACES_PROVIDER: 'custom',
  }
  const official = input.channelMode !== 'custom'
  if (official) {
    // 官方通道忽略本机已保存的自备 Key：不注入、不回退。用空串盖掉父进程继承的 GOOGLE_PLACES_API_KEY，不删除磁盘上的值。
    const injected =
      input.injection.kind === 'official' ? input.injection.apiKey.trim() : ''
    env.GOOGLE_PLACES_API_KEY = injected
    return env
  }
  const byok = (input.envByok || '').trim()
  if (byok) env.GOOGLE_PLACES_API_KEY = byok
  return env
}

let desired: PlacesMcpInjection = { kind: 'default' }
let applied: PlacesMcpInjection = { kind: 'default' }

export function getPlacesMcpInjection(): PlacesMcpInjection {
  return desired
}

export function setPlacesMcpInjection(next: PlacesMcpInjection): void {
  if (next.kind !== 'official' && applied.kind === 'official') {
    applied = { kind: 'official', apiKey: '' }
  }
  desired =
    next.kind === 'official'
      ? { kind: 'official', apiKey: next.apiKey }
      : { kind: 'default' }
}

export function placesMcpInjectionKind(): PlacesMcpInjection['kind'] {
  return desired.kind
}

export function placesMcpInjectionNeedsReload(): boolean {
  if (desired.kind !== applied.kind) return true
  if (desired.kind === 'official' && applied.kind === 'official') {
    return desired.apiKey !== applied.apiKey
  }
  return false
}

export function markPlacesMcpInjectionApplied(): void {
  applied =
    desired.kind === 'official'
      ? { kind: 'official', apiKey: desired.apiKey }
      : { kind: 'default' }
}

/** 测试或退出登录时复位，避免官方 Key 留在模块状态里。 */
export function resetPlacesMcpInjectionState(): void {
  desired = { kind: 'default' }
  applied = { kind: 'default' }
}
