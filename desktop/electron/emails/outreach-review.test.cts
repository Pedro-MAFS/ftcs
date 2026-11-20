import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { randomUUID } from 'node:crypto'
import { test, type TestContext } from 'node:test'
import type { ImapFlow } from 'imapflow'
import type { Account } from '../mailbox/types'
import { newFolder } from '../mailbox/storage'
import { ImportIndex } from '../mailbox/conversations'
import { MailboxService } from '../mailbox/service'
import { importFolder } from '../mailbox/import'
import type { SubmitMail } from '../mailbox/composer-store'
import type { ReviewSend } from '../mailbox/outreach-types'
import { getEmailDraftSlot } from './emails-reader'
import { approveForDelivery } from './outreach-review'
import { approveEmailDraft, rejectEmailDraft, saveEmailDraftSlot } from './emails-writer'
import {
  saveEmailDraftZh,
  saveEmailDraftSlot as rewrite,
} from '../../../workspace/mcp-servers/lead-store/src/email-storage'

const primary = 'info@example.test',
  to = 'sales@example.test'
const company = { kind: 'company' } as const
function write(file: string, value: object) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(value))
}
async function setup(t: TestContext, transport: SubmitMail) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ftcs-outreach-'))
  const service = new MailboxService(
    () => root,
    {
      dir: path.join(root, 'vault'),
      encrypt: (s) => Buffer.from(s),
      decrypt: (b) => b.toString(),
    },
    () => {},
    {
      verify: async () => {},
      imapClient: () => {
        throw new Error('offline')
      },
      importFolder,
      smtpSubmit: () => transport,
    },
  )
  t.after(() => {
    service.stop()
    fs.rmSync(root, { recursive: true, force: true })
  })
  const endpoint = { host: 'smtp.test', port: 465, username: 'me', security: 'tls' as const }
  const form = {
    email: 'me@ftcs.test',
    password: 'dummy',
    mode: 'from_connection' as const,
    imap: endpoint,
    smtp: endpoint,
  }
  const connected = await service.act(service.snapshot().context, { kind: 'connect', form })
  const account = connected.active!,
    ctx = connected.context
  function draft(productId: string) {
    const leadId = productId + '-lead'
    const raw = {
      id: 'draft',
      product_id: productId,
      lead_id: leadId,
      status: 'pending_review',
      audience: 'company',
      created_at: '2026-01-01',
      language: 'en',
      recipient: { company: 'Example', email: primary, recipient_aliases: [to] },
      subject: 'original',
      body: 'original body',
      subject_zh: '中文参考',
      body_zh: '不外发',
    }
    write(path.join(root, 'data', 'emails', leadId, 'draft.json'), raw)
    write(path.join(root, 'data', 'leads', productId, 'scored.json'), {
      leads: [{ id: leadId, tier: 'high' }],
    })
    const slot = { productId, leadId, recipientKey: 'company' }
    const detail = () => getEmailDraftSlot(productId, leadId, 'company', root)
    const edit = (): ReviewSend => ({
      ...slot,
      version: detail().version!,
      request: randomUUID(),
      to,
      subject: 'User subject',
      body: 'Line one\nLine two',
    })
    return { slot, detail, edit, raw }
  }
  const send = (edit: ReviewSend) => service.sendReview(ctx, account, edit, approveForDelivery)
  return { root, service, ctx, account, form, draft, send }
}

test('单次审核发送冻结选中地址和原文；双击、两产品消息、已有私信草稿', async (t) => {
  let submits = 0
  let started!: () => void, finish!: () => void
  const entered = new Promise<void>((resolve) => {
    started = resolve
  })
  const release = new Promise<void>((resolve) => {
    finish = resolve
  })
  const { root, service, ctx, account, draft, send } = await setup(t, async (a) => {
    submits++
    assert.deepEqual(a.snapshot.to, [{ email: to }])
    assert.deepEqual(a.snapshot.cc, [])
    assert.equal(a.snapshot.subject, 'User subject')
    assert.equal(a.snapshot.text_body, 'Line one\nLine two')
    assert.equal(a.in_reply_to, undefined)
    assert.deepEqual(a.snapshot.attachments, [])
    started()
    await release
    return { state: 'accepted' }
  })
  const privateDraft = await service.composer(ctx, account, to, { kind: 'get' })
  const saved = await service.composer(ctx, account, to, {
    kind: 'save',
    version: privateDraft.draft,
    edit: { mode: 'new', text_body: '私信草稿' },
  })
  const first = draft('p1'),
    edit = first.edit()
  const pending = send(edit)
  await entered
  assert.equal(first.detail().status, 'approved')
  assert.equal((await send({ ...edit, request: randomUUID() }))?.state, 'submitting')
  assert.throws(() => rejectEmailDraft({ ...first.slot, scope: 'lead' }, root), /正在发送/)
  assert.throws(() => rewrite(root, first.slot.leadId, company, first.raw), /正在发送/)
  assert.equal(
    saveEmailDraftZh(root, first.slot.leadId, company, { subject_zh: '新中文', body_zh: '翻译' }).success,
    true,
  )
  assert.equal(first.detail().outreach?.request_id, edit.request)
  finish()
  const accepted = await pending
  assert.equal(accepted?.state, 'accepted')
  assert.equal((await send(edit))?.message, accepted.message)
  assert.equal(submits, 1)
  const second = await send(draft('p2').edit())
  assert.equal(second?.contact, accepted.contact)
  const timeline = await service.timeline(ctx, account, accepted.contact)
  assert.deepEqual(timeline.messages.map((m) => m.source?.product_id).sort(), ['p1', 'p2'])
  assert.equal(
    (await service.composer(ctx, account, to, { kind: 'get' })).draft.draft_id,
    saved.draft.draft_id,
  )
  assert.equal(submits, 2)
})

test('明确失败可改投；未确认、切换账号、旧版页面和非法地址不会重复投递', async (t) => {
  let submits = 0
  const { root, service, ctx, account, form, draft, send } = await setup(t, async () => ({
    state: ++submits === 1 ? 'failed' : 'unknown',
  }))
  const first = draft('p1'),
    stale = first.edit()
  assert.equal(approveEmailDraft({ ...first.slot, selectedTo: to }, root).ok, true)
  assert.equal(first.detail().selectedTo, to)
  await assert.rejects(send(stale), /已更新/)
  await assert.rejects(send({ ...first.edit(), to: 'outsider@example.test' }), /地址/)
  const failed = first.edit()
  assert.equal((await send(failed))?.state, 'failed')
  assert.equal((await send(failed))?.state, 'failed')
  assert.deepEqual(await service.conversations(ctx, account), [])
  const before = first.detail().outreach!.review_id
  const retry = { ...first.edit(), to: primary }
  assert.equal((await send(retry))?.state, 'unknown')
  assert.notEqual(first.detail().outreach!.review_id, before)
  assert.throws(() => saveEmailDraftSlot({ ...retry, subject: 'replacement' }, root), /等待核对/)
  assert.equal((await send({ ...retry, request: randomUUID() }))?.state, 'unknown')
  await service.act(ctx, { kind: 'disconnect' })
  const b = await service.act(service.snapshot().context, {
    kind: 'connect',
    form: { ...form, email: 'b@ftcs.test' },
  })
  await assert.rejects(service.sendReview(b.context, b.active!, first.edit(), approveForDelivery), /原邮箱/)
  await service.act(b.context, { kind: 'disconnect' })
  const a = await service.act(service.snapshot().context, { kind: 'connect', form })
  assert.equal((await service.reviewResult(a.context, account, first.slot, retry.request))?.state, 'unknown')
  assert.equal(submits, 2)
})

test('恢复中断提交并以服务器副本核对，保留来源和消息定位', async (t) => {
  let marker = ''
  const { root, service, account, draft, send } = await setup(t, async (a) => {
    marker = a.attempt_id
    return { state: 'unknown' }
  })
  const approved = draft('p1'),
    edit = approved.edit()
  const pending = (await send(edit))!
  service.stop()
  const dir = path.join(root, 'data', 'mail', 'accounts', account)
  const log = path.join(dir, 'sends', pending.at.slice(0, 7) + '.jsonl')
  const [started] = fs.readFileSync(log, 'utf8').trimEnd().split('\n')
  fs.writeFileSync(log, started + '\n') // Exit after journaling submission, before the SMTP result.
  const index = await ImportIndex.load(dir, () => {})
  assert.equal(index.composer.outreachResult(edit.request, edit)?.state, 'unknown')
  const folder = newFolder('sent', 'Sent')
  const raw = Buffer.from(
    [
      'From: me@ftcs.test',
      'To: ' + to,
      'Message-ID: <rewritten@example.test>',
      'X-FTCS-Send-ID: ' + marker,
      'Subject: Server subject',
      '',
      'Server body',
    ].join('\r\n'),
  )
  const client = {
    mailboxOpen: async () => ({ uidValidity: 1, uidNext: 2 }),
    search: async () => [1],
    fetchOne: async () => ({ source: raw, internalDate: new Date() }),
  } as unknown as ImapFlow
  await importFolder(
    client,
    dir,
    { address_key: 'me@ftcs.test', sync_from: '2020-01-01' } as Account,
    folder,
    index,
    () => {},
    () => {},
  )
  const recovered = await ImportIndex.load(dir, () => {})
  const result = recovered.composer.outreachResult(edit.request, edit)!
  assert.equal(result.state, 'accepted')
  assert.equal(result.message, pending.message)
  const [message] = (await recovered.timeline(result.contact, undefined, () => {}, result.message)).messages
  assert.equal(recovered.count, 1)
  assert.equal(message.subject, 'Server subject')
  assert.equal(message.source?.review_id, approved.detail().outreach?.review_id)
  assert.equal(message.source?.lead_id, edit.leadId)
})
