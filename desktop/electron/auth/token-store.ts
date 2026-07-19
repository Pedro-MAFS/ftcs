import { app, safeStorage } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

export interface StoredTokenBundle {
  accessToken: string
  refreshToken?: string
  idToken?: string
  tokenType?: string
  scope?: string
  /** epoch ms */
  expiresAt?: number
  email?: string
  emailMasked?: string
  sub?: string
  obtainedAt: number
}

function storePath(): string {
  return path.join(app.getPath('userData'), 'oauth-tokens.bin')
}

export function loadTokenBundle(): StoredTokenBundle | null {
  const file = storePath()
  if (!fs.existsSync(file)) return null
  try {
    const raw = fs.readFileSync(file)
    const json = decrypt(raw)
    const data = JSON.parse(json) as StoredTokenBundle
    if (!data?.accessToken) return null
    return data
  } catch {
    return null
  }
}

export function saveTokenBundle(bundle: StoredTokenBundle): void {
  const file = storePath()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, encrypt(JSON.stringify(bundle)))
}

export function clearTokenBundle(): void {
  const file = storePath()
  if (fs.existsSync(file)) {
    try {
      fs.unlinkSync(file)
    } catch {
      // ignore
    }
  }
}

function encrypt(plain: string): Buffer {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(plain)
  }
  return Buffer.from(plain, 'utf8')
}

function decrypt(buf: Buffer): string {
  if (safeStorage.isEncryptionAvailable()) {
    try {
      return safeStorage.decryptString(buf)
    } catch {
      // fall through — may be plaintext from older build
    }
  }
  return buf.toString('utf8')
}
