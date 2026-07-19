import crypto from 'node:crypto'

export function randomUrlSafe(bytes = 32): string {
  return base64Url(crypto.randomBytes(bytes))
}

export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomUrlSafe(32)
  const challenge = base64Url(crypto.createHash('sha256').update(verifier).digest())
  return { verifier, challenge }
}

function base64Url(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}
