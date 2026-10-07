import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { register } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import test from 'node:test'

const here = path.dirname(fileURLToPath(import.meta.url))
register(pathToFileURL(path.join(here, 'electron-test-hook.mjs')).href)

const { applyIcebreakEdit, saveLeadIcebreak } = await import('./lead-writer.ts')
const { projectCompanyIntelligence } = await import('./leads-reader.ts')

const portrait = {
  businessModel: '区域经销',
  productsBrands: '暂无公开信息',
  targetMarket: '德国零售',
  supplyChain: '工厂直采',
  industryPosition: '当地分销',
  collabOpportunity: '可寄样',
  icebreak: '原来的破冰',
  status: 'ready' as const,
  updatedAt: '2026-10-01T00:00:00.000Z',
}

test('applyIcebreakEdit only changes icebreak and updatedAt', () => {
  const next = applyIcebreakEdit(portrait, '新的破冰', '2026-10-07T00:00:00.000Z')
  assert.equal(next.icebreak, '新的破冰')
  assert.equal(next.updatedAt, '2026-10-07T00:00:00.000Z')
  assert.equal(next.status, portrait.status)
  assert.equal(next.businessModel, portrait.businessModel)
  assert.equal(next.productsBrands, portrait.productsBrands)
  assert.equal(next.targetMarket, portrait.targetMarket)
  assert.equal(next.supplyChain, portrait.supplyChain)
  assert.equal(next.industryPosition, portrait.industryPosition)
  assert.equal(next.collabOpportunity, portrait.collabOpportunity)
})

test('projectCompanyIntelligence drops objects without a known status', () => {
  assert.equal(projectCompanyIntelligence(undefined), undefined)
  assert.equal(projectCompanyIntelligence({ businessModel: '只有一段' }), undefined)
  assert.equal(projectCompanyIntelligence({ status: 'writing', businessModel: 'x' }), undefined)
  const projected = projectCompanyIntelligence(portrait)
  assert.equal(projected?.status, 'ready')
  assert.equal(projected?.icebreak, '原来的破冰')
})

test('saveLeadIcebreak rejects a lead without a portrait and does not create one', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ftcs-icebreak-'))
  const productId = 'prod_ice'
  const leadId = 'lead_plain'
  const rawDir = path.join(root, 'data', 'leads', productId, 'raw')
  fs.mkdirSync(rawDir, { recursive: true })
  const rawPath = path.join(rawDir, 'R1.jsonl')
  const row = {
    id: leadId,
    product_id: productId,
    company: { name: 'Old Co', website: 'https://old.example' },
    source: { url: 'https://old.example' },
    match_reason: '旧线索',
  }
  fs.writeFileSync(rawPath, `${JSON.stringify(row)}\n`, 'utf8')

  const rejected = saveLeadIcebreak(
    { productId, leadId, icebreak: '不要补写' },
    root,
  )
  assert.equal(rejected.ok, false)
  assert.equal(rejected.message, '这条线索还没有目标公司画像')
  const stored = JSON.parse(fs.readFileSync(rawPath, 'utf8').trim()) as Record<string, unknown>
  assert.equal(stored.companyIntelligence, undefined)
  assert.equal((stored.company as { name: string }).name, 'Old Co')

  const missing = saveLeadIcebreak(
    { productId, leadId: 'missing', icebreak: 'x' },
    root,
  )
  assert.equal(missing.ok, false)
  assert.equal(missing.message, '未找到线索')
  fs.rmSync(root, { recursive: true, force: true })
})

test('saveLeadIcebreak updates icebreak on raw and scored without touching the six fields', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ftcs-icebreak-'))
  const productId = 'prod_ice'
  const leadId = 'lead_ready'
  const rawDir = path.join(root, 'data', 'leads', productId, 'raw')
  fs.mkdirSync(rawDir, { recursive: true })
  const rawPath = path.join(rawDir, 'R1.jsonl')
  const raw = {
    id: leadId,
    product_id: productId,
    company: { name: 'Ready Co', website: 'https://ready.example' },
    source: { url: 'https://ready.example' },
    match_reason: '有画像',
    contacts: [{ type: 'email', value: 'a@ready.example' }],
    companyIntelligence: portrait,
  }
  fs.writeFileSync(rawPath, `${JSON.stringify(raw)}\n`, 'utf8')
  const scoredPath = path.join(root, 'data', 'leads', productId, 'scored.json')
  const sibling = {
    id: 'lead_same_domain',
    dedupe_key: 'ready.example',
    status: 'new',
    company: { name: 'Ready Co' },
    companyIntelligence: { ...portrait, icebreak: '另一行' },
  }
  fs.writeFileSync(
    scoredPath,
    `${JSON.stringify({
      product_id: productId,
      updated_at: '2026-10-01T00:00:00.000Z',
      leads: [
        {
          id: leadId,
          dedupe_key: 'ready.example',
          status: 'reviewed',
          score: 80,
          company: { name: 'Ready Co', website: 'https://ready.example' },
          contacts: [{ type: 'email', value: 'a@ready.example' }],
          companyIntelligence: portrait,
        },
        sibling,
      ],
    }, null, 2)}\n`,
    'utf8',
  )

  const empty = saveLeadIcebreak({ productId, leadId, icebreak: '   ' }, root)
  assert.equal(empty.ok, false)
  assert.equal(empty.message, '破冰不能为空')

  const saved = saveLeadIcebreak({ productId, leadId, icebreak: '  手改破冰  ' }, root)
  assert.equal(saved.ok, true)
  assert.equal(saved.lead?.companyIntelligence?.icebreak, '手改破冰')
  assert.equal(saved.lead?.companyIntelligence?.status, 'ready')
  assert.equal(saved.lead?.companyIntelligence?.businessModel, '区域经销')
  assert.equal(saved.lead?.status, 'reviewed')

  const rawStored = JSON.parse(fs.readFileSync(rawPath, 'utf8').trim()) as {
    companyIntelligence: typeof portrait
    company: { name: string }
  }
  assert.equal(rawStored.companyIntelligence.icebreak, '手改破冰')
  assert.equal(rawStored.companyIntelligence.status, 'ready')
  assert.equal(rawStored.companyIntelligence.businessModel, '区域经销')
  assert.equal(rawStored.companyIntelligence.productsBrands, '暂无公开信息')
  assert.equal(rawStored.company.name, 'Ready Co')
  assert.notEqual(rawStored.companyIntelligence.updatedAt, portrait.updatedAt)

  const scored = JSON.parse(fs.readFileSync(scoredPath, 'utf8')) as {
    leads: Array<{ id: string; status: string; companyIntelligence: typeof portrait; score?: number }>
  }
  const primary = scored.leads.find((lead) => lead.id === leadId)!
  const other = scored.leads.find((lead) => lead.id === 'lead_same_domain')!
  assert.equal(primary.companyIntelligence.icebreak, '手改破冰')
  assert.equal(primary.companyIntelligence.collabOpportunity, '可寄样')
  assert.equal(primary.status, 'reviewed')
  assert.equal(primary.score, 80)
  assert.equal(other.companyIntelligence.icebreak, '手改破冰')
  assert.equal(other.companyIntelligence.businessModel, '区域经销')
  assert.equal(primary.companyIntelligence.updatedAt, other.companyIntelligence.updatedAt)

  const failedPortrait = {
    ...portrait,
    status: 'failed' as const,
    errorMessage: '目标公司画像未写入：缺少字段或不是规定的文本',
    icebreak: '失败前的破冰',
  }
  primary.companyIntelligence = failedPortrait
  fs.writeFileSync(scoredPath, `${JSON.stringify(scored, null, 2)}\n`, 'utf8')
  const failedSave = saveLeadIcebreak({ productId, leadId, icebreak: '失败后仍可改' }, root)
  assert.equal(failedSave.ok, true)
  assert.equal(failedSave.lead?.companyIntelligence?.status, 'failed')
  assert.equal(
    failedSave.lead?.companyIntelligence?.errorMessage,
    '目标公司画像未写入：缺少字段或不是规定的文本',
  )
  assert.equal(failedSave.lead?.companyIntelligence?.icebreak, '失败后仍可改')
  assert.equal(failedSave.lead?.companyIntelligence?.supplyChain, '工厂直采')

  fs.rmSync(root, { recursive: true, force: true })
})
