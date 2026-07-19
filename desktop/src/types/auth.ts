export interface AuthSessionSnapshot {
  loggedIn: boolean
  loginPending: boolean
  emailMasked: string
  scopes: string[]
  issuer: string
  clientId: string
  redirectUri: string
  expiresAt: string | null
  accessExpiresInSec: number | null
  error: string
}

export interface AuthActionResult {
  ok: boolean
  message: string
  session: AuthSessionSnapshot
  needLogin?: boolean
}

export function emptyAuthSession(): AuthSessionSnapshot {
  return {
    loggedIn: false,
    loginPending: false,
    emailMasked: '',
    scopes: [],
    issuer: '',
    clientId: '',
    redirectUri: '',
    expiresAt: null,
    accessExpiresInSec: null,
    error: '',
  }
}
