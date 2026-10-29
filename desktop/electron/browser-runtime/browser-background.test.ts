import assert from 'node:assert/strict'
import test from 'node:test'
import { applyBrowserBackgroundSwitches, BROWSER_BACKGROUND_SWITCHES } from './browser-background.ts'

test('covered browser windows stay able to run page scripts', () => {
  const applied: string[] = []
  applyBrowserBackgroundSwitches((name, value) => {
    applied.push(value ? `${name}=${value}` : name)
  })
  assert.deepEqual(
    applied,
    BROWSER_BACKGROUND_SWITCHES.map((item) => (item.value ? `${item.name}=${item.value}` : item.name)),
  )
  assert.ok(applied.some((item) => item.includes('CalculateNativeWinOcclusion')))
  assert.ok(applied.some((item) => item === 'disable-backgrounding-occluded-windows'))
})
