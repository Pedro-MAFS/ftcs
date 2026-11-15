type Result<T> = { ok: true; value: T } | { ok: false; message: string }

export type ReleaseFlowResult<T> =
  | { status: 'complete'; value: T; noChanges: boolean }
  | { status: 'prepare-error' | 'commit-error'; message: string }
  | { status: 'stopped' }

/** A user-initiated release checks the snapshot before committing it. */
export async function runSiteRelease<P extends { id: string; noChanges: boolean }, T>(options: {
  prepare: () => Promise<Result<P>>
  commit: (id: string) => Promise<Result<T>>
  isCurrent: () => boolean
  onCommit: () => void
}): Promise<ReleaseFlowResult<T>> {
  let prepared: Result<P>
  try { prepared = await options.prepare() }
  catch { return options.isCurrent() ? { status: 'prepare-error', message: '构建检查未完成，请检查后重试。' } : { status: 'stopped' } }
  if (!options.isCurrent()) return { status: 'stopped' }
  if (!prepared.ok) return { status: 'prepare-error', message: prepared.message }
  options.onCommit()
  try {
    const result = await options.commit(prepared.value.id)
    if (!options.isCurrent()) return { status: 'stopped' }
    return result.ok
      ? { status: 'complete', value: result.value, noChanges: prepared.value.noChanges }
      : { status: 'commit-error', message: result.message }
  } catch {
    return options.isCurrent() ? { status: 'commit-error', message: '提交结果未知。' } : { status: 'stopped' }
  }
}
