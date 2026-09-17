import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, it } from 'node:test'
import {
  approveEmailDraft,
  rejectEmailDraft,
  recomputeLeadEmailStatus,
} from './emails-writer.ts'

const temps: string[] = []

function makeWorkspace(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ftcs-email-writer-'))
  temps.push(dir)
  return dir
}

function writeScored(
  workspace: string,
  productId: string,
  leadId: string,
  status: string,
): void {
  const scoredDir = path.join(workspace, 'data', 'leads', productId)
  fs.mkdirSync(scoredDir, { recursive: true })
  fs.writeFileSync(
    path.join(scoredDir, 'scored.json'),
    `${JSON.stringify(
      {
        product_id: productId,
        updated_at: new Date().toISOString(),
        leads: [
          {
            id: leadId,
            company_name: 'Acme',
            tier: 'high',
            status,
            score: 90,
          },
        ],
        stats: { total: 1, by_tier: { high: 1 }, by_status: { [status]: 1 } },
      },
      null,
      2,
    )}\n`,
    'utf8',
  )
}

function writeDraft(
  workspace: string,
  leadId: string,
  recipientKey: string,
  status: string,
  subject: string,
): void {
  const leadDir = path.join(workspace, 'data', 'emails', leadId)
  const dir =
    recipientKey === 'company' ? leadDir : path.join(leadDir, recipientKey)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'draft.json'),
    `${JSON.stringify(
      {
        lead_id: leadId,
        recipient_key: recipientKey,
        status,
        subject,
        body: `Body for ${recipientKey}`,
        language: 'en',
        audience: recipientKey === 'company' ? 'company' : 'person',
        selected_variant: 'short',
        variants: [
          { type: 'short', subject, body: `Body for ${recipientKey}` },
        ],
      },
      null,
      2,
    )}\n`,
    'utf8',
  )
}

function readLeadStatus(
  workspace: string,
  productId: string,
  leadId: string,
): string {
  const raw = JSON.parse(
    fs.readFileSync(
      path.join(workspace, 'data', 'leads', productId, 'scored.json'),
      'utf8',
    ),
  ) as { leads: Array<{ id: string; status: string }> }
  const lead = raw.leads.find((l) => l.id === leadId)
  assert.ok(lead)
  return lead.status
}

afterEach(() => {
  while (temps.length) {
    const dir = temps.pop()
    if (dir) fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('rejectEmailDraft scope=slot', () => {
  it('deletes only the person slot and keeps company draft', () => {
    const ws = makeWorkspace()
    const productId = 'p1'
    const leadId = 'lead-1'
    const personKey = 'erik_at_acme.com'
    writeScored(ws, productId, leadId, 'email_drafted')
    writeDraft(ws, leadId, 'company', 'pending_review', 'Company subj')
    writeDraft(ws, leadId, personKey, 'pending_review', 'Person subj')

    const res = rejectEmailDraft(
      { productId, leadId, scope: 'slot', recipientKey: personKey },
      ws,
    )
    assert.equal(res.ok, true)
    assert.equal(res.remainingDraftCount, 1)
    assert.equal(res.leadStatus, 'email_drafted')
    assert.equal(
      fs.existsSync(path.join(ws, 'data', 'emails', leadId, 'draft.json')),
      true,
    )
    assert.equal(
      fs.existsSync(path.join(ws, 'data', 'emails', leadId, personKey)),
      false,
    )
    assert.equal(readLeadStatus(ws, productId, leadId), 'email_drafted')
  })

  it('defaults scope to slot', () => {
    const ws = makeWorkspace()
    const productId = 'p1'
    const leadId = 'lead-1'
    writeScored(ws, productId, leadId, 'email_drafted')
    writeDraft(ws, leadId, 'company', 'pending_review', 'A')
    writeDraft(ws, leadId, 'bob_at_x.com', 'pending_review', 'B')

    const res = rejectEmailDraft(
      { productId, leadId, recipientKey: 'company' },
      ws,
    )
    assert.equal(res.ok, true)
    assert.equal(res.scope, 'slot')
    assert.equal(res.remainingDraftCount, 1)
    assert.equal(
      fs.existsSync(path.join(ws, 'data', 'emails', leadId, 'bob_at_x.com', 'draft.json')),
      true,
    )
  })

  it('falls back to new when last slot is removed', () => {
    const ws = makeWorkspace()
    const productId = 'p1'
    const leadId = 'lead-1'
    writeScored(ws, productId, leadId, 'email_approved')
    writeDraft(ws, leadId, 'company', 'approved', 'Only')

    const res = rejectEmailDraft(
      { productId, leadId, scope: 'slot', recipientKey: 'company' },
      ws,
    )
    assert.equal(res.ok, true)
    assert.equal(res.remainingDraftCount, 0)
    assert.equal(res.leadStatus, 'new')
    assert.equal(fs.existsSync(path.join(ws, 'data', 'emails', leadId)), false)
    assert.equal(readLeadStatus(ws, productId, leadId), 'new')
  })

  it('keeps email_approved when another approved slot remains', () => {
    const ws = makeWorkspace()
    const productId = 'p1'
    const leadId = 'lead-1'
    const personKey = 'erik_at_acme.com'
    writeScored(ws, productId, leadId, 'email_approved')
    writeDraft(ws, leadId, 'company', 'pending_review', 'Company')
    writeDraft(ws, leadId, personKey, 'approved', 'Person')

    const res = rejectEmailDraft(
      { productId, leadId, scope: 'slot', recipientKey: 'company' },
      ws,
    )
    assert.equal(res.ok, true)
    assert.equal(res.leadStatus, 'email_approved')
    assert.equal(readLeadStatus(ws, productId, leadId), 'email_approved')
  })
})

describe('rejectEmailDraft scope=lead', () => {
  it('removes entire email directory and sets new', () => {
    const ws = makeWorkspace()
    const productId = 'p1'
    const leadId = 'lead-1'
    writeScored(ws, productId, leadId, 'email_drafted')
    writeDraft(ws, leadId, 'company', 'pending_review', 'A')
    writeDraft(ws, leadId, 'bob_at_x.com', 'pending_review', 'B')

    const res = rejectEmailDraft(
      { productId, leadId, scope: 'lead' },
      ws,
    )
    assert.equal(res.ok, true)
    assert.equal(res.remainingDraftCount, 0)
    assert.equal(res.leadStatus, 'new')
    assert.equal(fs.existsSync(path.join(ws, 'data', 'emails', leadId)), false)
    assert.equal(readLeadStatus(ws, productId, leadId), 'new')
  })
})

describe('approveEmailDraft + recompute', () => {
  it('approves person slot without changing company file', () => {
    const ws = makeWorkspace()
    const productId = 'p1'
    const leadId = 'lead-1'
    const personKey = 'erik_at_acme.com'
    writeScored(ws, productId, leadId, 'email_drafted')
    writeDraft(ws, leadId, 'company', 'pending_review', 'Company keep')
    writeDraft(ws, leadId, personKey, 'pending_review', 'Person old')

    const companyPath = path.join(ws, 'data', 'emails', leadId, 'draft.json')
    const companyBefore = fs.readFileSync(companyPath, 'utf8')

    const res = approveEmailDraft(
      {
        productId,
        leadId,
        recipientKey: personKey,
        subject: 'Person approved',
        body: 'Hi Erik',
      },
      ws,
    )
    assert.equal(res.ok, true)
    assert.equal(res.leadStatus, 'email_approved')
    assert.equal(readLeadStatus(ws, productId, leadId), 'email_approved')

    const companyAfter = fs.readFileSync(companyPath, 'utf8')
    assert.equal(companyAfter, companyBefore)

    const person = JSON.parse(
      fs.readFileSync(
        path.join(ws, 'data', 'emails', leadId, personKey, 'draft.json'),
        'utf8',
      ),
    ) as { status: string; subject: string }
    assert.equal(person.status, 'approved')
    assert.equal(person.subject, 'Person approved')
  })

  it('recomputeLeadEmailStatus maps statuses', () => {
    const ws = makeWorkspace()
    const productId = 'p1'
    const leadId = 'lead-1'
    writeScored(ws, productId, leadId, 'new')
    writeDraft(ws, leadId, 'company', 'pending_review', 'A')
    const drafted = recomputeLeadEmailStatus(productId, leadId, ws)
    assert.equal(drafted.ok, true)
    assert.equal(drafted.leadStatus, 'email_drafted')

    writeDraft(ws, leadId, 'bob_at_x.com', 'approved', 'B')
    const approved = recomputeLeadEmailStatus(productId, leadId, ws)
    assert.equal(approved.leadStatus, 'email_approved')
  })
})
