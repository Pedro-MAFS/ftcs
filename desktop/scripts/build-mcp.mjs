/**
 * 构建仓库 workspace/mcp-servers 下自包含 dist/mcp.js。
 * 发版与本地 dist 前调用。
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../..')
const MCP_NAMES = ['lead-store', 'search-api', 'places-api', 'hunter-api']
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'

function runNpm(cwd, args) {
  execFileSync(npmCmd, args, {
    cwd,
    stdio: 'inherit',
    env: process.env,
    windowsHide: true,
    shell: process.platform === 'win32',
  })
}

for (const name of MCP_NAMES) {
  const cwd = path.join(repoRoot, 'workspace', 'mcp-servers', name)
  const pkg = path.join(cwd, 'package.json')
  if (!fs.existsSync(pkg)) {
    console.error(`[build-mcp] 缺少 ${pkg}`)
    process.exit(1)
  }
  console.log(`[build-mcp] ${name}: npm install`)
  runNpm(cwd, ['install'])
  console.log(`[build-mcp] ${name}: npm run build`)
  runNpm(cwd, ['run', 'build'])
  const entry = path.join(cwd, 'dist', 'mcp.js')
  if (!fs.existsSync(entry)) {
    console.error(`[build-mcp] ${name}: build 后仍缺少 dist/mcp.js`)
    process.exit(1)
  }
  console.log(`[build-mcp] ${name}: ok → ${entry}`)
}

console.log('[build-mcp] 全部 MCP 已就绪')
