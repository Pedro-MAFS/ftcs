/**
 * 从仓库 workspace/ 生成 desktop/resources/workspace-template/
 * 供 electron-builder extraResources 打入安装包。
 *
 * 排除：node_modules、.env、业务 data（保留 _example）、日志与 IDE 缓存。
 * 要求：lead-store / search-api 已存在 dist/mcp.js。
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const desktopRoot = path.resolve(__dirname, '..')
const repoRoot = path.resolve(desktopRoot, '..')
const sourceRoot = path.join(repoRoot, 'workspace')
const destRoot = path.join(desktopRoot, 'resources', 'workspace-template')
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'

const REQUIRED_MCP = ['lead-store', 'search-api', 'places-api']

const SKIP_DIR_NAMES = new Set([
  'node_modules',
  '.git',
  '.opencode',
  '.cursor',
  'logs',
  'coverage',
  '__pycache__',
])

const SKIP_FILE_NAMES = new Set(['.env', '.DS_Store', 'Thumbs.db'])

function rmrf(dir) {
  fs.rmSync(dir, { recursive: true, force: true })
}

function shouldSkipDir(name) {
  return SKIP_DIR_NAMES.has(name)
}

function shouldSkipFile(name) {
  if (SKIP_FILE_NAMES.has(name)) return true
  if (name.endsWith('.log')) return true
  return false
}

/**
 * 业务 data：只保留 products/_example，其余跳过。
 */
function copyDataDir(srcData, destData) {
  const exampleSrc = path.join(srcData, 'products', '_example')
  if (!fs.existsSync(exampleSrc)) {
    console.warn('[prepare-template] 无 data/products/_example，跳过示例产品')
    return
  }
  const exampleDest = path.join(destData, 'products', '_example')
  copyDirFiltered(exampleSrc, exampleDest)
}

function copyDirFiltered(src, dest) {
  if (!fs.existsSync(src)) return
  fs.mkdirSync(dest, { recursive: true })

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (shouldSkipDir(entry.name)) continue
      copyDirFiltered(path.join(src, entry.name), path.join(dest, entry.name))
      continue
    }
    if (!entry.isFile()) continue
    if (shouldSkipFile(entry.name)) continue
    fs.copyFileSync(path.join(src, entry.name), path.join(dest, entry.name))
  }
}

function assertMcpBundles() {
  const missing = []
  for (const name of REQUIRED_MCP) {
    const entry = path.join(sourceRoot, 'mcp-servers', name, 'dist', 'mcp.js')
    if (!fs.existsSync(entry)) missing.push(entry)
  }
  if (missing.length > 0) {
    console.error('[prepare-template] 缺少 MCP 预打包产物，请先执行 npm run build:mcp：')
    for (const m of missing) console.error(`  - ${m}`)
    process.exit(1)
  }
}

function main() {
  if (!fs.existsSync(sourceRoot)) {
    console.error(`[prepare-template] 找不到模板源: ${sourceRoot}`)
    process.exit(1)
  }

  assertMcpBundles()

  console.log(`[prepare-template] 清空 ${destRoot}`)
  rmrf(destRoot)
  fs.mkdirSync(destRoot, { recursive: true })

  // 托管目录（与 MANAGED_WORKSPACE_DIRS 一致）
  for (const dir of ['skills', 'mcp-servers', 'config']) {
    const from = path.join(sourceRoot, dir)
    const to = path.join(destRoot, dir)
    if (!fs.existsSync(from)) {
      console.error(`[prepare-template] 缺少目录: ${from}`)
      process.exit(1)
    }
    console.log(`[prepare-template] 复制 ${dir}/`)
    copyDirFiltered(from, to)
  }

  const envExample = path.join(sourceRoot, '.env.example')
  if (fs.existsSync(envExample)) {
    fs.copyFileSync(envExample, path.join(destRoot, '.env.example'))
    console.log('[prepare-template] 复制 .env.example')
  }

  const readme = path.join(sourceRoot, 'README.md')
  if (fs.existsSync(readme)) {
    fs.copyFileSync(readme, path.join(destRoot, 'README.md'))
  }

  const agents = path.join(sourceRoot, 'AGENTS.md')
  if (fs.existsSync(agents)) {
    fs.copyFileSync(agents, path.join(destRoot, 'AGENTS.md'))
    console.log('[prepare-template] 复制 AGENTS.md')
  }

  const srcData = path.join(sourceRoot, 'data')
  if (fs.existsSync(srcData)) {
    console.log('[prepare-template] 复制 data/products/_example/')
    copyDataDir(srcData, path.join(destRoot, 'data'))
  }

  // 最终校验打入模板的 MCP
  for (const name of REQUIRED_MCP) {
    const entry = path.join(destRoot, 'mcp-servers', name, 'dist', 'mcp.js')
    if (!fs.existsSync(entry)) {
      console.error(`[prepare-template] 模板内仍缺少 ${entry}`)
      process.exit(1)
    }
  }

  console.log(`[prepare-template] 完成 → ${destRoot}`)

  const placesApiDest = path.join(destRoot, 'mcp-servers', 'places-api')
  if (fs.existsSync(path.join(placesApiDest, 'package.json'))) {
    console.log('[prepare-template] places-api: npm install --omit=dev（打入 node_modules，用户机不再 install）')
    execFileSync(npmCmd, ['install', '--omit=dev'], {
      cwd: placesApiDest,
      stdio: 'inherit',
      env: process.env,
      windowsHide: true,
      shell: process.platform === 'win32',
    })
    for (const dep of ['undici', 'socks-proxy-agent']) {
      const pkg = path.join(placesApiDest, 'node_modules', dep, 'package.json')
      if (!fs.existsSync(pkg)) {
        console.error(`[prepare-template] places-api 缺少 node_modules/${dep}，请检查 npm install`)
        process.exit(1)
      }
    }
    console.log('[prepare-template] places-api: node_modules 已就绪')
  }
}

main()
