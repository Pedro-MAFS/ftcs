export type FolderRole = 'inbox' | 'sent'
export type Mode = 'last_30_days' | 'from_connection'
export interface Endpoint {
  host: string
  port: number
  username: string
  security: 'tls' | 'starttls'
}
export interface AccountSettings {
  email: string
  imap: Endpoint
  smtp: Endpoint
}
export interface Connection extends AccountSettings {
  password: string
  mode: Mode
}
export interface Context {
  root: string
  generation: number
}
export interface Account extends AccountSettings {
  v: 1
  account_id: string
  address_key: string
  first_connected_at: string
  last_connected_at: string
  sync_from: string
  initial_sync_mode: Mode
}
export interface Folder {
  v: 1
  role: FolderRole
  folder_id: string | null
  remote_path: string | null
  binding: 'pending' | 'standard' | 'manual' | 'detected'
  phase: 'pending' | 'backfill' | 'incremental'
  uid_validity: number | null
  last_scanned_uid: number
  initial_upper_uid: number | null
  last_synced_at?: string
}
export interface AccountSummary extends AccountSettings {
  id: string
}
export interface Snapshot {
  context: Context
  active: string | null
  accounts: AccountSummary[]
  folders: { role: FolderRole; phase: Folder['phase']; path: string | null; error?: string }[]
  candidates: string[]
  imported: number
  contacts: string[]
  running: boolean
}
export type MailAction =
  | { kind: 'connect'; form: Connection }
  | { kind: 'bind'; path: string }
  | { kind: 'retry' }
  | { kind: 'disconnect' }
  | { kind: 'delete'; id: string }
export interface Conversation {
  id: string
  email: string
  name?: string
  company?: string
  preview: string
  lastAt: string
  lastId: string
  unread: number
  count: number
}
export interface MailAddress {
  email: string
  name?: string
}
export interface TimelineCursor {
  at: string
  id: string
}
export interface MessageView extends TimelineCursor {
  outgoing: boolean
  subject: string
  body: string
  from?: MailAddress
  to: MailAddress[]
  cc: MailAddress[]
  bcc: MailAddress[]
  attachments: { filename: string; size_bytes: number }[]
}
export interface TimelinePage {
  messages: MessageView[]
  before: TimelineCursor | null
}
export interface MailboxAPI {
  conversations(ctx: Context, account: string): Promise<Conversation[]>
  timeline(ctx: Context, account: string, contact: string, before?: TimelineCursor): Promise<TimelinePage>
  snapshot(): Promise<Snapshot>
  act(ctx: Context, action: MailAction): Promise<Snapshot>
  changed(callback: () => void): () => void
}
export function key(email: string) {
  const [local, domain] = email.trim().split('@')
  return local + '@' + (domain ?? '').toLowerCase()
}
export function validate(f: Connection) {
  if (
    !/^\S+@[^@\s]+$/.test(f.email) ||
    f.email.split('@').length !== 2 ||
    !f.password ||
    !['last_30_days', 'from_connection'].includes(f.mode)
  )
    throw new Error('请填写有效邮箱、授权码和同步范围。')
  for (const e of [f.imap, f.smtp]) {
    if (
      !e ||
      !/^[A-Za-z0-9.-]+$/.test(e.host) ||
      !e.username?.trim() ||
      !Number.isInteger(e.port) ||
      e.port < 1 ||
      e.port > 65535 ||
      !['tls', 'starttls'].includes(e.security)
    )
      throw new Error('请检查服务器、端口、登录名及加密方式。')
  }
}
