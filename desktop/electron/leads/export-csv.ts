import { BrowserWindow, dialog } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

export interface ExportCsvInput {
  content: string
  defaultFileName: string
}

export interface ExportCsvResult {
  ok: boolean
  canceled?: boolean
  path?: string
  message: string
}

/** 写入 UTF-8 BOM，便于 Excel 正确识别中文 */
function withUtf8Bom(content: string): string {
  if (content.charCodeAt(0) === 0xfeff) return content
  return `\uFEFF${content}`
}

export async function saveCsvWithDialog(
  input: ExportCsvInput,
  parent?: BrowserWindow | null,
): Promise<ExportCsvResult> {
  const defaultFileName = (input.defaultFileName || 'leads.csv').replace(
    /[<>:"/\\|?*\u0000-\u001f]/g,
    '_',
  )
  const content = typeof input.content === 'string' ? input.content : ''
  if (!content.trim()) {
    return { ok: false, message: '导出内容为空' }
  }

  const options = {
    title: '导出线索 CSV',
    defaultPath: defaultFileName,
    filters: [
      { name: 'CSV', extensions: ['csv'] },
      { name: '所有文件', extensions: ['*'] },
    ],
  }

  const result = parent
    ? await dialog.showSaveDialog(parent, options)
    : await dialog.showSaveDialog(options)

  if (result.canceled || !result.filePath) {
    return { ok: true, canceled: true, message: '已取消导出' }
  }

  try {
    const filePath = result.filePath.endsWith('.csv')
      ? result.filePath
      : `${result.filePath}.csv`
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, withUtf8Bom(content), 'utf8')
    return {
      ok: true,
      path: filePath,
      message: `已导出 ${path.basename(filePath)}`,
    }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    }
  }
}
