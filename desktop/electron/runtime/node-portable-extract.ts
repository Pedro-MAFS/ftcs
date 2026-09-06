import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { NODE_PORTABLE_INSTALL } from './node-portable-install-types'

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
      timeout: NODE_PORTABLE_INSTALL.installTimeoutMs,
    },
  )
}

export function getExpectedInnerDir(stagingDir: string): string {
  return path.join(stagingDir, NODE_PORTABLE_INSTALL.zipInnerDirName)
}

async function copyDirContents(srcDir: string, destDir: string): Promise<void> {
  await fs.mkdir(destDir, { recursive: true })
  const entries = await fs.readdir(srcDir, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name)
    const destPath = path.join(destDir, entry.name)
    if (entry.isDirectory()) {
      await fs.cp(srcPath, destPath, { recursive: true })
    } else if (entry.isFile()) {
      await fs.copyFile(srcPath, destPath)
    }
  }
}

/**
 * 解压 zip 到 staging，校验内层 node.exe，再将内层内容复制到 targetDir。
 */
export async function installNodePortableFromZip(
  zipPath: string,
  stagingDir: string,
  targetDir: string,
): Promise<void> {
  await fs.rm(stagingDir, { recursive: true, force: true }).catch(() => undefined)
  await extractZipWithTar(zipPath, stagingDir)

  const innerDir = getExpectedInnerDir(stagingDir)
  const nodeExe = path.join(innerDir, NODE_PORTABLE_INSTALL.nodeExeName)
  try {
    await fs.access(nodeExe)
  } catch {
    throw new Error(
      `zip 内未找到 ${NODE_PORTABLE_INSTALL.zipInnerDirName}/${NODE_PORTABLE_INSTALL.nodeExeName}`,
    )
  }

  let backupDir: string | null = null
  try {
    await fs.access(targetDir)
    backupDir = `${targetDir}.bak-${Date.now()}`
    await fs.rename(targetDir, backupDir)
  } catch {
    // target 不存在
  }

  try {
    await copyDirContents(innerDir, targetDir)
    await fs.writeFile(
      path.join(targetDir, NODE_PORTABLE_INSTALL.markerFileName),
      `${NODE_PORTABLE_INSTALL.version}\n`,
      'utf8',
    )
    if (backupDir) {
      await fs.rm(backupDir, { recursive: true, force: true }).catch(() => undefined)
    }
  } catch (err) {
    await fs.rm(targetDir, { recursive: true, force: true }).catch(() => undefined)
    if (backupDir) {
      try {
        await fs.rename(backupDir, targetDir)
      } catch {
        // restore failed
      }
    }
    throw err
  }
}
