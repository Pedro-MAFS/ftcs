import { app, BrowserWindow, Menu, screen, type Point } from 'electron'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { allowCreatedWebContentsDuring } from '../browser-runtime/builtin-browser-window'
import { getRepoRoot } from '../config/paths'
import { readUserPrefs, writeUserPrefs } from '../config/user-prefs'
import { mascotBounds, placeMascot } from './mascot-position'

export class MascotWindow {
  private window: BrowserWindow | null = null

  constructor(private readonly actions: { open(): void; hide(): void; quit(): void }) {}

  owns(win: BrowserWindow) { return this.window === win }

  dismiss() {
    const win = this.window
    this.window = null
    if (win && !win.isDestroyed()) win.destroy()
  }

  show(main: BrowserWindow) {
    if (this.window) return
    const root = getRepoRoot()
    const dir = app.isPackaged ? path.join(process.resourcesPath, 'mascot') : path.join(root, 'desktop/resources/mascot')
    const sprites = app.isPackaged ? path.join(dir, 'sprites') : path.join(root, 'ftcs-mascot-icons/sprites')
    const saved = readUserPrefs().mascotPosition
    const fallback = saved ? screen.getPrimaryDisplay() : screen.getDisplayMatching(main.getBounds())
    const position = placeMascot(saved, screen.getAllDisplays().map(d => d.workArea), fallback.workArea)
    const win = allowCreatedWebContentsDuring(() => new BrowserWindow({
      ...mascotBounds(position), show: false, transparent: true,
      frame: false, resizable: false, maximizable: false, minimizable: false, fullscreenable: false,
      skipTaskbar: true, alwaysOnTop: true, hasShadow: false, autoHideMenuBar: true,
      webPreferences: { preload: path.join(dir, 'preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false },
    }))
    this.window = win
    let gesture: { cursor: Point; origin: Point; dragged: boolean } | undefined
    const constrain = () => {
      if (!this.owns(win)) return
      const p = placeMascot(win.getBounds(), screen.getAllDisplays().map(d => d.workArea), screen.getPrimaryDisplay().workArea)
      win.setBounds(mascotBounds(p))
    }
    screen.on('display-removed', constrain)
    screen.on('display-metrics-changed', constrain)
    win.once('closed', () => {
      screen.off('display-removed', constrain)
      screen.off('display-metrics-changed', constrain)
      if (this.owns(win)) this.window = null
    })
    const failed = (reason: unknown) => {
      if (!this.owns(win)) return
      console.warn('[mascot] 悬浮窗加载失败', reason)
      this.dismiss()
    }
    win.webContents.once('render-process-gone', (_event, details) => failed(details.reason))
    win.webContents.once('preload-error', (_event, _path, error) => failed(error))
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    win.webContents.on('will-navigate', event => event.preventDefault())
    const menu = Menu.buildFromTemplate([
      { label: '打开工作区', click: this.actions.open },
      { label: '隐藏贸贸', click: this.actions.hide },
      { type: 'separator' },
      { label: '退出 FTCS', click: this.actions.quit },
    ])
    win.webContents.ipc.on('mascot:action', (event, action: unknown) => {
      if (!this.owns(win) || event.senderFrame !== win.webContents.mainFrame) return
      switch (action) {
        case 'ready':
          win.showInactive()
          win.webContents.send('mascot:shown')
          return
        case 'failed': failed('无法显示动画素材'); return
        case 'open': this.actions.open(); return
        case 'menu': gesture = undefined; menu.popup({ window: win }); return
        case 'cancel': gesture = undefined; return
        case 'down':
          gesture = { cursor: screen.getCursorScreenPoint(), origin: win.getBounds(), dragged: false }
          return
        case 'up':
        case 'move': {
          if (!gesture) return
          const cursor = screen.getCursorScreenPoint()
          const dx = cursor.x - gesture.cursor.x
          const dy = cursor.y - gesture.cursor.y
          if (Math.hypot(dx, dy) >= 5) gesture.dragged = true
          if (gesture.dragged) win.setBounds(mascotBounds({ x: gesture.origin.x + dx, y: gesture.origin.y + dy }))
          if (action === 'up') {
            const dragged = gesture.dragged
            gesture = undefined
            if (!dragged) { this.actions.open(); return }
            constrain()
            const [x, y] = win.getPosition()
            try { writeUserPrefs({ mascotPosition: { x, y } }) }
            catch (error) { console.warn('[mascot] 无法保存悬浮窗位置', error) }
          }
        }
      }
    })
    void win.loadFile(path.join(dir, 'index.html'), { query: { sprites: pathToFileURL(sprites + path.sep).href } }).catch(failed)
  }
}
