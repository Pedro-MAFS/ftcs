/**
 * 官方 Places Key 只留在主进程内存。不写磁盘。
 * 同一次开跑可留到 expiresAt 与运行结束中较早的时刻（O12 推荐）。
 */

export interface PlacesOfficialKeyHold {
  apiKey: string
  expiresAt: string | null
  keyVersion: string | null
  heldForRunId: string
  heldAt: number
}

export const PLACES_KEY_ARMING_RUN_ID = 'pending-start'
/** 预检取到的 Key，若没有随后的运行来认领，到点丢掉。 */
export const PLACES_KEY_ARMING_TTL_MS = 3 * 60 * 1000

export interface PlacesOfficialKeyMemory {
  hold(entry: PlacesOfficialKeyHold): void
  peek(runId: string, now: number): PlacesOfficialKeyHold | null
  clear(): void
}

function expired(entry: PlacesOfficialKeyHold, now: number): boolean {
  if (!entry.expiresAt) return false
  const at = Date.parse(entry.expiresAt)
  if (!Number.isFinite(at)) return false
  return at <= now
}

export function createPlacesOfficialKeyMemory(): PlacesOfficialKeyMemory {
  let held: PlacesOfficialKeyHold | null = null

  return {
    hold(entry: PlacesOfficialKeyHold): void {
      held = {
        apiKey: entry.apiKey,
        expiresAt: entry.expiresAt,
        keyVersion: entry.keyVersion,
        heldForRunId: entry.heldForRunId,
        heldAt: entry.heldAt,
      }
    },
    peek(runId: string, now: number): PlacesOfficialKeyHold | null {
      if (!held) return null
      if (expired(held, now)) {
        held = null
        return null
      }
      if (
        held.heldForRunId === PLACES_KEY_ARMING_RUN_ID &&
        now - held.heldAt > PLACES_KEY_ARMING_TTL_MS
      ) {
        held = null
        return null
      }
      if (held.heldForRunId === runId) return held
      if (
        held.heldForRunId === PLACES_KEY_ARMING_RUN_ID &&
        runId !== PLACES_KEY_ARMING_RUN_ID
      ) {
        held = { ...held, heldForRunId: runId }
        return held
      }
      held = null
      return null
    },
    clear(): void {
      held = null
    },
  }
}

export const placesOfficialKeyMemory = createPlacesOfficialKeyMemory()
