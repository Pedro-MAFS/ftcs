import { execFile, spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import path from 'node:path'
import { createRequire } from 'node:module'
import { promisify } from 'node:util'

const exec = promisify(execFile)

export interface NodeRuntime { exe: string; npm: string; version: string; npmVersion: string; source: string }
export function siteEnv(nodeExe: string): NodeJS.ProcessEnv {
  const keep = new Set(['PATH', 'HOME', 'USER', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP', 'TMPDIR', 'LANG', 'LC_ALL', 'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'ALL_PROXY'])
  const env: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(process.env)) if (keep.has(key.toUpperCase()) && value !== undefined) env[key] = value
  const pathKey = Object.keys(env).find(key => key.toUpperCase() === 'PATH') || 'PATH'
  env[pathKey] = [path.dirname(nodeExe), env[pathKey] || ''].join(path.delimiter)
  return env
}

export async function resolveSiteNode(node: { exe: string; source: string } | null, projectPath: string): Promise<NodeRuntime> {
  if (!node) throw new Error('未找到可用的 Node，请在 FTCS 运行环境设置中检查或准备 Node。')
  const exe = path.resolve(node.exe)
  const dir = path.dirname(exe)
  const candidates = [path.join(dir, 'node_modules/npm/bin/npm-cli.js'), path.resolve(dir, '../lib/node_modules/npm/bin/npm-cli.js')]
  // Node may be reached through a symlink while npm is installed beside its real location.
  try {
    const realDir = path.dirname(fs.realpathSync(exe))
    candidates.push(path.join(realDir, 'node_modules/npm/bin/npm-cli.js'), path.resolve(realDir, '../lib/node_modules/npm/bin/npm-cli.js'))
  } catch { /* report as an invalid runtime below */ }
  const npm = candidates.find(candidate => fs.existsSync(candidate))
  if (!npm) throw new Error('配置的 Node 未找到配套 npm，请重新配置运行环境。')
  const env = siteEnv(exe)
  let version: string, npmVersion: string
  try {
    const [n, p] = await Promise.all([
      exec(exe, ['--version'], { env, timeout: 10000, windowsHide: true }),
      exec(exe, [npm, '--version'], { env, timeout: 10000, windowsHide: true }),
    ])
    version = n.stdout.trim(); npmVersion = p.stdout.trim()
    if (!/^v?\d+\.\d+\.\d+/.test(version) || !npmVersion) throw new Error('版本不可用')
  } catch { throw new Error('配置的 Node/npm 无法运行，请检查运行环境。') }
  const pkg = JSON.parse(fs.readFileSync(path.join(projectPath, 'package.json'), 'utf8'))
  if (typeof pkg?.engines?.node === 'string' && pkg.engines.node.trim()) {
    try {
      const semver = createRequire(npm)('semver') as { validRange: (s: string) => string | null; satisfies: (v: string, r: string) => boolean }
      if (!semver.validRange(pkg.engines.node)) throw new Error('项目 Node 版本要求格式无效，请检查 package.json。')
      if (!semver.satisfies(version, pkg.engines.node)) throw new Error(`项目要求 Node ${pkg.engines.node}，当前为 ${version}。`)
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('项目')) throw error
      throw new Error('无法检查项目所需 Node 版本，请检查配套 npm。')
    }
  }
  return { exe, npm, version, npmVersion, source: node.source }
}

export function spawnNpm(runtime: NodeRuntime, cwd: string, args: string[]): ChildProcess {
  return spawn(runtime.exe, [runtime.npm, ...args], { cwd, env: siteEnv(runtime.exe), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, detached: process.platform !== 'win32' })
}

export async function reservePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') { server.close(); reject(new Error('无法选择本地端口。')); return }
      server.close(error => error ? reject(error) : resolve(address.port))
    })
  })
}

export function localPreviewUrl(input: string): string | null {
  try {
    const url = new URL(input.trim())
    if (!['http:', 'https:'].includes(url.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname.toLowerCase()) || !url.port || url.username || url.password) return null
    return url.toString()
  } catch { return null }
}

export async function responds(url: string): Promise<boolean> {
  return new Promise(resolve => {
    const request = (url.startsWith('https:') ? https : http).get(url, { timeout: 1500 }, response => { response.resume(); resolve(true) })
    request.once('timeout', () => { request.destroy(); resolve(false) })
    request.once('error', () => resolve(false))
  })
}

/** Returns false when ownership cannot be proven; it never treats an HTTP response as proof. */
export async function ownsPort(rootPid: number, port: number): Promise<boolean> {
  try {
    let relations: Array<[number, number]> = [], listeners: number[] = []
    if (process.platform === 'win32') {
      const [processes, sockets] = await Promise.all([
        exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId | ConvertTo-Json -Compress'], { timeout: 8000, windowsHide: true }),
        exec('netstat.exe', ['-ano', '-p', 'tcp'], { timeout: 8000, windowsHide: true }),
      ])
      const rows = JSON.parse(processes.stdout); relations = (Array.isArray(rows) ? rows : [rows]).map((r: { ProcessId: number; ParentProcessId: number }) => [Number(r.ProcessId), Number(r.ParentProcessId)])
      listeners = sockets.stdout.split(/\r?\n/).map(line => line.trim().split(/\s+/)).filter(cols => cols.length >= 5 && cols[0]?.toUpperCase() === 'TCP' && cols[1]?.endsWith(`:${port}`) && cols[3]?.toUpperCase() === 'LISTENING').map(cols => Number(cols[4]))
    } else {
      const [processes, sockets] = await Promise.all([
        exec('ps', ['-A', '-o', 'pid=', '-o', 'ppid='], { timeout: 5000 }),
        exec('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], { timeout: 5000 }),
      ])
      relations = processes.stdout.split(/\r?\n/).map(line => line.trim().split(/\s+/).map(Number)).filter(row => row.length === 2 && row.every(Number.isFinite)) as Array<[number, number]>
      listeners = sockets.stdout.trim().split(/\s+/).map(Number)
    }
    const descendants = new Set([rootPid])
    for (let changed = true; changed;) {
      changed = false
      for (const [pid, parent] of relations) if (descendants.has(parent) && !descendants.has(pid)) { descendants.add(pid); changed = true }
    }
    return listeners.length > 0 && listeners.every(pid => descendants.has(pid))
  } catch { return false }
}

export async function stopProcess(child: ChildProcess): Promise<boolean> {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return true
  const pid = child.pid
  try {
    if (process.platform === 'win32') {
      await exec('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { timeout: 10000, windowsHide: true })
    } else {
      process.kill(-pid, 'SIGTERM')
      await Promise.race([new Promise<void>(resolve => child.once('exit', () => resolve())), new Promise<void>(resolve => setTimeout(resolve, 2000))])
      // Descendants can outlive npm; the isolated process group still identifies this run.
      try { process.kill(-pid, 'SIGKILL') } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error }
    }
    return true
  } catch (error) { return (error as NodeJS.ErrnoException).code === 'ESRCH' }
}
