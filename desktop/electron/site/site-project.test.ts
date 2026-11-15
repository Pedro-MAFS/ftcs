import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, test } from 'node:test'
import { adoptSite, createSite, getSiteSnapshot } from './site-project.ts'

const temporary: string[] = []
const template = path.resolve('site-template')
function workspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ftcs 站点-'))
  temporary.push(root)
  return root
}
afterEach(() => { for (const root of temporary.splice(0)) fs.rmSync(root, { recursive: true, force: true }) })

test('creates an offline template and restores state without overwriting it', () => {
  const root = workspace()
  assert.equal(getSiteSnapshot(root).status, 'not_created')
  assert.equal(fs.existsSync(path.join(root, 'website')), false)
  const created = createSite(root, template)
  assert.equal(created.status, 'ready')
  assert.equal(created.dependencies, 'missing')
  for (const file of ['package.json', 'package-lock.json', '.gitignore', 'README.md', 'public/robots.txt', 'public/llms.txt', 'public/llms-full.txt', 'seo/sitemap.xml.template']) {
    assert.equal(fs.existsSync(path.join(created.projectPath, file)), true, file)
  }
  assert.equal(fs.existsSync(path.join(created.projectPath, 'node_modules')), false)
  assert.equal(fs.existsSync(path.join(created.projectPath, 'dist')), false)
  const page = path.join(created.projectPath, 'src/pages/Home.vue')
  fs.writeFileSync(page, '用户修改', 'utf8')
  assert.equal(getSiteSnapshot(root).status, 'ready')
  assert.throws(() => createSite(root, template))
  assert.equal(fs.readFileSync(page, 'utf8'), '用户修改')
  assert.equal(getSiteSnapshot(workspace()).status, 'not_created')
})

test('recognizes empty, invalid, and existing directories without changing their contents', () => {
  const root = workspace()
  const project = path.join(root, 'website')
  fs.mkdirSync(project)
  assert.equal(getSiteSnapshot(root).status, 'empty')
  fs.writeFileSync(path.join(project, 'package.json'), '{"scripts":{"dev":"vite"}}')
  assert.equal(getSiteSnapshot(root).status, 'invalid')
  assert.throws(() => createSite(root, template))
  fs.writeFileSync(path.join(project, 'package.json'), '{"scripts":{"dev":"vite","build":"vite build"}}')
  assert.equal(getSiteSnapshot(root).status, 'existing')
  assert.equal(adoptSite(root).status, 'ready')
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, '.ftcs/site.json'), 'utf8')).buildOutputDir, null)
  assert.equal(fs.readdirSync(project).length, 1)
})

test('missing and damaged records preserve projects and permit explicit recovery', () => {
  const root = workspace()
  createSite(root, template)
  const record = path.join(root, '.ftcs/site.json')
  fs.writeFileSync(record, 'null')
  assert.equal(getSiteSnapshot(root).status, 'existing')
  assert.equal(adoptSite(root).status, 'ready')
  fs.rmSync(path.join(root, 'website'), { recursive: true })
  assert.equal(getSiteSnapshot(root).status, 'missing')
  assert.equal(createSite(root, template).status, 'ready')
  assert.equal(JSON.parse(fs.readFileSync(record, 'utf8')).buildOutputDir, null)
})

test('refuses a symbolic-link site and preserves a partially copied project on failure', () => {
  const root = workspace()
  const other = workspace()
  fs.symlinkSync(other, path.join(root, 'website'), 'junction')
  assert.equal(getSiteSnapshot(root).status, 'error')
  assert.throws(() => createSite(root, template))
  assert.deepEqual(fs.readdirSync(other), [])

  fs.unlinkSync(path.join(root, 'website'))
  const badTemplate = path.join(other, 'template')
  fs.mkdirSync(badTemplate)
  fs.writeFileSync(path.join(badTemplate, 'existing.txt'), '保留')
  assert.throws(() => createSite(root, badTemplate))
  assert.equal(fs.readFileSync(path.join(root, 'website/existing.txt'), 'utf8'), '保留')
  assert.equal(getSiteSnapshot(root).status, 'invalid')
  assert.throws(() => createSite(root, template))
})
