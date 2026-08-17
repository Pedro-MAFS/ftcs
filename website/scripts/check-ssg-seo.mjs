import fs from 'node:fs'

const files = [
  'dist/index.html',
  'dist/download/index.html',
  'dist/docs/index.html',
  'dist/docs/getting-started/index.html',
]

for (const f of files) {
  if (!fs.existsSync(f)) {
    console.log(f, 'MISSING')
    continue
  }
  const h = fs.readFileSync(f, 'utf8')
  const title = (h.match(/<title>([^<]*)<\/title>/) || [])[1]
  const desc = (h.match(/name="description" content="([^"]*)"/) || [])[1]
  const h1 = (h.match(/<h1[^>]*>([^<]*)<\/h1>/) || [])[1]
  console.log(f)
  console.log('  title:', title)
  console.log('  desc:', desc)
  console.log('  h1:', h1)
}
