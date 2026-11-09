/**
 * TV-SITE-01 experimental harness. All files are generated beneath one fresh
 * system temporary directory. This is not a production sandbox.
 */
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ftcs-tv-site-01-'))
const site = path.join(root, 'site')
const outside = path.join(root, 'outside')
fs.mkdirSync(site)
fs.mkdirSync(outside)
const results = []
const children = new Set()
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const viteBin = path.join(repo, 'desktop', 'node_modules', 'vite', 'bin', 'vite.js')

function record(id, status, detail) {
  results.push({ id, status, detail })
  console.log(JSON.stringify({ id, status, detail }))
}
function write(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, data, 'utf8')
}
function run(executable, args, options = {}) {
  return spawnSync(executable, args, {
    cwd: site,
    encoding: 'utf8',
    timeout: 20000,
    windowsHide: true,
    ...options,
  })
}
function npmRun(args, options = {}) {
  if (process.platform === 'win32') {
    return run(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'npm', ...args], options)
  }
  return run(npm, args, options)
}
function within(parent, target) {
  const relative = path.relative(parent, target)
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep))
}
async function listen(server, port = 0) {
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', resolve)
  })
  return server.address().port
}
async function httpGet(port) {
  const response = await fetch('http://127.0.0.1:' + port + '/', { signal: AbortSignal.timeout(3000) })
  return { status: response.status, text: await response.text() }
}
async function stopTree(child) {
  if (!child.pid) return
  if (process.platform === 'win32') {
    const result = spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { encoding: 'utf8', windowsHide: true })
    if (result.status !== 0 && child.exitCode === null) throw new Error('taskkill failed: ' + result.stderr)
  } else {
    try { process.kill(-child.pid, 'SIGTERM') } catch (error) {
      if (error.code !== 'ESRCH') throw error
    }
  }
  if (child.exitCode === null && child.signalCode === null) {
    await Promise.race([new Promise(resolve => child.once('exit', resolve)), delay(5000)])
  }
}
function startNpmPreview(args = ['run', 'dev', '--', '0', 'strict']) {
  const command = process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : npm
  const launchArgs = process.platform === 'win32'
    ? ['/d', '/s', '/c', 'npm', ...args]
    : args
  const child = spawn(command, launchArgs, {
    cwd: site,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    detached: process.platform !== 'win32',
    env: { ...process.env },
  })
  children.add(child)
  child.once('exit', () => children.delete(child))
  return child
}
function startPreview(port, mode = 'strict') {
  const child = spawn(process.execPath, [path.join(site, 'preview.mjs'), String(port), mode], {
    cwd: site,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    detached: process.platform !== 'win32',
    env: { PATH: process.env.PATH || '', SystemRoot: process.env.SystemRoot || '' },
  })
  children.add(child)
  child.once('exit', () => children.delete(child))
  return child
}
async function readReady(child, expectedPort) {
  let data = ''
  let errors = ''
  return new Promise((resolve, reject) => {
    let polling = false
    const timer = setTimeout(() => finish(new Error('preview readiness timed out; stdout: ' + data.slice(-1000) + '; stderr: ' + errors.slice(-1000))), 20000)
    const poll = expectedPort ? setInterval(async () => {
      if (polling) return
      polling = true
      try {
        const reply = await httpGet(expectedPort)
        if (reply.status === 200) finish(null, expectedPort)
      } catch {} finally { polling = false }
    }, 250) : undefined
    let finished = false
    function finish(error, value) {
      if (finished) return
      finished = true
      clearTimeout(timer)
      if (poll) clearInterval(poll)
      child.stdout.off('data', onData)
      child.stderr.off('data', onError)
      child.off('exit', onExit)
      if (error) reject(error)
      else resolve(value)
    }
    function onData(chunk) {
      data += chunk.toString()
      const clean = data.replace(/\x1b\[[0-9;]*m/g, '')
      const match = clean.match(/READY (\d+)/) || clean.match(/https?:\/\/127\.0\.0\.1:(\d+)\//)
      if (match) finish(null, Number(match[1]))
    }
    function onError(chunk) { errors += chunk.toString() }
    function onExit(code) { finish(new Error('preview exited ' + code + ': ' + errors.trim())) }
    child.stdout.on('data', onData)
    child.stderr.on('data', onError)
    child.once('exit', onExit)
  })
}
async function portClosed(port) {
  for (let i = 0; i < 30; i++) {
    try { await fetch('http://127.0.0.1:' + port, { signal: AbortSignal.timeout(300) }) }
    catch { return true }
    await delay(100)
  }
  return false
}

write(path.join(site, 'package.json'), JSON.stringify({
  name: 'ftcs-tv-site-fixture',
  private: true,
  version: '1.0.0',
  scripts: { dev: 'node preview.mjs', build: 'node build.mjs', 'node-version': 'node --version', 'node-path': 'node -p process.execPath', preinstall: 'node probe-install.mjs', 'probe-script': 'node probe-write.mjs' },
}, null, 2))
write(path.join(site, 'index.html'), '<!doctype html><title>FTCS preview fixture</title><h1>FTCS fixture</h1>')
write(path.join(site, 'build.mjs'), "import fs from 'node:fs'; fs.mkdirSync('dist',{recursive:true}); fs.copyFileSync('index.html','dist/index.html');")
write(path.join(site, 'preview.mjs'), `
import http from 'node:http'
import fs from 'node:fs'
import { spawn } from 'node:child_process'
if (process.argv[4] === 'tree') {
  const child = spawn(process.execPath, ['linger.mjs'], { stdio: 'ignore' })
  fs.writeFileSync('grandchild.pid', String(child.pid))
}
const requested = Number(process.argv[2])
const mode = process.argv[3]
const server = http.createServer((req,res) => {
  if (req.url === '/crash') { res.end('crashing'); setTimeout(() => process.exit(42), 10); return }
  res.writeHead(200,{'content-type':'text/html'}); res.end(fs.readFileSync('index.html'))
})
server.on('error', error => {
  if (error.code === 'EADDRINUSE' && mode === 'fallback') server.listen(0, '127.0.0.1')
  else { console.error(error.code); process.exitCode = 1 }
})
server.listen(requested, '127.0.0.1', () => console.log('READY ' + server.address().port))
`)
write(path.join(site, 'linger.mjs'), 'setInterval(() => {}, 1000)')
write(path.join(site, 'probe-install.mjs'), "import fs from 'node:fs'; fs.writeFileSync('../outside/install-script.txt', 'fixture')")
write(path.join(site, 'probe-write.mjs'), `
import fs from 'node:fs'
import path from 'node:path'
fs.writeFileSync(path.join(process.cwd(),'..','outside','npm-escaped.txt'),'fixture')
`)
write(path.join(site, 'permissions.mjs'), `
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
const parent = path.resolve(process.cwd(), '..')
const outside = path.join(parent, 'outside')
let direct
try { fs.writeFileSync(path.join(outside,'direct.txt'),'fixture'); direct='allowed' }
catch (e) { direct=e.code }
let symlink
try { fs.writeFileSync(path.join(process.cwd(),'link','symlink.txt'),'fixture'); symlink='allowed' }
catch (e) { symlink=e.code }
let relativeSymlink
try { fs.writeFileSync(path.join(process.cwd(),'relative-link','relative.txt'),'fixture'); relativeSymlink='allowed' }
catch (e) { relativeSymlink=e.code }
const target=path.join(outside,'child.txt')
const nativeTarget=path.join(outside,'native-copy.txt')
const source=path.join(process.cwd(),'index.html')
let native
if (process.platform==='win32') {
  if (/[&|<>^%!]/.test(source + nativeTarget)) native = { skipped: '临时路径包含 cmd 特殊字符' }
  else native = spawnSync(process.env.ComSpec||'cmd.exe',['/d','/s','/c','copy /y "'+source+'" "'+nativeTarget+'"'],{encoding:'utf8',env:{SystemRoot:process.env.SystemRoot||'',PATH:process.env.PATH||''}})
} else {
  native = spawnSync('/bin/cp',[source,nativeTarget],{encoding:'utf8'})
}
const code='require("node:fs").writeFileSync('+JSON.stringify(target)+',"fixture")'
const child=spawnSync(process.execPath,['-e',code],{encoding:'utf8',env:{PATH:process.env.PATH||'',SystemRoot:process.env.SystemRoot||''}})
console.log(JSON.stringify({direct,symlink,relativeSymlink,childStatus:child.status,childFile:fs.existsSync(target),nativeStatus:native.status,nativeFile:fs.existsSync(nativeTarget),nativeSkipped:native.skipped,nativeError:(native.stderr||native.error?.message||'').slice(-500),nativeOutput:(native.stdout||'').slice(-500)}))
`)

try {
  const pkg = npmRun(['--version'])
  if (pkg.status !== 0) throw new Error('npm unavailable: ' + (pkg.error?.message || pkg.stderr))
  record('environment', 'observed', { platform: process.platform, arch: process.arch, node: process.version, npm: pkg.stdout.trim() })

  const npmNode = npmRun(['run', 'node-version', '--silent'])
  const npmNodePath = npmRun(['run', 'node-path', '--silent'])
  record('npm-node-version', npmNode.status === 0 && npmNodePath.status === 0 ? 'observed' : 'fail', { node: npmNode.stdout.trim(), executable: npmNodePath.stdout.trim(), exit: npmNode.status, pathExit: npmNodePath.status })

  const installOptions = { env: { ...process.env, npm_config_cache: path.join(root, 'npm-cache') } }
  const ignoredInstall = npmRun(['install', '--offline', '--no-audit', '--no-fund', '--package-lock=false', '--ignore-scripts'], installOptions)
  const installMarker = path.join(outside, 'install-script.txt')
  const ignoredMarker = fs.existsSync(installMarker)
  record('npm-install-ignore-scripts', ignoredInstall.status === 0 && !ignoredMarker ? 'pass' : 'fail', { exit: ignoredInstall.status, outsideFixtureWritten: ignoredMarker, error: ignoredInstall.stderr.trim().slice(-300) })
  const normalInstall = npmRun(['install', '--offline', '--no-audit', '--no-fund', '--package-lock=false'], installOptions)
  const installEscaped = fs.existsSync(installMarker)
  record('npm-install-lifecycle', normalInstall.status === 0 && installEscaped ? 'exposed' : 'inconclusive', { exit: normalInstall.status, outsideFixtureWritten: installEscaped, error: normalInstall.stderr.trim().slice(-300) })

  const build = npmRun(['run', 'build'])
  const html = path.join(site, 'dist', 'index.html')
  record('npm-build', build.status === 0 && fs.existsSync(html) ? 'pass' : 'fail', { exit: build.status, outputExists: fs.existsSync(html), error: build.error?.message || build.stderr.trim().slice(-500) })

  const unsafe = npmRun(['run', 'probe-script'])
  const escaped = fs.existsSync(path.join(outside, 'npm-escaped.txt'))
  record('npm-script-boundary', unsafe.status === 0 && escaped ? 'exposed' : 'inconclusive', { outsideFixtureWritten: escaped, exit: unsafe.status })

  const traversal = path.resolve(site, '..', 'outside', 'test.txt')
  record('lexical-traversal', !within(site, traversal) ? 'pass' : 'fail', { rejected: !within(site, traversal) })

  let symlinkReady = false
  try {
    fs.symlinkSync(outside, path.join(site, 'link'), process.platform === 'win32' ? 'junction' : 'dir')
    symlinkReady = true
    const resolved = fs.realpathSync(path.join(site, 'link'))
    record('symlink-realpath', !within(fs.realpathSync(site), resolved) ? 'pass' : 'fail', { rejected: !within(fs.realpathSync(site), resolved) })
  } catch (error) {
    record('symlink-realpath', 'skipped', { reason: error.code || error.message })
  }

  let relativeLinkReady = false
  try {
    fs.symlinkSync('../outside', path.join(site, 'relative-link'), 'dir')
    relativeLinkReady = true
  } catch (error) {
    record('relative-symlink-setup', 'skipped', { reason: error.code || error.message })
  }

  const permission = run(process.execPath, ['--permission', '--allow-fs-read=*', '--allow-fs-write=' + site, '--allow-child-process', path.join(site, 'permissions.mjs')])
  try {
    const observed = JSON.parse(permission.stdout.trim().split('\n').at(-1))
    record('node-permission', 'observed', { ...observed, symlinkReady, relativeLinkReady, exit: permission.status })
  } catch {
    record('node-permission', 'skipped', { exit: permission.status, error: (permission.stderr || permission.error?.message || '').slice(-500) })
  }

  const viaNpm = startNpmPreview(['run', 'dev', '--', '0', 'strict', 'tree'])
  let grandchildPid
  try {
    const port = await readReady(viaNpm)
    grandchildPid = Number(fs.readFileSync(path.join(site, 'grandchild.pid'), 'utf8'))
    const reply = await httpGet(port)
    record('npm-dev', reply.status === 200 && reply.text.includes('FTCS fixture') ? 'pass' : 'fail', { actualPort: port, httpStatus: reply.status })
    await stopTree(viaNpm)
    const closed = await portClosed(port)
    let grandchildAlive = true
    for (let i = 0; i < 30; i++) {
      try { process.kill(grandchildPid, 0) } catch (error) { if (error.code === 'ESRCH') grandchildAlive = false }
      if (!grandchildAlive) break
      await delay(100)
    }
    record('npm-process-tree-cleanup', closed && !grandchildAlive ? 'pass' : 'fail', { portClosed: closed, grandchildAlive })
    if (!grandchildAlive) grandchildPid = undefined
  } finally {
    await stopTree(viaNpm)
    if (grandchildPid) { try { process.kill(grandchildPid, 'SIGKILL') } catch {} }
  }

  if (fs.existsSync(viteBin)) {
    const fixturePackage = JSON.parse(fs.readFileSync(path.join(site, 'package.json'), 'utf8'))
    const nodeVite = 'node ' + JSON.stringify(viteBin.replace(/\\/g, '/'))
    fixturePackage.scripts.dev = nodeVite + ' --host 127.0.0.1'
    fixturePackage.scripts.build = nodeVite + ' build'
    write(path.join(site, 'package.json'), JSON.stringify(fixturePackage, null, 2))
    fs.rmSync(path.join(site, 'dist'), { recursive: true, force: true })
    const built = npmRun(['run', 'build'])
    record('vite-build', built.status === 0 && fs.existsSync(html) ? 'pass' : 'fail', { exit: built.status, error: built.error?.message || built.stderr.trim().slice(-500) })
    const available = net.createServer()
    const requested = await listen(available)
    await new Promise(resolve => available.close(resolve))
    const vite = startNpmPreview(['run', 'dev', '--', '--port', String(requested), '--strictPort'])
    try {
      const actual = await readReady(vite, requested)
      const reply = await httpGet(actual)
      record('vite-dev', actual === requested && reply.status === 200 && reply.text.includes('FTCS fixture') ? 'pass' : 'fail', { requestedPort: requested, actualPort: actual, httpStatus: reply.status })
      await stopTree(vite)
      const closed = await portClosed(actual)
      record('vite-cleanup', closed ? 'pass' : 'fail', { portClosed: closed })
    } finally { await stopTree(vite) }
  } else {
    record('vite-build', 'skipped', { reason: 'desktop/node_modules/vite 不存在，请在安装依赖后重试' })
    record('vite-dev', 'skipped', { reason: 'desktop/node_modules/vite 不存在，请在安装依赖后重试' })
  }

  const reserved = net.createServer()
  const occupiedPort = await listen(reserved)
  const strict = startPreview(occupiedPort)
  try {
    await readReady(strict)
    record('port-occupied-strict', 'fail', { reason: 'started on occupied port' })
  } catch (error) {
    record('port-occupied-strict', String(error.message).includes('EADDRINUSE') ? 'pass' : 'fail', { message: error.message })
  }
  const fallback = startPreview(occupiedPort, 'fallback')
  try {
    const port = await readReady(fallback)
    const reply = await httpGet(port)
    record('preview-fallback', port !== occupiedPort && reply.status === 200 && reply.text.includes('FTCS fixture') ? 'pass' : 'fail', { occupiedPort, actualPort: port, httpStatus: reply.status })
    await stopTree(fallback)
    const closed = await portClosed(port)
    record('preview-cleanup', closed ? 'pass' : 'fail', { closed })
  } finally {
    await stopTree(fallback)
    reserved.close()
  }

  const abrupt = startPreview(0)
  const abruptPort = await readReady(abrupt)
  const exit = new Promise(resolve => abrupt.once('exit', code => resolve(code)))
  await fetch('http://127.0.0.1:' + abruptPort + '/crash', { signal: AbortSignal.timeout(3000) })
  const exitCode = await Promise.race([exit, delay(5000).then(() => null)])
  const closed = await portClosed(abruptPort)
  record('preview-unexpected-exit', exitCode === 42 && closed ? 'pass' : 'fail', { exitCode, portClosed: closed })
} catch (error) {
  record('harness', 'fail', { message: error.message })
} finally {
  for (const child of children) {
    try { await stopTree(child) } catch (error) { record('cleanup', 'fail', { message: error.message }) }
  }
  try { fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }) }
  catch (error) { record('cleanup', 'fail', { path: root, message: error.message }) }
}
if (results.some(item => item.status === 'fail')) process.exitCode = 1
