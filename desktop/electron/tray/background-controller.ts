import type { BackgroundUpdate, CloseAction } from '../../shared/background-preferences'

interface CloseChoice { action: 'background' | 'quit' | 'cancel'; remember: boolean }
interface BackgroundHooks {
  closeAction(): CloseAction
  prompt(signal: AbortSignal): Promise<CloseChoice>
  save(update: BackgroundUpdate, entering?: boolean): void
  enter(): void
  dismissMascot(): void
  quit(): void
  error(error: unknown): void
}

export class BackgroundController {
  state: 'foreground' | 'prompting' | 'background' | 'quitting' = 'foreground'
  private prompt?: AbortController
  private rememberExit = false

  private readonly hooks: BackgroundHooks
  constructor(hooks: BackgroundHooks) { this.hooks = hooks }

  foreground() {
    if (this.state === 'quitting') return
    if (this.state === 'background') this.state = 'foreground'
    this.hooks.dismissMascot()
  }

  async close() {
    if (this.state !== 'foreground') return
    const preferred = this.hooks.closeAction()
    const prompt = preferred === 'ask' ? new AbortController() : undefined
    if (prompt) {
      this.prompt = prompt
      this.state = 'prompting'
    }
    try {
      const choice = prompt ? await this.hooks.prompt(prompt.signal) : { action: preferred, remember: false }
      if (prompt?.signal.aborted) return
      this.prompt = undefined
      this.state = 'foreground'
      if (choice.action === 'background') {
        this.hooks.save(choice.remember ? { closeAction: 'background' } : {}, true)
        this.state = 'background'
        this.hooks.enter()
      } else if (choice.action === 'quit') {
        this.rememberExit = choice.remember
        this.hooks.quit()
      }
    } catch (error) {
      if (prompt?.signal.aborted) return
      this.prompt = undefined
      this.state = 'foreground'
      this.hooks.error(error)
    }
  }

  beginQuit() {
    this.state = 'quitting'
    this.prompt?.abort()
    this.prompt = undefined
    this.hooks.dismissMascot()
  }
  savedDrafts() {
    if (this.rememberExit) this.hooks.save({ closeAction: 'quit' })
    this.rememberExit = false
  }
  cancelQuit() {
    this.rememberExit = false
    this.state = 'foreground'
  }
}
