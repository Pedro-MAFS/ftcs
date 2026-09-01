import fs from 'node:fs'
import path from 'node:path'

export type EnvMap = Record<string, string>

/** 解析 .env 为键值（不展开引用） */
export function parseEnvFile(content: string): EnvMap {
  const result: EnvMap = {}
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    result[key] = value
  }
  return result
}

export function readEnvFile(envPath: string): EnvMap {
  if (!fs.existsSync(envPath)) return {}
  return parseEnvFile(fs.readFileSync(envPath, 'utf8'))
}

/**
 * 更新 .env 中指定键：已有行则替换，否则追加。
 * 保留原文件注释与其它键。
 */
export function upsertEnvFile(envPath: string, updates: EnvMap): void {
  const dir = path.dirname(envPath)
  fs.mkdirSync(dir, { recursive: true })

  const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : ''
  const lines = existing ? existing.split(/\r?\n/) : []
  const seen = new Set<string>()
  const nextLines: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      nextLines.push(line)
      continue
    }
    const eq = trimmed.indexOf('=')
    if (eq <= 0) {
      nextLines.push(line)
      continue
    }
    const key = trimmed.slice(0, eq).trim()
    if (Object.prototype.hasOwnProperty.call(updates, key)) {
      nextLines.push(`${key}=${escapeEnvValue(updates[key] ?? '')}`)
      seen.add(key)
    } else {
      nextLines.push(line)
    }
  }

  for (const [key, value] of Object.entries(updates)) {
    if (seen.has(key)) continue
    nextLines.push(`${key}=${escapeEnvValue(value)}`)
  }

  let body = nextLines.join('\n')
  if (!body.endsWith('\n')) body += '\n'
  fs.writeFileSync(envPath, body, 'utf8')
}

function escapeEnvValue(value: string): string {
  if (/[\s#"']/.test(value)) {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
  }
  return value
}

export function removeEnvKeys(envPath: string, keys: string[]): void {
  if (keys.length === 0) return
  if (!fs.existsSync(envPath)) return

  const keySet = new Set(keys)
  const existing = fs.readFileSync(envPath, 'utf8')
  const lines = existing.split(/\r?\n/)
  const nextLines = lines.filter((line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) return true
    const eq = trimmed.indexOf('=')
    if (eq <= 0) return true
    const key = trimmed.slice(0, eq).trim()
    return !keySet.has(key)
  })

  let body = nextLines.join('\n')
  if (!body.endsWith('\n')) body += '\n'
  fs.writeFileSync(envPath, body, 'utf8')
}

export function maskSecret(value: string): string {
  const v = value.trim()
  if (!v) return ''
  if (v.length <= 8) return '••••••••'
  return `${v.slice(0, 4)}••••••••••••${v.slice(-4)}`
}

export function isMaskedSecret(value: string): boolean {
  return value.includes('•') || value.includes('*')
}
