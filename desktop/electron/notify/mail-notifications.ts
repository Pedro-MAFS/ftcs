import { Notification, type BrowserWindow } from 'electron'
import { IPC } from '../ipc/types'
import type { MailTarget } from '../mailbox/types'
import { focusMainWindowFromNotification } from './task-done-notify'

export function mailNotifications(window: () => BrowserWindow | null) {
  const active = new Set<Notification>()
  return {
    clear() {
      const old = [...active]
      active.clear()
      for (const note of old) note.close()
    },
    show(target: MailTarget, sender: string, count: number) {
      const win = window()
      if (!win || win.isDestroyed() || win.isFocused() || !Notification.isSupported()) return
      const note = new Notification({
        title: sender,
        body: count === 1 ? '收到一封新邮件' : `收到 ${count} 封新邮件`,
      })
      active.add(note)
      note.once('click', () => {
        if (!active.delete(note) || win.isDestroyed()) return
        focusMainWindowFromNotification('mail-click')
        win.webContents.send(IPC.MAILBOX_OPEN, target)
      })
      note.once('close', () => active.delete(note))
      note.once('failed', () => active.delete(note))
      try {
        note.show()
      } catch {
        active.delete(note)
      }
    },
  }
}
