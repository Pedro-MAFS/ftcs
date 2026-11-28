import type { BackgroundUpdate, CloseAction } from '../../shared/background-preferences'

interface CloseChoice { action: 'background' | 'quit' | 'cancel'; remember: boolean }
interface BackgroundHooks {
  closeAction(): CloseAction
  prompt(signal: AbortSignal): Promise<CloseChoice>
  save(update: BackgroundUpdate): void
  enter(): void
  syncMascot(): void
  quit(): void
  error(error: unknown): void
}

export class BackgroundController {
  state: 'foreground' | 'prompting' | 'background' | 'quitting' = 'foreground'
  private prompt?: AbortController
  private rememberExit = false
  private mainWindowHiddenOrMinimized = false

  private readonly hooks: BackgroundHooks
  constructor(hooks: BackgroundHooks) { this.hooks = hooks }

  get canShowMascot() {
    return this.state !== 'quitting' && (this.state === 'background' || this.mainWindowHiddenOrMinimized)
  }

  windowVisibilityChanged(visible: boolean) {
    this.mainWindowHiddenOrMinimized = !visible
    if (visible && this.state === 'background') this.state = 'foreground'
    this.hooks.syncMascot()
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
        if (choice.remember) this.hooks.save({ closeAction: 'background' })
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
    this.hooks.syncMascot()
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
