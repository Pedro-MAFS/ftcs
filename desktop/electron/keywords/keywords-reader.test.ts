import test from 'node:test'
import assert from 'node:assert/strict'
import { validateSearchQueryForSave } from './keyword-query-rules'

const known = new Set(['linkedin_company', 'facebook_page'])

test('validateSearchQueryForSave requires site_id on R2', () => {
  assert.equal(
    validateSearchQueryForSave({
      query: 'WPC decking distributor Germany',
      round: 'R2',
    }),
    'R2 搜索词必须选择站点',
  )
})

test('validateSearchQueryForSave rejects operators in R2 query', () => {
  assert.match(
    validateSearchQueryForSave({
      query: 'site:linkedin.com WPC decking',
      round: 'R2',
      site_id: 'linkedin_company',
    }) ?? '',
    /site:/,
  )
})

test('validateSearchQueryForSave rejects unknown R2 site_id', () => {
  assert.match(
    validateSearchQueryForSave(
      {
        query: 'WPC decking distributor Germany',
        round: 'R2',
        site_id: 'not_a_site',
      },
      known,
    ) ?? '',
    /未知/,
  )
})

test('validateSearchQueryForSave rejects site_id on R1', () => {
  assert.equal(
    validateSearchQueryForSave({
      query: 'industrial valve distributor Europe',
      round: 'R1',
      site_id: 'linkedin_company',
    }),
    '只有 R2 搜索词可以带站点',
  )
})

test('validateSearchQueryForSave accepts R2 with known site', () => {
  assert.equal(
    validateSearchQueryForSave(
      {
        query: 'WPC decking distributor Germany',
        round: 'R2',
        site_id: 'linkedin_company',
      },
      known,
    ),
    null,
  )
})

test('validateSearchQueryForSave accepts R3 without site_id', () => {
  assert.equal(
    validateSearchQueryForSave({
      query: 'Bodenbelag Fachhandel München',
      round: 'R3',
    }),
    null,
  )
})

test('validateSearchQueryForSave rejects operators in R3 query', () => {
  assert.match(
    validateSearchQueryForSave({
      query: 'site:maps.google.com flooring Munich',
      round: 'R3',
    }) ?? '',
    /site:/,
  )
})

test('validateSearchQueryForSave rejects site_id on R3', () => {
  assert.equal(
    validateSearchQueryForSave({
      query: 'flooring store Dallas Texas',
      round: 'R3',
      site_id: 'linkedin_company',
    }),
    '只有 R2 搜索词可以带站点',
  )
})
