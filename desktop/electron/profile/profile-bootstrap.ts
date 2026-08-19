import fs from 'node:fs'
import path from 'node:path'
import { getWorkspaceRoot } from '../config/paths'
import { generateProductId } from './product-id'
import { migrateWebsitesIntoFiles } from '../library/library-website'
import { copyLibrarySourcesToInputs } from './profile-inputs'
import { resolveConfiguredOfficeCli } from '../runtime/officecli-paths'

export interface BootstrapInput {
  websitePaths: string[]
  filePaths: string[]
}

export interface BootstrapResult {
  productId: string
  productDir: string
  inputsDir: string
  websiteUrls: string[]
  inputFiles: string[]
  skipped: string[]
}

/**
 * 从资料库选中项分配产品 ID，并按相对路径复制快照到 data/products/{id}/inputs/。
 * Office 文件在拷贝时抽出侧车文本（US-I-11）。
 */
export async function bootstrapProductFromLibrary(
  input: BootstrapInput,
  workspaceRoot = getWorkspaceRoot(),
): Promise<BootstrapResult> {
  migrateWebsitesIntoFiles(workspaceRoot)
  const websitePaths = [...new Set(input.websitePaths ?? [])]
  const filePaths = [...new Set(input.filePaths ?? [])]
  if (!websitePaths.length && !filePaths.length) {
    throw new Error('请先勾选至少一个公司网站或资料文件')
  }

  const productId = generateProductId(workspaceRoot)
  const productDir = path.join(workspaceRoot, 'data', 'products', productId)
  const inputsDir = path.join(productDir, 'inputs')
  fs.mkdirSync(inputsDir, { recursive: true })

  const filesRoot = path.join(workspaceRoot, 'data', 'library', 'files')
  const copied = await copyLibrarySourcesToInputs(
    productId,
    inputsDir,
    filesRoot,
    websitePaths,
    filePaths,
    { resolveCli: resolveConfiguredOfficeCli },
  )

  if (!copied.websiteUrls.length && !copied.inputFiles.length) {
    fs.rmSync(productDir, { recursive: true, force: true })
    throw new Error(`没有可导入的资料：${copied.skipped.join('；') || '未知原因'}`)
  }

  const manifest = {
    product_id: productId,
    created_at: new Date().toISOString(),
    websites: copied.websiteUrls,
    files: copied.inputFiles,
    skipped: copied.skipped,
    source_inputs: copied.sourceInputs,
  }
  fs.writeFileSync(
    path.join(inputsDir, '_sources.json'),
    JSON.stringify(manifest, null, 2),
    'utf8',
  )

  return {
    productId,
    productDir,
    inputsDir,
    websiteUrls: copied.websiteUrls,
    inputFiles: copied.inputFiles,
    skipped: copied.skipped,
  }
}
