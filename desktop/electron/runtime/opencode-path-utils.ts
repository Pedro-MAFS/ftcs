import path from 'node:path'

export function isOpenCodePathUnderRuntimeDir(
  exePath: string,
  runtimeDir: string,
): boolean {
  const resolvedExe = path.resolve(exePath)
  const resolvedRuntime = path.resolve(runtimeDir)
  return path.dirname(resolvedExe).toLowerCase() === resolvedRuntime.toLowerCase()
}
