import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { imapClient, verify, diagnostic } from './protocol'
import { importFolder } from './import'
import { ImportIndex } from './conversations'
import type { TimelineCursor } from './types'
import { accounts, accountDir, atomic, read, save, newFolder, uuid } from './storage'
import {
  validate,
  key,
  type Account,
  type Context,
  type MailAction,
  type Folder,
  type FolderRole,
  type Snapshot,
} from './types'

interface State {
  v: number
  workspace_id: string
  active_account_id: string | null
  connection_generation: number
}
interface Vault {
  dir: string
  encrypt(value: string): Buffer
  decrypt(value: Buffer): string
}
const roles: FolderRole[] = ['inbox', 'sent']
export class MailboxService {
  constructor(
    private root: () => string,
    private vault: Vault,
    private notify: () => void,
    private protocol = { verify, imapClient, importFolder },
  ) {}
  private epoch = 0
  private connecting = false
  private running = false
  private timer?: ReturnType<typeof setTimeout>
  private client?: ReturnType<typeof imapClient>
  private loading?: Promise<ImportIndex>
  private index?: ImportIndex
  private candidates: string[] = []
  private errors: Partial<Record<FolderRole, string>> = {}
  private base() {
    return path.join(this.root(), 'data', 'mail')
  }
  private state(): State {
    const file = path.join(this.base(), 'workspace.json')
    if (!fs.existsSync(file))
      return { v: 1, workspace_id: '', active_account_id: null, connection_generation: 0 }
    const state = read<State>(file)
    if (!uuid(state.workspace_id) || (state.active_account_id && !uuid(state.active_account_id)))
      throw new Error('邮箱工作区配置损坏。')
    return state
  }
  private credentialRoot(state: State) {
    const rootKey = createHash('sha256').update(this.root()).digest('hex')
    return path.join(this.vault.dir, rootKey, state.workspace_id)
  }
  private credential(state: State, id: string) {
    if (!uuid(id) || !uuid(state.workspace_id)) throw new Error('凭据标识无效。')
    return path.join(this.credentialRoot(state), id + '.bin')
  }
  private configSignature(account: Account) {
    return JSON.stringify([this.root(), account.account_id, account.email, account.imap, account.smtp])
  }
  private password(state: State, account: Account) {
    try {
      const secret = JSON.parse(
        this.vault.decrypt(fs.readFileSync(this.credential(state, account.account_id))),
      )
      if (secret.binding === this.configSignature(account) && typeof secret.password === 'string')
        return secret.password as string
    } catch {
      /* The OS key store or the saved credentials can be unavailable after a move. */
    }
    throw Object.assign(new Error('请重新验证邮箱。'), { code: 'EAUTH' })
  }
  private folder(dir: string, role: FolderRole) {
    return read<Folder>(path.join(dir, 'sync', role + '.json'))
  }
  private async reader(ctx: Context, id: string) {
    this.check(ctx)
    if (!id || this.state().active_account_id !== id) throw new Error('邮箱账号已改变。')
    if (this.index) return this.index
    this.loading ??= ImportIndex.load(accountDir(this.base(), id), () => this.check(ctx))
    const loading = this.loading
    try {
      const index = await loading
      this.check(ctx)
      this.index = index
      return index
    } finally {
      if (this.loading === loading) this.loading = undefined
    }
  }
  async unreadCount() {
    const id = this.state().active_account_id
    if (!id) return 0
    const ctx = { root: this.root(), generation: this.epoch }
    const index = await this.reader(ctx, id)
    this.check(ctx)
    return index.unreadMessages(this.folder(accountDir(this.base(), id), 'inbox')).size
  }
  async conversations(ctx: Context, id: string) {
    const index = await this.reader(ctx, id)
    this.check(ctx)
    return index.conversations(this.folder(accountDir(this.base(), id), 'inbox'))
  }
  async timeline(ctx: Context, id: string, contact: string, before?: TimelineCursor, aroundId?: string) {
    const index = await this.reader(ctx, id)
    this.check(ctx)
    const page = await index.timeline(contact, before, () => this.check(ctx), aroundId)
    this.check(ctx)
    return page
  }
  snapshot(): Snapshot {
    const state = this.state(),
      active = state.active_account_id
    return {
      context: { root: this.root(), generation: this.epoch },
      active,
      accounts: accounts(this.base()).map((a) => ({
        id: a.account_id,
        email: a.email,
        imap: a.imap,
        smtp: a.smtp,
      })),
      candidates: this.candidates,
      imported: this.index?.count ?? 0,
      contacts: Array.from(this.index?.contacts.keys() ?? []),
      running: this.running,
      folders: active
        ? roles.map((role) => {
            const f = this.folder(accountDir(this.base(), active), role)
            return { role, phase: f.phase, path: f.remote_path, error: this.errors[role], lastSyncedAt:f.last_synced_at }
          })
        : [],
    }
  }
  stop() {
    this.epoch++
    this.connecting = false
    this.running = false
    clearTimeout(this.timer)
    this.client?.close()
    this.client = undefined
    this.loading = undefined
    this.index = undefined
    this.candidates = []
    this.errors = {}
  }
  start() {
    this.stop()
    try {
      this.restore()
    } catch {
      this.notify()
    }
  }
  private restore() {
    const state = this.state()
    if (state.workspace_id) {
      const keys = this.credentialRoot(state)
      if (fs.existsSync(keys))
        for (const f of fs.readdirSync(keys)) {
          if (f.endsWith('.bin') && uuid(f.slice(0, -4)) && f !== state.active_account_id + '.bin')
            fs.rmSync(path.join(keys, f), { force: true })
        }
      const dir = path.join(this.base(), 'accounts')
      if (fs.existsSync(dir))
        for (const f of fs.readdirSync(dir)) {
          if (/^(pending|deleted)-/.test(f) && uuid(f.slice(f.indexOf('-') + 1)))
            fs.rmSync(path.join(dir, f), { recursive: true, force: true })
        }
    }
    this.schedule(0)
    this.notify()
  }
  private schedule(delay: number) {
    clearTimeout(this.timer)
    if (this.state().active_account_id)
      this.timer = setTimeout(() => {
        void this.sync().catch(() => this.notify())
      }, delay)
  }
  private check(ctx: Context) {
    if (ctx.root !== this.root() || ctx.generation !== this.epoch)
      throw new Error('邮箱或工作区已改变，请刷新。')
  }
  async act(ctx: Context, a: MailAction) {
    this.check(ctx)
    const base = this.base(),
      state = this.state(),
      id = state.active_account_id
    if (a.kind === 'connect') {
      const f = a.form
      validate(f)
      if (this.connecting) throw new Error('正在验证邮箱。')
      const existing = accounts(base).find((row) => row.address_key === key(f.email))
      if (id && id !== existing?.account_id) throw new Error('请先取消当前邮箱的托管。')
      this.connecting = true
      try {
        await this.protocol.verify(f)
        this.check(ctx)
        const now = new Date(),
          aid = existing?.account_id ?? randomUUID()
        const account: Account = {
          v: 1,
          account_id: aid,
          address_key: key(f.email),
          email: f.email.trim(),
          imap: f.imap,
          smtp: f.smtp,
          first_connected_at: existing?.first_connected_at ?? now.toISOString(),
          last_connected_at: now.toISOString(),
          initial_sync_mode: existing?.initial_sync_mode ?? f.mode,
          sync_from:
            existing?.sync_from ??
            new Date(+now - (f.mode === 'last_30_days' ? 30 * 86400000 : 0)).toISOString(),
        }
        if (!state.workspace_id) {
          state.workspace_id = randomUUID()
          save(path.join(base, 'workspace.json'), state)
        }
        const encrypted = this.vault.encrypt(
          JSON.stringify({ binding: this.configSignature(account), password: f.password }),
        )
        const dest = accountDir(base, aid),
          staging = existing ? dest : path.join(base, 'accounts', 'pending-' + aid)
        try {
          if (!existing)
            for (const role of roles)
              save(
                path.join(staging, 'sync', role + '.json'),
                newFolder(role, role === 'inbox' ? 'INBOX' : null),
              )
          save(path.join(staging, 'account.json'), account)
          atomic(this.credential(state, aid), encrypted)
          if (!existing) fs.renameSync(staging, dest)
          save(path.join(base, 'workspace.json'), {
            ...state,
            active_account_id: aid,
            connection_generation: state.connection_generation + 1,
          })
        } catch (err) {
          if (!existing) {
            fs.rmSync(staging, { recursive: true, force: true })
            fs.rmSync(dest, { recursive: true, force: true })
            fs.rmSync(this.credential(state, aid), { force: true })
          }
          throw err
        }
        this.stop()
        this.schedule(0)
      } finally {
        if (ctx.generation === this.epoch) this.connecting = false
      }
    } else if (a.kind === 'disconnect' && id) {
      save(path.join(base, 'workspace.json'), {
        ...state,
        active_account_id: null,
        connection_generation: state.connection_generation + 1,
      })
      this.stop()
      this.notify()
      fs.rmSync(this.credential(state, id), { force: true })
    } else if (a.kind === 'delete') {
      if (a.id === id || this.connecting) throw new Error('请先取消托管或等待验证完成。')
      const src = accountDir(base, a.id),
        dest = path.join(base, 'accounts', 'deleted-' + a.id)
      fs.renameSync(src, dest)
      fs.rmSync(this.credential(state, a.id), { force: true })
      fs.rmSync(dest, { recursive: true })
    } else if (a.kind === 'bind' && id) {
      if (!this.candidates.includes(a.path)) throw new Error('请选择已列出的文件夹。')
      const account = read<Account>(path.join(accountDir(base, id), 'account.json'))
      const probe = this.protocol.imapClient(account.imap, this.password(state, account))
      try {
        await probe.connect()
        this.check(ctx)
        await probe.mailboxOpen(a.path, { readOnly: true })
        this.check(ctx)
      } finally {
        probe.close()
      }
      this.stop()
      const f = newFolder('sent', a.path)
      f.binding = 'manual'
      save(path.join(accountDir(base, id), 'sync', 'sent.json'), f)
      this.schedule(0)
    } else if (a.kind === 'retry' && id) {
      if (!this.running) this.schedule(0)
    } else throw new Error('当前邮箱状态不支持此操作。')
    this.notify()
    return this.snapshot()
  }
  private async sync() {
    const ctx = { root: this.root(), generation: this.epoch }
    const state = this.state(),
      id = state.active_account_id
    if (!id || this.running) return
    this.running = true
    this.errors = {}
    this.notify()
    let role: FolderRole | undefined
    try {
      const dir = accountDir(this.base(), id),
        account = read<Account>(path.join(dir, 'account.json'))
      const index = await this.reader(ctx, id)
      this.check(ctx)
      const client = this.protocol.imapClient(account.imap, this.password(state, account))
      this.client = client
      await client.connect()
      this.check(ctx)
      for (role of roles) {
        try {
          const f = this.folder(dir, role)
          if (role === 'sent' && !f.remote_path) {
            const list = (await client.list()).filter(
              (m) => !m.flags.has('\\Noselect') && m.path.toUpperCase() !== 'INBOX',
            )
            this.check(ctx)
            this.candidates = list.map((m) => m.path)
            const sent = list.filter((m) => m.specialUse === '\\Sent')
            if (sent.length !== 1) continue
            Object.assign(f, newFolder('sent', sent[0].path), { binding: 'detected' })
            save(path.join(dir, 'sync', 'sent.json'), f)
          }
          let last = 0
          await this.protocol.importFolder(
            client,
            dir,
            account,
            f,
            index,
            () => this.check(ctx),
            () => {
              if (Date.now() - last > 350) {
                last = Date.now()
                this.notify()
              }
            },
          )
          this.check(ctx)
        } catch (err) {
          this.check(ctx)
          this.errors[role] = diagnostic(err)
        }
      }
    } catch (err) {
      if (this.epoch === ctx.generation) {
        this.errors.inbox = diagnostic(err)
        this.errors.sent = this.errors.inbox
      }
    } finally {
      if (this.epoch === ctx.generation) {
        this.client?.close()
        this.client = undefined
        this.running = false
        this.notify()
        this.schedule(60000)
      }
    }
  }
}
