import assert from 'node:assert/strict'
import { test } from 'node:test'
import { verifySmtp } from './protocol'

test('manual SMTP verification reports the failing endpoint without exposing server text', async () => {
  const smtp = { host: 'mail.example.com', username: 'a', port: 465, security: 'tls' as const }
  let probes = 0
  await assert.rejects(verifySmtp(smtp, 'app-password', async endpoint => {
    probes++
    assert.deepEqual(endpoint, smtp)
    throw Object.assign(new Error('sensitive server text'), { code: 'ESOCKET', originalCode: 'ECONNRESET' })
  }), (err: Error) => {
    assert.match(err.message, /465 TLS.*提前关闭.*ECONNRESET/)
    assert.doesNotMatch(err.message, /sensitive|app-password/)
    return true
  })
  assert.equal(probes, 1)
})
