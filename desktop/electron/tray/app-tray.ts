import { app, BrowserWindow, Menu, Tray, nativeImage } from 'electron'
import path from 'node:path'

export type AppTrayCallbacks = {
  onShow: () => void
  onQuit: () => void
}

let tray: Tray | null = null

function resolveTrayIconPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'icon.png')
  }
  return path.join(app.getAppPath(), 'build', 'icon.png')
}

export function createAppTray(
  callbacks: AppTrayCallbacks,
  iconPath?: string,
): Tray {
  destroyAppTray()
  const resolved = iconPath || resolveTrayIconPath()
  let image = nativeImage.createFromPath(resolved)
  if (image.isEmpty()) {
    image = nativeImage.createEmpty()
  } else if (process.platform === 'win32') {
    image = image.resize({ width: 16, height: 16 })
  }

  tray = new Tray(image)
  tray.setToolTip('外贸获客智能体')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: '显示主窗口',
        click: () => callbacks.onShow(),
      },
      { type: 'separator' },
      {
        label: '退出',
        click: () => callbacks.onQuit(),
      },
    ]),
  )
  tray.on('double-click', () => callbacks.onShow())
  return tray
}

export function destroyAppTray(): void {
  if (tray) {
    tray.destroy()
    tray = null
  }
}

export function showMainWindow(win: BrowserWindow | null): void {
  if (!win || win.isDestroyed()) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}
