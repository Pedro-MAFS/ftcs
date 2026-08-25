import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  DEFAULT_EXPLORE_R2_SITES,
  formatEnabledR2SitesForPrompt,
  formatR2IncludeDomainsForPrompt,
  listExploreR2Sites,
  parseExploreR2SitesYaml,
  setExploreR2SiteEnabled,
} from './r2-sites'

const SAMPLE_YAML = `sites:
  - id: linkedin_company
    label: LinkedIn 公司页
    include_domains:
      - linkedin.com/company
    default_enabled: true
  - id: facebook_page
    label: Facebook 公共主页
    include_domains:
      - facebook.com
    default_enabled: true
  - id: instagram
    label: Instagram
    include_domains:
      - instagram.com
    default_enabled: false
`

test('parseExploreR2SitesYaml reads id label domains and default_enabled', () => {
  const sites = parseExploreR2SitesYaml(SAMPLE_YAML)
  assert.equal(sites.length, 3)
  assert.deepEqual(sites[0], {
    id: 'linkedin_company',
    label: 'LinkedIn 公司页',
    include_domains: ['linkedin.com/company'],
    default_enabled: true,
  })
  assert.equal(sites[2].default_enabled, false)
})

test('parseExploreR2SitesYaml skips sites without include_domains', () => {
  const sites = parseExploreR2SitesYaml(`sites:
  - id: broken
    label: Broken
    default_enabled: true
  - id: ok
    label: OK
    include_domains:
      - example.com
    default_enabled: false
`)
  assert.equal(sites.length, 1)
  assert.equal(sites[0].id, 'ok')
})

test('listExploreR2Sites uses yaml defaults then prefs overlay', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ftcs-r2-'))
  fs.mkdirSync(path.join(root, 'config'), { recursive: true })
  fs.writeFileSync(path.join(root, 'config', 'explore-r2-sites.yaml'), SAMPLE_YAML, 'utf8')

  const initial = listExploreR2Sites(root)
  assert.equal(initial.find((s) => s.id === 'linkedin_company')?.enabled, true)
  assert.equal(initial.find((s) => s.id === 'instagram')?.enabled, false)

  const after = setExploreR2SiteEnabled(root, 'facebook_page', false)
  assert.equal(after.find((s) => s.id === 'facebook_page')?.enabled, false)
  assert.equal(after.find((s) => s.id === 'linkedin_company')?.enabled, true)

  const prefs = JSON.parse(
    fs.readFileSync(path.join(root, 'data', 'prefs', 'explore-r2.json'), 'utf8'),
  ) as { enabled: Record<string, boolean> }
  assert.equal(prefs.enabled.facebook_page, false)
})

test('setExploreR2SiteEnabled rejects unknown ids', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ftcs-r2-'))
  assert.throws(() => setExploreR2SiteEnabled(root, 'not_a_site', true), /未知/)
})

test('missing yaml falls back to DEFAULT_EXPLORE_R2_SITES', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ftcs-r2-'))
  const sites = listExploreR2Sites(root)
  assert.equal(sites.length, DEFAULT_EXPLORE_R2_SITES.length)
  assert.equal(sites.filter((s) => s.enabled).map((s) => s.id).join(','), 'linkedin_company,facebook_page')
})

test('formatEnabledR2SitesForPrompt lists enabled sites', () => {
  const text = formatEnabledR2SitesForPrompt(listExploreR2Sites(fs.mkdtempSync(path.join(os.tmpdir(), 'ftcs-r2-'))))
  assert.match(text, /linkedin_company/)
  assert.match(text, /facebook_page/)
  assert.doesNotMatch(text, /instagram/)
})

test('formatEnabledR2SitesForPrompt tells model to skip R2 when none enabled', () => {
  const text = formatEnabledR2SitesForPrompt(
    DEFAULT_EXPLORE_R2_SITES.map((site) => ({ ...site, enabled: false })),
  )
  assert.match(text, /不要生成 round=R2/)
})

test('formatR2IncludeDomainsForPrompt lists yaml include_domains originals', () => {
  const text = formatR2IncludeDomainsForPrompt(DEFAULT_EXPLORE_R2_SITES)
  assert.match(text, /linkedin_company/)
  assert.match(text, /linkedin\.com\/company/)
  assert.match(text, /facebook\.com/)
  assert.match(text, /不要写 site:/)
})
