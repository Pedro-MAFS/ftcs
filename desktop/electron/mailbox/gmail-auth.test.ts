import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { authorizeGmail, refreshGmail } from './gmail-auth'

test('desktop Gmail authorization binds the verified address and exchanges a single PKCE callback', async (t) => {
  const request = globalThis.fetch
  let challenge = ''
  let redirect = ''
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    if (url === 'https://openidconnect.googleapis.com/v1/userinfo') {
      assert.equal(new Headers(init.headers).get('Authorization'), 'Bearer access')
      return Response.json({ email: 'me@example.com', email_verified: true })
    }
    assert.equal(url, 'https://oauth2.googleapis.com/token')
    const params = new URLSearchParams(init.body as URLSearchParams)
    assert.equal(params.get('redirect_uri'), redirect)
    assert.equal(params.get('code'), 'test-code')
    assert.equal(createHash('sha256').update(params.get('code_verifier')!).digest('base64url'), challenge)
    return Response.json({ access_token: 'access', refresh_token: 'refresh', expires_in: 3600, scope: 'https://mail.google.com/ email openid' })
  })
  const grant = await authorizeGmail(async url => {
    const { searchParams } = new URL(url)
    redirect = searchParams.get('redirect_uri')!
    challenge = searchParams.get('code_challenge')!
    assert.equal(searchParams.get('code_challenge_method'), 'S256')
    assert.equal(searchParams.get('access_type'), 'offline')
    assert.equal((await request(redirect + '?code=wrong&state=wrong')).status, 404)
    const callback = new URL(redirect)
    callback.searchParams.set('code', 'test-code')
    callback.searchParams.set('state', searchParams.get('state')!)
    assert.equal((await request(callback)).status, 200)
  }, new AbortController().signal)
  assert.equal(grant.settings.email, 'me@example.com')
  assert.equal(grant.settings.imap.username, grant.settings.email)
  assert.equal(grant.settings.smtp.host, 'smtp.gmail.com')
  assert.equal(grant.tokens.refreshToken, 'refresh')
})

test('refresh preserves the offline credential and reports revoked consent', async t => {
  const old = { accessToken: 'old', refreshToken: 'refresh', expiresAt: 0 }
  const signal = new AbortController().signal
  let revoked = false
  t.mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
    assert.equal(new URLSearchParams(init.body as URLSearchParams).get('refresh_token'), old.refreshToken)
    return revoked ? Response.json({ error: 'invalid_grant' }, { status: 400 })
      : Response.json({ access_token: 'new', expires_in: 3600 })
  })
  const updated = await refreshGmail(old, signal)
  assert.equal(updated.refreshToken, old.refreshToken)
  assert.equal(updated.accessToken, 'new')
  revoked = true
  await assert.rejects(refreshGmail(updated, signal), { code: 'GMAIL_REAUTH' })
})
