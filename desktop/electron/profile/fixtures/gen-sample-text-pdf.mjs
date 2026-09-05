import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PDFDocument, StandardFonts } from 'pdf-lib'

const here = path.dirname(fileURLToPath(import.meta.url))
const out = path.join(here, 'sample-text.pdf')

const doc = await PDFDocument.create()
const page = doc.addPage()
const font = await doc.embedFont(StandardFonts.Helvetica)
page.drawText(
  'GreenWood Product Catalog Specification Model DN15 DN20 DN25 DN32. ' +
    'Material: WPC composite decking for outdoor flooring, fencing and railing systems. ' +
    'Color options: teak, cedar, gray. Warranty: 25 years residential use.',
  {
    x: 50,
    y: 700,
    size: 12,
    font,
    maxWidth: 500,
    lineHeight: 14,
  },
)
const bytes = await doc.save()
fs.writeFileSync(out, bytes)
console.log(`Wrote ${out} (${bytes.length} bytes)`)
