import assert from 'node:assert/strict'
import { test } from 'node:test'
import { backgroundPreferences, validBackgroundUpdate } from '../shared/background-preferences.ts'
import { BackgroundController } from '../electron/tray/background-controller.ts'
import { ClosePrompt } from '../electron/tray/close-prompt.ts'
import { mascotBounds, placeMascot } from '../electron/tray/mascot-position.ts'

test('mascot defaults on independently of legacy and current close actions; an explicit opt-out persists', () => {
  for (const legacy of [undefined, false, true]) {
    const stored = { closeToTrayEnabled: legacy }
    assert.equal(backgroundPreferences(stored).closeAction, legacy ? 'background' : 'ask')
    assert.equal(backgroundPreferences(stored).backgroundMascotEnabled, true)
    for (const closeAction of ['ask', 'background', 'quit']) {
      for (const enabled of [undefined, false, true]) {
        const raw = { ...stored, closeAction, backgroundMascotEnabled: enabled }
        assert.deepEqual(backgroundPreferences(raw), { closeAction, backgroundMascotEnabled: enabled ?? true })
      }
    }
  }
  const prefs = { closeAction: 'ask', closeToTrayEnabled: true, backgroundMascotEnabled: true }
  assert.deepEqual(backgroundPreferences(prefs), { closeAction: 'ask', backgroundMascotEnabled: true })
  assert.deepEqual(backgroundPreferences({ closeAction: 'invalid', backgroundMascotEnabled: 1 }), backgroundPreferences({}))
})

test('only the active close prompt accepts a choice and abort dismisses the renderer dialog', async () => {
  const prompt = new ClosePrompt()
  const seen: Array<number | null> = []
  const notify = () => seen.push(prompt.id)
  const abort = new AbortController()
  const first = prompt.request(abort.signal, notify)
  const stale = prompt.id
  abort.abort()
  assert.deepEqual(await first, { action: 'cancel', remember: false })
  const next = prompt.request(new AbortController().signal, notify)
  const current = prompt.id
  prompt.reply(stale, 'quit', true)
  prompt.reply(current, 'other', true)
  prompt.reply(current, 'background', 'yes')
  assert.equal(prompt.id, current)
  prompt.reply(current, 'background', true)
  assert.deepEqual(await next, { action: 'background', remember: true })
  assert.deepEqual(seen, [stale, null, current, null])
})

test('only explicit supported preference fields are accepted', () => {
  for (const value of [{}, null, ['background'], { closeAction: true }, { closeAction: 'ask', extra: 'quit' }, { backgroundMascotEnabled: 'true' }]) {
    assert.equal(validBackgroundUpdate(value), false)
  }
  assert.ok(validBackgroundUpdate({ backgroundMascotEnabled: false }))
  assert.ok(validBackgroundUpdate({ closeAction: 'ask' }))
})

function fixture() {
  type Hooks = ConstructorParameters<typeof BackgroundController>[0]
  let decide!: (choice: Awaited<ReturnType<Hooks['prompt']>>) => void
  let signal: AbortSignal | undefined
  const prompts: string[] = []
  const calls: string[] = []
  const hooks: Hooks = {
    closeAction: () => 'ask',
    prompt: abort => {
      signal = abort
      prompts.push('dialog')
      return new Promise(resolve => { decide = resolve })
    },
    save: patch => calls.push('save:' + JSON.stringify(patch)),
    enter: () => calls.push('background'),
    syncMascot: () => calls.push('syncMascot'),
    quit: () => calls.push('quit'),
    error: () => calls.push('error'),
  }
  return { control: new BackgroundController(hooks), hooks, decide: (choice: Parameters<typeof decide>[0]) => decide(choice), aborted: () => signal?.aborted, prompts, calls }
}

test('repeated close opens one prompt; Cancel ignores the checkbox, background can be one-off', async () => {
  const f = fixture()
  const first = f.control.close()
  await f.control.close()
  assert.deepEqual(f.prompts, ['dialog'])
  f.decide({ action: 'cancel', remember: true })
  await first
  assert.deepEqual(f.calls, [])
  const second = f.control.close()
  f.decide({ action: 'background', remember: false })
  await second
  assert.equal(f.control.state, 'background')
  assert.deepEqual(f.calls, ['background'])
  f.control.windowVisibilityChanged(true)
  assert.equal(f.control.state, 'foreground')
  const third = f.control.close()
  f.decide({ action: 'background', remember: true })
  await third
  assert.deepEqual(f.calls.slice(-2), ['save:{"closeAction":"background"}', 'background'])
})

test('minimizing shows the mascot and restoring dismisses it without changing close behavior', async () => {
  const f = fixture()
  assert.equal(f.control.canShowMascot, false)
  f.control.windowVisibilityChanged(false)
  assert.equal(f.control.canShowMascot, true)
  assert.equal(f.control.state, 'foreground')
  f.control.windowVisibilityChanged(true)
  assert.equal(f.control.canShowMascot, false)
  assert.deepEqual(f.calls, ['syncMascot', 'syncMascot'])
  f.control.windowVisibilityChanged(false)
  const close = f.control.close()
  assert.deepEqual(f.prompts, ['dialog'])
  f.decide({ action: 'cancel', remember: false })
  await close
  f.control.beginQuit()
  f.control.windowVisibilityChanged(false)
  assert.equal(f.control.canShowMascot, false)
})

test('temporarily hiding the mascot lasts until the main window is visible again', async () => {
  const f = fixture()
  f.hooks.closeAction = () => 'background'
  for (const enter of [() => f.control.close(), () => f.control.windowVisibilityChanged(false)]) {
    await enter()
    assert.equal(f.control.canShowMascot, true)
    f.control.temporarilyHideMascot()
    assert.equal(f.control.canShowMascot, false)
    f.control.windowVisibilityChanged(false)
    assert.equal(f.control.canShowMascot, false)
    f.control.windowVisibilityChanged(true)
    assert.equal(f.control.canShowMascot, false)
  }
  await f.control.close()
  assert.equal(f.control.canShowMascot, true)
  assert.ok(!f.calls.some(call => call.startsWith('save:')))
})

test('remembered background and exit go straight to their respective actions', async () => {
  const f = fixture()
  f.hooks.closeAction = () => 'background'
  await f.control.close()
  f.control.windowVisibilityChanged(true)
  f.hooks.closeAction = () => 'quit'
  await f.control.close()
  assert.equal(f.prompts.length, 0)
  assert.deepEqual(f.calls, ['background', 'syncMascot', 'quit'])
})

test('explicit quit aborts the prompt; a late choice cannot hide the main window', async () => {
  const f = fixture()
  const visit = f.control.close()
  f.control.beginQuit()
  assert.ok(f.aborted())
  f.control.cancelQuit()
  f.decide({ action: 'background', remember: true })
  await visit
  assert.equal(f.control.state, 'foreground')
  assert.deepEqual(f.calls, ['syncMascot'])
})

test('remember exit only after drafts have flushed; failed flush leaves choice pending next time', async () => {
  const f = fixture()
  for (const saved of [false, true]) {
    const visit = f.control.close()
    f.decide({ action: 'quit', remember: true })
    await visit
    f.control.beginQuit()
    await f.control.close()
    if (saved) f.control.savedDrafts()
    else f.control.cancelQuit()
  }
  assert.deepEqual(f.calls, ['quit', 'syncMascot', 'quit', 'syncMascot', 'save:{"closeAction":"quit"}'])
})

test('preference write failure keeps the work area visible', async () => {
  const f = fixture()
  f.hooks.save = () => { throw new Error('disk full') }
  const visit = f.control.close()
  f.decide({ action: 'background', remember: true })
  await visit
  assert.deepEqual(f.calls, ['error'])
  assert.equal(f.control.state, 'foreground')
})

test('mascot uses logical desktop coordinates and returns to reachable bounds', () => {
  const main = { x: 0, y: 0, width: 1000, height: 800 }
  const left = { x: -800, y: -100, width: 800, height: 600 }
  assert.deepEqual(placeMascot(undefined, [main, left], left), { x: -88, y: 412 })
  assert.deepEqual(placeMascot({ x: -810, y: 490 }, [left, main], main), { x: -800, y: 428 })
  assert.deepEqual(placeMascot({ x: -60, y: 0 }, [main, left], main), { x: -72, y: 0 })
  for (const point of [{ x: -800, y: 150 }, { x: NaN, y: 7 }]) {
    assert.deepEqual(placeMascot(point, [main], main), { x: 912, y: 712 })
  }
})

test('moving the mascot always supplies its design size, even after reading rounded window bounds', () => {
  for (const x of [101, 102, 103, -130]) {
    const previousBounds = { x, y: 51, width: 73, height: 74 }
    assert.deepEqual(mascotBounds(previousBounds), { x, y: 51, width: 72, height: 72 })
  }
})
