const { ipcRenderer } = require('electron')

window.addEventListener('DOMContentLoaded', async () => {
  const send = action => ipcRenderer.send('mascot:action', action)
  const sprites = new URLSearchParams(location.search).get('sprites')
  try {
    await Promise.all(['idle', 'blink', 'talk'].map(frame => {
      const image = document.getElementById(frame)
      image.src = new URL(`ftcs-mascot-${frame}.png`, sprites).href
      return image.decode()
    }))
  } catch {
    send('failed')
    return
  }
  const button = document.querySelector('button')
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  let shown = false
  let firstBlink = true
  let hovered = false
  let blinkTimer
  let active = null
  let moveFrame = 0

  function blink(double) {
    button.dataset.face = 'blink'
    blinkTimer = setTimeout(() => {
      button.dataset.face = 'idle'
      if (double) blinkTimer = setTimeout(() => blink(false), 160)
      else scheduleExpression()
    }, 220)
  }

  function scheduleExpression() {
    clearTimeout(blinkTimer)
    button.dataset.face = hovered && active === null ? 'talk' : 'idle'
    if (!shown || document.hidden || reducedMotion.matches || hovered || active !== null) return
    const delay = firstBlink ? 500 : 4000 + Math.random() * 4000
    blinkTimer = setTimeout(() => {
      const double = firstBlink || Math.random() < 0.2
      firstBlink = false
      blink(double)
    }, delay)
  }

  ipcRenderer.once('mascot:shown', () => { shown = true; scheduleExpression() })
  document.addEventListener('visibilitychange', scheduleExpression)
  reducedMotion.addEventListener('change', scheduleExpression)
  button.onpointerenter = event => {
    if (event.pointerType !== 'mouse') return
    button.dataset.side = event.offsetX < button.clientWidth / 2 ? 'left' : 'right'
    hovered = true
    scheduleExpression()
  }
  button.onpointerleave = () => { hovered = false; scheduleExpression() }
  function finish(action) {
    if (active === null) return
    cancelAnimationFrame(moveFrame)
    moveFrame = 0
    active = null
    scheduleExpression()
    send(action)
  }
  button.onpointerdown = event => {
    if (event.button !== 0 || active !== null) return
    active = event.pointerId
    scheduleExpression()
    button.setPointerCapture(active)
    send('down')
  }
  button.onpointermove = event => {
    if (event.pointerId !== active || moveFrame) return
    moveFrame = requestAnimationFrame(() => { moveFrame = 0; send('move') })
  }
  button.onpointerup = event => { if (event.pointerId === active) finish('up') }
  button.onlostpointercapture = button.onpointercancel = event => { if (event.pointerId === active) finish('cancel') }
  button.oncontextmenu = event => {
    event.preventDefault()
    finish('cancel')
    send('menu')
  }
  button.onclick = event => { if (event.detail === 0) send('open') }
  send('ready')
})
