import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { simpleParser } from 'mailparser'
import type { SubmitMail } from './composer-store'
import { gmailSubmit, verifyGmailApi } from './gmail-api'

const signal = new AbortController().signal
const draft: Parameters<SubmitMail>[0] = {
  attempt_id: 'attempt-1', request_id: 'request-1', message_id: 'local-1',
  internet_message_id: '<message@example.com>', from: 'self@example.com',
  state: 'submitting', references: [], created_at: new Date().toISOString(), rev: 1,
  snapshot: {
    draft_id: 'draft-1', rev: 1, mode: 'new', contact_id: 'contact-1', email: 'friend@example.com',
    attachments: [], text_body: 'Hello', subject: 'Hello', subject_mode: 'first_line', updated_at: '',
    to: [{ email: 'friend@example.com', name: 'Alice' }], cc: [{ email: 'cc@example.org' }],
  },
}

test('account setup checks the active Gmail account with a read-only request', async () => {
  await verifyGmailApi(draft.from, 'token', signal, async (url, init) => {
    assert.equal(url, 'https://gmail.googleapis.com/gmail/v1/users/me/profile?fields=emailAddress')
    assert.equal(init.method ?? 'GET', 'GET')
    assert.equal(new Headers(init.headers).get('Authorization'), 'Bearer token')
    return Response.json({ emailAddress: draft.from })
  })
  await assert.rejects(verifyGmailApi(draft.from, 'token', signal, async () =>
    Response.json({ emailAddress: 'other@example.com' })), /邮箱与当前账号不一致/)
  await assert.rejects(verifyGmailApi(draft.from, 'token', signal, async () =>
    Response.json({ error: { details: [{ reason: 'SERVICE_DISABLED' }] } }, { status: 403 })), /启用 Gmail API/)
})

test('Gmail media upload preserves recipient addresses, inline images, attachment and reconciliation IDs', async () => {
  const attempt = { ...draft, snapshot: { ...draft.snapshot, html_body: '<b>Hello</b><img src="data:image/png;base64,aGVsbG8=">' } }
  let mime = Buffer.alloc(0)
  const submit = gmailSubmit('token', signal, async (url, init) => {
    assert.equal(url, 'https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=media')
    assert.equal(init.method, 'POST')
    assert.equal(new Headers(init.headers).get('Content-Type'), 'message/rfc822')
    mime = Buffer.from(init.body as Uint8Array)
    return Response.json({ id: 'remote-1' })
  })
  const files = [{ filename: '附件.txt', path: fileURLToPath(import.meta.url) }]
  assert.deepEqual(await submit(attempt, files), { state: 'accepted', accepted: ['friend@example.com', 'cc@example.org'], rejected: [] })
  const mail = await simpleParser(mime)
  assert.equal(mail.messageId, draft.internet_message_id)
  assert.equal(mail.headers.get('x-ftcs-send-id'), draft.attempt_id)
  assert.equal(mail.subject, 'Hello')
  assert.match(mail.html || '', /<b>Hello<\/b>/)
  assert.ok(mail.attachments.some(a => a.filename === '附件.txt' && a.content.length))
  assert.ok(mail.attachments.some(a => a.cid && a.content.toString() === 'hello'))
})

test('reply resolves the quoted Internet Message-ID and includes thread metadata and reply headers', async () => {
  const parent = '<quoted@example.com>'
  const methods: string[] = []
  const submit = gmailSubmit('token', signal, async (url, init) => {
    methods.push(init.method || 'GET')
    if (!init.method) {
      assert.equal(new URL(url).searchParams.get('q'), 'rfc822msgid:' + parent)
      return Response.json({ messages: [{ threadId: 'gmail-thread' }] })
    }
    assert.match(url, /uploadType=multipart/)
    const boundary = new Headers(init.headers).get('Content-Type')!.split('boundary=')[1]
    const parts = Buffer.from(init.body as Uint8Array).toString().split('--' + boundary)
    assert.match(parts[1], /"threadId":"gmail-thread"/)
    const mime = parts[2].slice(parts[2].indexOf('\r\n\r\n') + 4)
    const mail = await simpleParser(mime)
    assert.equal(mail.inReplyTo, parent)
    assert.equal(mail.references, parent)
    return Response.json({ id: 'reply' })
  })
  const result = await submit({ ...draft, in_reply_to: parent, references: [parent] }, [])
  assert.equal(result.state, 'accepted')
  assert.deepEqual(methods, ['GET', 'POST'])
})

test('submission errors preserve known rejection vs unknown delivery and never resubmit', async () => {
  for (const [status, expected] of [[403, 'failed'], [503, 'unknown'], [408, 'unknown'], [200, 'unknown'], [0, 'unknown']] as const) {
    let calls = 0
    const submit = gmailSubmit('token', signal, async () => {
      calls++
      if (!status) throw new Error('connection lost')
      return Response.json({}, { status })
    })
    assert.equal((await submit(draft, [])).state, expected)
    assert.equal(calls, 1)
  }
  const aborted = AbortSignal.abort()
  let requests = 0
  const submit = gmailSubmit('token', aborted, async () => { requests++; throw new Error() })
  assert.equal((await submit(draft, [])).state, 'failed')
  assert.equal(requests, 0)
})
