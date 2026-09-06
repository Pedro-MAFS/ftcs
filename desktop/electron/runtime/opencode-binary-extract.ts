import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { OPENCODE_BINARY_INSTALL } from './opencode-binary-install-types'

const execFileAsync = promisify(execFile)

async function extractZipWithTar(
  zipPath: string,
  stagingDir: string,
): Promise<void> {
  await fs.mkdir(stagingDir, { recursive: true })
  await execFileAsync(
    'tar.exe',
    ['-xf', zipPath, '-C', stagingDir],
    {
      windowsHide: true,
      timeout: OPENCODE_BINARY_INSTALL.installTimeoutMs,
    },
  )
}

/**
 * 解压 zip 到 staging，校验 opencode.exe，再原子写入 targetDir。
 */
export async function installOpenCodeBinaryFromZip(
  zipPath: string,
  stagingDir: string,
  destExe: string,
): Promise<void> {
  await fs.rm(stagingDir, { recursive: true, force: true }).catch(() => undefined)
  await extractZipWithTar(zipPath, stagingDir)

  const stagedExe = path.join(stagingDir, OPENCODE_BINARY_INSTALL.zipEntryExe)
  try {
    await fs.access(stagedExe)
  } catch {
    throw new Error(
      `zip 内未找到 ${OPENCODE_BINARY_INSTALL.zipEntryExe}`,
    )
  }

  const destDir = path.dirname(destExe)
  const destTmp = `${destExe}.tmp`
  await fs.mkdir(destDir, { recursive: true })
  await fs.copyFile(stagedExe, destTmp)
  await fs.rename(destTmp, destExe)
  await fs.writeFile(
    path.join(destDir, OPENCODE_BINARY_INSTALL.markerFileName),
    `${OPENCODE_BINARY_INSTALL.version}\n`,
    'utf8',
  )

  await fs
    .rm(path.join(destDir, 'node_modules'), { recursive: true, force: true })
    .catch(() => undefined)
}
