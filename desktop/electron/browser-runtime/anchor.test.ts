import assert from 'node:assert/strict'
import test from 'node:test'
import { CARD, THUMB, anchorExpanded, anchorTopRight } from './anchor.ts'

const workArea = { x: 0, y: 0, width: 1920, height: 1080 }

test('thumbnail anchor matches the pen: below the title bar and left of the tip strip', () => {
  const main = { x: 0, y: 0, width: 1280, height: 800 }
  const box = anchorTopRight(main, THUMB, workArea)
  assert.deepEqual(box, { x: 532, y: 56, width: 360, height: 240 })
  assert.notEqual(box.y, main.y + main.height - THUMB.height)
})

test('T8 a main window with room below still anchors from the title bar, not the bottom', () => {
  const main = { x: 200, y: 300, width: 1280, height: 700 }
  const box = anchorTopRight(main, THUMB, workArea)
  assert.equal(box.y, main.y + 56)
  assert.ok(box.y < main.y + main.height - THUMB.height)
  assert.equal(box.x, 200 + 1280 - 16 - 360 - 12 - 360)
})

test('status card keeps the same top-right anchor at 360x40', () => {
  const main = { x: 0, y: 0, width: 1280, height: 800 }
  const box = anchorTopRight(main, CARD, workArea)
  assert.equal(box.x, 532)
  assert.equal(box.y, 56)
  assert.equal(box.height, 40)
})

test('expanded mode insets the work area by 48 on every side', () => {
  const box = anchorExpanded(workArea)
  assert.deepEqual(box, { x: 48, y: 48, width: 1824, height: 984 })
})

test('anchor clamps into the work area instead of sliding to the bottom edge', () => {
  const main = { x: 1700, y: 900, width: 400, height: 300 }
  const tight = { x: 0, y: 0, width: 1600, height: 900 }
  const box = anchorTopRight(main, THUMB, tight)
  assert.equal(box.x, tight.width - THUMB.width)
  assert.equal(box.y, tight.height - THUMB.height)
  assert.notEqual(box.y, main.y + main.height - THUMB.height)
})
