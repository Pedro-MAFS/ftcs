const { ipcRenderer } = require('electron')

window.addEventListener('DOMContentLoaded', async () => {
  const send = action => ipcRenderer.send('mascot:action', action)
  const sprites = new URLSearchParams(location.search).get('sprites')
  try {
    await Promise.all(['idle', 'blink'].map(frame => {
      const image = document.getElementById(frame)
      image.src = new URL(`ftcs-mascot-${frame}.png`, sprites).href
      return image.decode()
    }))
  } catch {
    send('failed')
    return
  }
  const button = document.querySelector('button')
  let active = null
  let moveFrame = 0
  function finish(action) {
    if (active === null) return
    cancelAnimationFrame(moveFrame)
    moveFrame = 0
    active = null
    send(action)
  }
  button.onpointerdown = event => {
    if (event.button !== 0 || active !== null) return
    active = event.pointerId
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
