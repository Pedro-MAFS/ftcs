import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

export { buildLoginIdentity, shouldPromptGatewayReset } from './auth-identity'

function metaPath(): string {
  return path.join(app.getPath('userData'), 'auth-meta.json')
}

export function loadLastLoginIdentity(): string | null {
  const file = metaPath()
  if (!fs.existsSync(file)) return null
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8')) as {
      lastLoginIdentity?: string
    }
    const id = String(data?.lastLoginIdentity || '').trim()
    return id || null
  } catch {
    return null
  }
}

export function saveLastLoginIdentity(identity: string): void {
  const id = identity.trim()
  if (!id) return
  const file = metaPath()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(
    file,
    `${JSON.stringify({ lastLoginIdentity: id }, null, 2)}\n`,
    'utf8',
  )
}

