import path from 'node:path'

export function isNodePathUnderRuntimeDir(
  nodePath: string,
  runtimeDir: string,
): boolean {
  const resolvedNode = path.resolve(nodePath)
  const resolvedDir = path.resolve(runtimeDir)
  const nodeDir = path.dirname(resolvedNode).toLowerCase()
  return nodeDir === resolvedDir.toLowerCase()
}
