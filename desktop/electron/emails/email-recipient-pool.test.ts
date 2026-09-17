import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildEmailRecipientPool,
  classifyEmailLevel,
  pickDefaultRecipientKey,
} from './email-recipient-pool'

describe('email-recipient-pool', () => {
  it('classify generic vs personal', () => {
    assert.equal(classifyEmailLevel('info@x.com'), 'generic')
    assert.equal(classifyEmailLevel('erik@x.com'), 'personal')
  })

  it('builds company + personal chips; generic emails fold into company', () => {
    const pool = buildEmailRecipientPool({
      companyName: 'Acme',
      contacts: [
        { type: 'email', value: 'info@acme.com' },
        { type: 'email', value: 'sales@acme.com' },
        { type: 'email', value: 'erik@acme.com' },
      ],
      people: [
        {
          email: 'erik@acme.com',
          firstName: 'Erik',
          name: 'Erik Lee',
          title: 'Buyer',
        },
        {
          email: 'only.people@acme.com',
          firstName: 'Only',
          name: 'Only People',
          title: null,
        },
        {
          email: 'contact@acme.com',
          firstName: null,
          name: null,
          title: null,
        },
      ],
      slots: [
        {
          recipientKey: 'company',
          slotKind: 'company',
          email: 'info@acme.com',
          name: '',
          status: 'pending_review',
        },
      ],
      recipientKeyFromEmail: (email) =>
        email.replace('@', '_at_').replace(/\./g, '.'),
    })
    assert.equal(pool[0]?.kind, 'company')
    assert.equal(pool[0]?.email, 'info@acme.com')
    assert.deepEqual(pool[0]?.emails, [
      'info@acme.com',
      'sales@acme.com',
      'contact@acme.com',
    ])
    assert.equal(pool[0]?.hasDraft, true)
    // 通用级不单独成芯片
    assert.equal(
      pool.filter((p) => p.kind === 'person').length,
      2,
      'only personal emails become chips',
    )
    assert.ok(!pool.some((p) => p.email === 'info@acme.com' && p.kind === 'person'))
    assert.ok(!pool.some((p) => p.email === 'sales@acme.com'))
    assert.ok(!pool.some((p) => p.email === 'contact@acme.com'))
    const erik = pool.find((p) => p.email === 'erik@acme.com')
    assert.equal(erik?.displayName, 'Erik')
    assert.equal(erik?.source, 'both')
    assert.equal(erik?.hasDraft, false)
    assert.ok(pool.some((p) => p.email === 'only.people@acme.com'))
    assert.equal(pickDefaultRecipientKey(pool), 'company')
  })
})
