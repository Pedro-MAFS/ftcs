/**
 * 从 build/icon.png 生成合法的 build/icon.ico（勿用 PowerShell `>` 重定向写二进制）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pngToIco from 'png-to-ico'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const buildDir = path.resolve(__dirname, '../build')
const pngPath = path.join(buildDir, 'icon.png')
const icoPath = path.join(buildDir, 'icon.ico')

if (!fs.existsSync(pngPath)) {
  console.error(`[make-icon] 缺少 ${pngPath}`)
  process.exit(1)
}

const buf = await pngToIco(pngPath)
fs.writeFileSync(icoPath, buf)
console.log(`[make-icon] 已写入 ${icoPath} (${buf.length} bytes)`)
