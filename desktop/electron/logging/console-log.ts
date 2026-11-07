import fs from 'node:fs'
import path from 'node:path'
import { format } from 'node:util'

const MAX_BYTES = 5 * 1024 * 1024
const BACKUPS = 3

export function redactLogSecrets(text: string): string {
  return text
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/gi, '[REDACTED]')
    .replace(/\bAIza[0-9A-Za-z_-]{20,}\b/g, '[REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED]')
    .replace(/(["']?(?:x-api-key|api[_ -]?key|access[_ -]?token|refresh[_ -]?token|token|password|secret|authorization)["']?\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s&,}\]]+)/gi, '$1[REDACTED]')
}

export function createConsoleLogWriter(logDir: string, maxBytes = MAX_BYTES) {
  const filePath = path.join(logDir, 'desktop.log')
  let size: number | undefined

  function write(source: string, level: string, message: string): void {
    try {
      fs.mkdirSync(logDir, { recursive: true })
      if (size === undefined) {
        try { size = fs.statSync(filePath).size } catch { size = 0 }
      }
      const sanitized = redactLogSecrets(message)
      // Bound one entry too, so a single huge console message cannot defeat rotation.
      const text = sanitized.length > maxBytes / 4
        ? `${sanitized.slice(0, Math.floor(maxBytes / 4))}… [截断]`
        : sanitized
      const line = `[${new Date().toISOString()}] [${source}] [${level}] ${text}\n`
      const bytes = Buffer.byteLength(line, 'utf8')
      if (size > 0 && size + bytes > maxBytes) {
        for (let i = BACKUPS - 1; i >= 1; i -= 1) {
          const from = `${filePath}.${i}`
          if (fs.existsSync(from)) fs.renameSync(from, `${filePath}.${i + 1}`)
        }
        if (fs.existsSync(filePath)) fs.renameSync(filePath, `${filePath}.1`)
        size = 0
      }
      fs.appendFileSync(filePath, line, 'utf8')
      size += bytes
    } catch {
      // Logging must never prevent the application from running.
      size = undefined
    }
  }

  return { filePath, write }
}

export function installConsoleLogging(logDir: string) {
  const writer = createConsoleLogWriter(logDir)
  for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    const original = console[level].bind(console)
    console[level] = (...args: unknown[]) => {
      original(...args)
      try { writer.write('main', level, format(...args)) } catch { /* ignore logging errors */ }
    }
  }
  return writer
}
