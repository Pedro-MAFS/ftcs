import {
  existsSync,
  openSync,
  readSync,
  closeSync,
  mkdirSync,
  rmSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { join } from 'node:path'

// The Electron process and the standalone MCP process both edit these files.
// Announce the local writer before checking for competitors. Simultaneous
// writers may both retry; neither can enter while the other is writing.
export function withEmailDraftWrite<T>(root: string, lead: string, write: () => T): T {
  const dir = join(root, '.ftcs', 'locks', 'email-review')
  mkdirSync(dir, { recursive: true })
  const prefix = createHash('sha256').update(lead).digest('hex') + '.'
  const owner = prefix + process.pid + '.' + randomUUID()
  const marker = join(dir, owner)
  writeFileSync(marker, '')
  try {
    for (const name of readdirSync(dir)) {
      if (name === owner || !name.startsWith(prefix)) continue
      const pid = Number(name.slice(prefix.length).split('.')[0])
      if (!Number.isSafeInteger(pid) || pid <= 0) continue
      try {
        process.kill(pid, 0)
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ESRCH') {
          rmSync(join(dir, name), { force: true })
          continue
        }
      }
      throw new Error('开发信正在其他进程中更新，请稍后重试。')
    }
    return write()
  } finally {
    unlinkSync(marker)
  }
}

/** Desktop-owned pointer into the original account's send journal. */
export interface OutreachBinding {
  account_id: string
  review_id: string
  request_id: string
  created_at: string
  offset: number
}

export function reviewDeliveryState(root: string, binding: OutreachBinding) {
  if (
    !/^[a-f0-9-]{36}$/i.test(binding.account_id) ||
    !/^\d{4}-\d{2}-/.test(binding.created_at) ||
    !Number.isSafeInteger(binding.offset) ||
    binding.offset < 0
  )
    throw new Error('开发信发送记录无效，请核对邮箱。')
  const log = join(
    root,
    'data',
    'mail',
    'accounts',
    binding.account_id,
    'sends',
    binding.created_at.slice(0, 7) + '.jsonl',
  )
  if (!existsSync(log)) return
  // Start at the saved journal offset. Read only complete records, including a
  // later IMAP confirmation. Unrelated snapshots can contain large attachments.
  const fd = openSync(log, 'r')
  const chunk = Buffer.alloc(65536)
  let parts: Buffer[] = []
  let pos = binding.offset
  let state: 'submitting' | 'accepted' | 'failed' | 'unknown' | undefined
  try {
    for (;;) {
      const n = readSync(fd, chunk, 0, chunk.length, pos)
      if (!n) break
      pos += n
      let start = 0
      for (let end = chunk.indexOf(10); end >= 0 && end < n; end = chunk.indexOf(10, start)) {
        parts.push(chunk.subarray(start, end))
        const line = parts.length === 1 ? parts[0] : Buffer.concat(parts)
        if (line.includes(binding.request_id)) {
          const row = JSON.parse(line.toString('utf8'))
          if (row.request_id === binding.request_id) {
            state = row.state
            if (state === 'accepted') return state
          }
        }
        parts = []
        start = end + 1
      }
      if (start < n) parts.push(Buffer.from(chunk.subarray(start, n)))
    }
  } finally {
    closeSync(fd)
  }
  return state
}

export function assertReviewEditable(root: string, binding?: OutreachBinding, replace = false) {
  if (!binding) return
  const state = reviewDeliveryState(root, binding)
  if (state === 'submitting' || state === 'unknown')
    throw new Error('这封开发信正在发送或等待核对，请先检查已发送邮件。')
  if (state === 'accepted' && !replace) throw new Error('这封开发信已发送。如需编写新稿，请选择重写。')
}
