import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Account, Folder, FolderRole } from './types'

export function read<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}
export function atomic(file: string, value: string | Buffer) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const temp = file + '.' + randomUUID() + '.tmp'
  try {
    fs.writeFileSync(temp, value, { mode: 0o600, flush: true })
    fs.renameSync(temp, file)
  } finally {
    fs.rmSync(temp, { force: true })
  }
}
export function save(file: string, value: unknown) {
  atomic(file, JSON.stringify(value))
}
export function append(file: string, record: object) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const line = Buffer.from(JSON.stringify({ v: 1, ...record }) + '\n')
  fs.appendFileSync(file, line, { flush: true, mode: 0o600 })
  return { file, offset: fs.statSync(file).size - line.length, length: line.length - 1 }
}
export interface Position {
  file: string
  offset: number
  length: number
}
export async function eachLine(
  file: string,
  visit: (row: any, position: Position) => void,
  guard: () => void,
) {
  // A crash during append can leave an incomplete final line. Preserve that fragment for diagnosis.
  const fd = fs.openSync(file, 'r+')
  try {
    const chunk = Buffer.alloc(65536)
    let tail: Buffer = Buffer.alloc(0),
      complete = 0
    let chunks = 0
    for (;;) {
      if (++chunks % 8 === 0) {
        await new Promise<void>((resolve) => setImmediate(resolve))
        guard()
      }
      const size = fs.readSync(fd, chunk)
      if (!size) break
      const data = Buffer.concat([tail, chunk.subarray(0, size)])
      let start = 0
      for (let end = data.indexOf(10); end >= 0; end = data.indexOf(10, start)) {
        visit(JSON.parse(data.toString('utf8', start, end)), { file, offset: complete, length: end - start })
        complete += end - start + 1
        start = end + 1
      }
      tail = Buffer.from(data.subarray(start))
    }
    if (tail.length) {
      atomic(file + '.partial', tail)
      fs.ftruncateSync(fd, complete)
    }
  } finally {
    fs.closeSync(fd)
  }
}
export const uuid = (s: string) => /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(s)
export function accountDir(base: string, id: string) {
  if (!uuid(id)) throw new Error('邮箱账号标识无效。')
  return path.join(base, 'accounts', id)
}
export function accounts(base: string) {
  const dir = path.join(base, 'accounts')
  return fs.existsSync(dir)
    ? fs
        .readdirSync(dir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && uuid(d.name))
        .map((d) => read<Account>(path.join(dir, d.name, 'account.json')))
    : []
}
export function newFolder(role: FolderRole, remote: string | null = null): Folder {
  return {
    v: 1,
    role,
    folder_id: remote ? randomUUID() : null,
    remote_path: remote,
    binding: remote ? 'standard' : 'pending',
    phase: remote ? 'backfill' : 'pending',
    uid_validity: null,
    last_scanned_uid: 0,
    initial_upper_uid: null,
  }
}
