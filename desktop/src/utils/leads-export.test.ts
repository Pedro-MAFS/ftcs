import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { LeadRowDto } from '../types/electron'
import { buildLeadsCsv } from './leads-export'

function row(partial: Partial<LeadRowDto>): LeadRowDto {
  return {
    id: 'l1',
    productId: 'p1',
    phase: 'scored',
    companyName: 'Acme',
    domain: 'acme.com',
    country: '',
    tier: 'high',
    tierLabel: '高',
    score: 80,
    matchReason: '',
    sourceUrl: '',
    round: 'R1',
    status: 'new',
    discoveredAt: '',
    queryId: '',
    runId: '',
    rawScore: null,
    dedupeKey: '',
    keptLeadId: '',
    discardReason: '',
    company: { name: 'Acme', website: '', country: '' },
    source: { url: '', title: '', snippet: '' },
    scoreBreakdown: null,
    contacts: [],
    contactLabel: 'a@acme.com · +1',
    people: [],
    peopleLabel: '',
    record: {},
    ...partial,
  }
}

describe('buildLeadsCsv', () => {
  it('联系方式用英文逗号列出全部，关键联系人用中文分号拼接', () => {
    const csv = buildLeadsCsv([
      row({
        contacts: [
          { type: 'email', value: 'a@acme.com' },
          { type: 'email', value: 'b@acme.com' },
        ],
        people: [
          {
            id: 'p1',
            name: 'Ann',
            firstName: null,
            lastName: null,
            title: '',
            email: 'ann@acme.com',
            emailStatus: '',
            confidence: null,
            roleMatch: '',
            matchReason: '',
            provider: 'hunter',
            sources: [],
            enrichedAt: '',
          },
          {
            id: 'p2',
            name: 'Bob',
            firstName: null,
            lastName: null,
            title: '',
            email: 'bob@acme.com',
            emailStatus: '',
            confidence: null,
            roleMatch: '',
            matchReason: '',
            provider: 'manual',
            sources: [],
            enrichedAt: '',
          },
        ],
      }),
    ])
    assert.match(csv, /联系方式,关键联系人/)
    assert.match(csv, /a@acme.com,b@acme.com/)
    assert.doesNotMatch(csv, /· \+1/)
    assert.match(csv, /Ann：ann@acme.com；Bob：bob@acme.com/)
  })
})
