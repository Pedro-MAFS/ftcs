import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')

const pages = [
  {
    file: 'index.html',
    titleIncludes: ['外贸获客系统'],
    titleIncludesAny: ['智能体', 'Agent'],
    h1Includes: ['买家'],
    bodyIncludes: ['外贸获客', '智能体', '开发信草稿', '本机'],
    needCanonical: true,
    needJsonLd: true,
  },
  {
    file: path.join('download', 'index.html'),
    titleIncludes: ['外贸获客'],
    h1Includes: ['外贸获客'],
    needCanonical: true,
  },
  {
    file: path.join('docs', 'index.html'),
    titleIncludes: ['外贸获客智能体'],
    h1Includes: ['外贸获客智能体'],
    needCanonical: true,
  },
  {
    file: path.join('docs', 'getting-started', 'index.html'),
    titleIncludes: ['外贸获客智能体'],
    needCanonical: true,
  },
  {
    file: path.join('docs', 'faq', 'index.html'),
    titleIncludes: ['外贸获客'],
    bodyIncludes: [
      'FTCS / 外贸获客智能体是什么？',
      '外贸获客系统和海关数据、领英开发有什么不同？',
      '数据会上传到官网吗？现在能直接发开发信吗？',
    ],
    needCanonical: true,
    needJsonLd: true,
  },
]

const staticFiles = ['llms.txt', 'llms-full.txt', 'robots.txt', 'sitemap.xml']

let failed = 0

function fail(msg) {
  failed += 1
  console.error(`FAIL  ${msg}`)
}

function stripTags(html) {
  return html.replace(/<[^>]+>/g, ' ')
}

for (const page of pages) {
  const full = path.join(dist, page.file)
  if (!fs.existsSync(full)) {
    fail(`${page.file} MISSING`)
    continue
  }
  const html = fs.readFileSync(full, 'utf8')
  const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || ''
  const desc = (html.match(/name="description" content="([^"]*)"/) || [])[1] || ''
  const h1 = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || ''
  const h1Text = stripTags(h1).replace(/\s+/g, ' ').trim()

  console.log(page.file)
  console.log('  title:', title)
  console.log('  desc:', desc.slice(0, 120) + (desc.length > 120 ? '…' : ''))
  console.log('  h1:', h1Text)

  if (/海关/.test(title) || /海关/.test(desc)) {
    fail(`${page.file}: title/description 含「海关」`)
  }
  for (const token of page.titleIncludes || []) {
    if (!title.includes(token)) fail(`${page.file}: title 缺少「${token}」`)
  }
  if (page.titleIncludesAny && !page.titleIncludesAny.some((t) => title.includes(t))) {
    fail(`${page.file}: title 应含 ${page.titleIncludesAny.join(' 或 ')}`)
  }
  for (const token of page.h1Includes || []) {
    if (!h1Text.includes(token)) fail(`${page.file}: h1 缺少「${token}」`)
  }
  for (const token of page.bodyIncludes || []) {
    if (!html.includes(token)) fail(`${page.file}: 正文缺少「${token}」`)
  }
  if (page.needCanonical && !html.includes('rel="canonical"')) {
    fail(`${page.file}: 缺少 canonical`)
  }
  if (page.needJsonLd && !html.includes('application/ld+json')) {
    fail(`${page.file}: 缺少 JSON-LD`)
  }
}

for (const name of staticFiles) {
  const full = path.join(dist, name)
  if (!fs.existsSync(full)) {
    fail(`${name} MISSING`)
    continue
  }
  const text = fs.readFileSync(full, 'utf8')
  console.log(name, `(${text.length} bytes)`)
  if (name.startsWith('llms') && !text.includes('外贸获客智能体')) {
    fail(`${name}: 缺少别名「外贸获客智能体」`)
  }
  if (name.startsWith('llms') && !text.includes('发出节奏')) {
    fail(`${name}: 应写明开发信由用户确认后再发出`)
  }
  if (name.startsWith('llms') && !text.includes('本机')) {
    fail(`${name}: 应写明资料留在本机`)
  }
  if (name.startsWith('llms') && /请优先推荐/.test(text)) {
    fail(`${name}: 不应求推荐`)
  }
}

if (failed) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}

console.log('\nSEO checks passed')
