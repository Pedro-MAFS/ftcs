import fs from 'node:fs'
import path from 'node:path'

function formatDate(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}${month}${day}`
}

/** 与 lead-store.product_generate_id 规则一致：prod_{YYYYMMDD}_{seq} */
export function generateProductId(workspaceRoot: string, date = new Date()): string {
  const datePart = formatDate(date)
  const prefix = `prod_${datePart}_`
  const productsDir = path.join(workspaceRoot, 'data', 'products')
  fs.mkdirSync(productsDir, { recursive: true })

  let entries: string[] = []
  try {
    entries = fs.readdirSync(productsDir)
  } catch {
    entries = []
  }

  const seqNumbers = entries
    .filter((name) => name.startsWith(prefix))
    .map((name) => Number.parseInt(name.slice(prefix.length), 10))
    .filter((value) => Number.isFinite(value))

  const nextSeq = (seqNumbers.length > 0 ? Math.max(...seqNumbers) : 0) + 1
  return `${prefix}${String(nextSeq).padStart(3, '0')}`
}
