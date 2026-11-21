import assert from 'node:assert/strict'
import { test } from 'node:test'
import { gmailSettings } from './gmail-auth'
import { verifySmtp } from './protocol'

const { smtp } = gmailSettings('tester@example.com')
const credential = { accessToken: 'test-token' }

test('Gmail SMTP verification uses the first working encrypted endpoint', async () => {
  let calls = 0
  assert.deepEqual(await verifySmtp(smtp, credential, async () => { calls++ }), smtp)
  assert.equal(calls, 1)
  const selected = await verifySmtp(smtp, credential, async (endpoint, auth) => {
    assert.equal(auth, credential)
    if (endpoint.port === 465) throw Object.assign(new Error(), { code: 'ETLS' })
    assert.deepEqual(endpoint, { ...smtp, port: 587, security: 'starttls' })
  })
  assert.equal(selected.port, 587)
})

test('verification reports both connection phases without displaying server text or credentials', async () => {
  const probe = async (endpoint: typeof smtp) => {
    throw Object.assign(new Error('sensitive server text'), endpoint.port === 465
      ? { code: 'ESOCKET', originalCode: 'ECONNRESET' }
      : { code: 'ETIMEDOUT', timeoutType: 'GREETING_TIMEOUT' })
  }
  await assert.rejects(verifySmtp(smtp, credential, probe), (err: Error) => {
    assert.match(err.message, /465 TLS.*提前关闭.*ECONNRESET.*587 STARTTLS.*SMTP 问候/)
    assert.doesNotMatch(err.message, /sensitive|test-token/)
    return true
  })
})

test('credential rejection and manually configured connections only probe the configured port', async () => {
  for (const [auth, code] of [[credential, 'EAUTH'], ['app-password', 'ETLS']] as const) {
    const ports: number[] = []
    await assert.rejects(verifySmtp(smtp, auth, async e => {
      ports.push(e.port)
      throw Object.assign(new Error(), { code })
    }))
    assert.deepEqual(ports, [465])
  }
})
