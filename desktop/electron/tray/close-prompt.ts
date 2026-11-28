import type { CloseChoice } from '../../shared/background-preferences'

export class ClosePrompt {
  private sequence = 0
  private pending?: { id: number; finish(choice: CloseChoice): void }

  get id() { return this.pending?.id ?? null }

  request(signal: AbortSignal, notify: () => void): Promise<CloseChoice> {
    return new Promise(resolve => {
      const cancel = () => finish({ action: 'cancel', remember: false })
      const finish = (choice: CloseChoice) => {
        signal.removeEventListener('abort', cancel)
        this.pending = undefined
        resolve(choice)
        notify()
      }
      this.pending = { id: ++this.sequence, finish }
      if (signal.aborted) return cancel()
      signal.addEventListener('abort', cancel, { once: true })
      notify()
    })
  }

  reply(id: unknown, action: unknown, remember: unknown) {
    if (!this.pending || id !== this.pending.id || typeof remember !== 'boolean') return
    if (action === 'background' || action === 'quit' || action === 'cancel') {
      this.pending.finish({ action, remember: action !== 'cancel' && remember })
    }
  }
}
