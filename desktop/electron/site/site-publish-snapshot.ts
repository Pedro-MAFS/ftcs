import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import ignore, { type Ignore } from 'ignore'
import { resolveSiteNode, spawnNpm, stopProcess, type NodeRuntime } from './site-process'

export type SnapshotFile = { path: string; sha256: string; gitSha: string; bytes: Buffer; mode: number }
export type PublishSnapshot = { files: SnapshotFile[]; hash: string }

/** Freeze the bytes that will actually be uploaded; never traverse links or the workspace outside website/. */
export function collectSiteSnapshot(project: string, output: string): PublishSnapshot {
  const root = path.resolve(project)
  const outputPath = output.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '')
  if (!outputPath || outputPath === '.' || path.posix.isAbsolute(outputPath) || outputPath.split('/').includes('..')) throw new Error('静态产物目录无效。')
  const files: SnapshotFile[] = []
  let total = 0
  const walk = (dir: string, relative: string, inherited: Array<{ base: string; rules: Ignore }>) => {
    const rules = [...inherited]
    const ignoreFile = path.join(dir, '.gitignore')
    if (fs.existsSync(ignoreFile)) {
      const stat = fs.lstatSync(ignoreFile)
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`不支持的忽略文件：${relative || '.'}/.gitignore`)
      rules.push({ base: relative, rules: ignore().add(fs.readFileSync(ignoreFile, 'utf8')) })
    }
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = relative ? `${relative}/${entry.name}` : entry.name
      if (['.git', '.ftcs', 'node_modules', '.npmrc', '.netrc', '.git-credentials'].includes(entry.name.toLowerCase()) || /^\.env(?:\.|$)/i.test(entry.name) && entry.name !== '.env.example' || /\.(?:pem|p12|pfx|key)$/i.test(entry.name) || rel === outputPath || rel.startsWith(`${outputPath}/`)) continue
      let ignored = false
      for (const { base, rules: matcher } of rules) {
        const match = matcher.test(`${base ? rel.slice(base.length + 1) : rel}${entry.isDirectory() ? '/' : ''}`)
        if (match.ignored) ignored = true
        else if (match.unignored) ignored = false
      }
      if (ignored) continue
      const full = path.join(dir, entry.name)
      const stat = fs.lstatSync(full)
      if (stat.isSymbolicLink()) throw new Error(`不支持发布符号链接：${rel}`)
      if (stat.isDirectory()) { walk(full, rel, rules); continue }
      if (!stat.isFile()) throw new Error(`不支持发布特殊文件：${rel}`)
      if (entry.name === '.gitmodules') throw new Error('暂不支持发布 Git 子模块，请先移除子模块。')
      if (stat.size > 8 * 1024 * 1024) throw new Error(`文件超过 8 MB，请先处理：${rel}`)
      const fd = fs.openSync(full, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0))
      let bytes: Buffer
      try {
        const opened = fs.fstatSync(fd)
        if (!opened.isFile() || opened.ino !== stat.ino || opened.dev !== stat.dev) throw new Error(`读取时文件发生变化，请重试：${rel}`)
        bytes = fs.readFileSync(fd)
      } finally { fs.closeSync(fd) }
      const after = fs.lstatSync(full)
      if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || after.ino !== stat.ino) throw new Error(`读取时文件发生变化，请重试：${rel}`)
      if (bytes.subarray(0, 80).toString('utf8').startsWith('version https://git-lfs.github.com/spec/v1\n')) throw new Error(`暂不支持发布 Git LFS 文件：${rel}`)
      total += bytes.length
      if (total > 20 * 1024 * 1024 || files.length >= 3000) throw new Error('站点源码过大，请减少文件数量或文件大小后重试。')
      const gitSha = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
      files.push({ path: rel, bytes, gitSha, sha256: createHash('sha256').update(bytes).digest('hex'), mode: stat.mode & 0o111 ? 0o100755 : 0o100644 })
    }
  }
  walk(root, '', [])
  files.sort((a, b) => a.path.localeCompare(b.path))
  if (!files.some(file => file.path === 'package.json')) throw new Error('发布源码中缺少 package.json，请检查忽略规则。')
  if (files.some(file => file.mode === 0o100755)) throw new Error('暂不支持发布可执行权限文件，请先处理。')
  const hash = createHash('sha256').update(JSON.stringify(files.map(file => [file.path, file.sha256, file.mode]))).digest('hex')
  return { files, hash }
}

function run(runtime: NodeRuntime, cwd: string, args: string[], log: (text: string) => void, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error('构建检查已取消。')); return }
    const child = spawnNpm(runtime, cwd, args)
    let timedOut = false
    let stopping: Promise<boolean> | undefined
    const stop = () => { stopping ||= stopProcess(child) }
    const timeout = setTimeout(() => { timedOut = true; stop() }, 10 * 60 * 1000)
    const onAbort = () => { stop() }
    signal?.addEventListener('abort', onAbort, { once: true })
    if (signal?.aborted) onAbort()
    const cleanup = () => { clearTimeout(timeout); signal?.removeEventListener('abort', onAbort) }
    for (const stream of [child.stdout, child.stderr]) stream?.on('data', chunk => log(String(chunk)))
    child.once('error', error => { cleanup(); reject(error) })
    child.once('exit', code => { cleanup(); void (async () => {
      if (stopping && !await stopping) { reject(new Error('无法确认构建进程已停止，请检查后重试。')); return }
      signal?.aborted ? reject(new Error('构建检查已取消。')) : timedOut ? reject(new Error('构建检查超时，请检查依赖或网络。')) : code === 0 ? resolve() : reject(new Error(`npm ${args.join(' ')} 失败（退出码 ${code}）。`))
    })() })
  })
}

/** Build a temporary copy of the frozen bytes using FTCS's Node, leaving the user's project untouched. */
export async function buildSiteSnapshot(snapshot: PublishSnapshot, output: string, node: { exe: string; source: string } | null, log: (text: string) => void, signal?: AbortSignal): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ftcs-site-publish-'))
  try {
    for (const file of snapshot.files) { const target = path.join(dir, ...file.path.split('/')); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, file.bytes) }
    const runtime = await resolveSiteNode(node, dir)
    log(`Node ${runtime.version} · npm ${runtime.npmVersion}\n`)
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
    if (Object.keys(pkg.dependencies || {}).length || Object.keys(pkg.devDependencies || {}).length || Object.keys(pkg.optionalDependencies || {}).length) {
      const locked = snapshot.files.some(file => ['package-lock.json', 'npm-shrinkwrap.json'].includes(file.path))
      await run(runtime, dir, [locked ? 'ci' : 'install'], log, signal)
    }
    await run(runtime, dir, ['run', 'build'], log, signal)
    if (signal?.aborted) throw new Error('构建检查已取消。')
    const outputDir = path.resolve(dir, output)
    if (!outputDir.startsWith(`${dir}${path.sep}`) || !fs.statSync(outputDir).isDirectory() || !fs.realpathSync(outputDir).startsWith(`${fs.realpathSync(dir)}${path.sep}`)) throw new Error('构建未生成有效的静态产物目录。')
    for (const file of snapshot.files) {
      const target = path.join(dir, ...file.path.split('/'))
      if (!fs.existsSync(target) || !fs.lstatSync(target).isFile() || fs.lstatSync(target).isSymbolicLink() || createHash('sha256').update(fs.readFileSync(target)).digest('hex') !== file.sha256) throw new Error(`构建过程修改了源码，请检查：${file.path}`)
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
}
