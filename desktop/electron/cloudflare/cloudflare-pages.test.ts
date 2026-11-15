import test from 'node:test'
import assert from 'node:assert/strict'
import { CloudflarePages, normalizeDomain, verifyPagesProject } from './cloudflare-pages.ts'

const previous = globalThis.fetch
const project = { name: 'my-site', subdomain: 'my-site.pages.dev', production_branch: 'main', source: { type: 'github', config: { owner: 'owner', repo_name: 'site', repo_id: '1', production_deployments_enabled: true } }, build_config: { build_command: 'npm run build', destination_dir: 'dist' }, canonical_deployment: { id: 'current' } }
const api = () => new CloudflarePages(async () => ({ accessToken: 'secret', accountId: 'a'.repeat(32) }))
const account = 'a'.repeat(32)
const sha = 'f'.repeat(40)
const deployment = (id: string, commit: string, env = 'production') => ({ id, environment: env, url: 'https://example.pages.dev', latest_stage: { name: 'deploy', status: 'success' }, deployment_trigger: { metadata: { commit_hash: commit, branch: 'main' } } })

test('validates and normalizes custom domain names', () => {
  assert.equal(normalizeDomain(' WWW.Example.com '), 'www.example.com')
  assert.equal(normalizeDomain('例子.com'), 'xn--fsqu00a.com')
  for (const bad of ['http://example.com', 'example.com:443', '*.example.com', '127.0.0.1', 'localhost', 'a..com', '-bad.com', 'example.com/path']) assert.throws(() => normalizeDomain(bad))
})

test('lists, adds and checks Pages domains with validation data', async () => {
  const calls: Array<{ url: string; method: string; body: unknown }> = []
  const raw = { name: 'www.example.com', status: 'pending', validation_data: { method: 'txt', status: 'pending', txt_name: '_acme.example.com', txt_value: 'challenge' }, verification_data: { status: 'pending' } }
  globalThis.fetch = async (input, init) => {
    const url = String(input), method = init?.method || 'GET'
    calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    return Response.json({ success: true, result: url.includes('?') ? [raw] : raw, result_info: { total_pages: 1 } })
  }
  try {
    const client = api()
    const list = await client.domains(account, 'my-site')
    assert.equal(list[0]?.validation?.txtValue, 'challenge')
    assert.equal((await client.addDomain(account, 'my-site', 'WWW.Example.com')).name, 'www.example.com')
    assert.equal((await client.domain(account, 'my-site', 'www.example.com')).status, 'pending')
    assert.deepEqual(calls[1]?.body, { name: 'www.example.com' })
    assert.match(calls[2]!.url, /\/domains\/www\.example\.com$/)
  } finally { globalThis.fetch = previous }
})

test('reads all domain pages and rejects an unauthorized account', async () => {
  const urls: string[] = []
  globalThis.fetch = async input => {
    const url = new URL(String(input)); urls.push(url.href)
    const page = Number(url.searchParams.get('page') || '1')
    return Response.json({ success: true, result: [{ name: page === 1 ? 'www.example.com' : 'shop.example.com', status: 'active' }], result_info: { total_pages: 2 } })
  }
  try {
    assert.deepEqual((await api().domains(account, 'my-site')).map(item => item.name), ['www.example.com', 'shop.example.com'])
    assert.equal(urls.length, 2)
    await assert.rejects(api().domains('b'.repeat(32), 'my-site'), /账号已变化/)
  } finally { globalThis.fetch = previous }
})

test('deletes only the specified Pages domain and accepts a null result', async () => {
  let method = '', url = ''
  globalThis.fetch = async (input, init) => { url = String(input); method = init?.method || ''; return Response.json({ success: true, result: null }) }
  try {
    await api().deleteDomain(account, 'my-site', 'WWW.Example.com')
    assert.equal(method, 'DELETE')
    assert.match(url, /\/projects\/my-site\/domains\/www\.example\.com$/)
    await assert.rejects(api().deleteDomain(account, 'my-site', 'http://example.com'), /域名/)
  } finally { globalThis.fetch = previous }
})

test('requires matching GitHub repository, branch and build settings', async () => {
  globalThis.fetch = async () => Response.json({ success: true, result: project })
  const current = (await api().project(account, 'my-site')).project
  const target = { id: 1, owner: 'owner', name: 'site', branch: 'main', output: 'dist' }
  assert.doesNotThrow(() => verifyPagesProject(current, target))
  assert.throws(() => verifyPagesProject(current, { ...target, id: 2 }), /仓库不匹配/)
  assert.throws(() => verifyPagesProject(current, { ...target, branch: 'other' }), /生产分支/)
  assert.throws(() => verifyPagesProject(current, { ...target, output: 'other' }), /构建命令/)
  assert.throws(() => verifyPagesProject({ ...current, autoDeploy: false }, target), /自动部署已关闭/)
})

test('only a production deployment of the exact SHA can succeed', async () => {
  let deployments: Array<ReturnType<typeof deployment> & { is_skipped?: boolean }> = [deployment('old', 'a'.repeat(40)), deployment('preview', sha, 'preview')]
  globalThis.fetch = async input => Response.json({ success: true, result: String(input).includes('/deployments?') ? deployments : project, result_info: { total_pages: 1 } })
  assert.equal((await api().status(account, 'my-site', 'main', sha)).state, 'waiting')
  deployments = [deployment('current', sha)]
  const result = await api().status(account, 'my-site', 'main', sha)
  assert.equal(result.state, 'success'); assert.equal(result.productionCurrent, true); assert.equal(result.productionUrl, 'https://my-site.pages.dev')
  deployments = [deployment('old', sha)]
  assert.equal((await api().status(account, 'my-site', 'main', sha)).productionCurrent, false)
  deployments = [{ ...deployment('current', sha), latest_stage: { name: 'build', status: 'success' } }]
  assert.equal((await api().status(account, 'my-site', 'main', sha)).state, 'building')
  deployments = [{ ...deployment('current', sha), is_skipped: true }]
  assert.equal((await api().status(account, 'my-site', 'main', sha)).state, 'skipped')
})

test('does not query a different Cloudflare account', async () => {
  let called = false
  globalThis.fetch = async () => { called = true; return Response.json({}) }
  await assert.rejects(api().list('b'.repeat(32)), /账号已变化/)
  assert.equal(called, false)
})
test('uses the verified connection-check query for the first project page and reads later pages', async () => {
  const seen: number[] = []
  globalThis.fetch = async input => {
    const url = new URL(String(input))
    assert.equal(url.searchParams.get('per_page'), '1')
    assert.notEqual(url.searchParams.get('page'), '1')
    const page = Number(url.searchParams.get('page') || 1); seen.push(page)
    return Response.json({ success: true, result: page === 1 ? [{ ...project, name: 'site-first' }] : [{ ...project, name: 'site-last' }], result_info: { total_pages: 2, per_page: 1 } })
  }
  const projects = await api().list(account)
  assert.equal(projects.length, 2)
  assert.equal(projects.at(-1)?.name, 'site-last')
  assert.deepEqual(seen, [1, 2])
})
test('finds a matching deployment on a later page using the reported page size', async () => {
  const seen: number[] = []
  globalThis.fetch = async input => {
    const url = new URL(String(input))
    if (!url.pathname.endsWith('/deployments')) return Response.json({ success: true, result: project })
    assert.equal(url.searchParams.get('per_page'), '1')
    assert.notEqual(url.searchParams.get('page'), '1')
    const page = Number(url.searchParams.get('page') || 1); seen.push(page)
    return Response.json({ success: true, result: page === 1 ? [deployment('old', 'a'.repeat(40))] : [deployment('current', sha)], result_info: { per_page: 1 } })
  }
  const result = await api().status(account, 'my-site', 'main', sha)
  assert.equal(result.state, 'success')
  assert.deepEqual(seen, [1, 2])
})
test('creates a GitHub-backed project with the confirmed target and build settings', async () => {
  let calls = 0
  globalThis.fetch = async (_input, init) => {
    calls++
    assert.equal(init?.method, 'POST')
    const body = JSON.parse(String(init?.body))
    assert.equal(body.name, 'my-site')
    assert.equal(body.source.type, 'github')
    assert.deepEqual(body.source.config, { owner: 'owner', repo_name: 'site', repo_id: '1', production_branch: 'main', production_deployments_enabled: true })
    assert.equal(body.build_config.build_command, 'npm run build')
    assert.equal(body.build_config.destination_dir, 'dist')
    assert.equal(body.deployment_configs.production.env_vars.NODE_VERSION.value, '24')
    return Response.json({ success: true, result: project })
  }
  await assert.rejects(api().create(account, '../bad', { id: 1, owner: 'owner', name: 'site', branch: 'main' }, 'dist', '24'), /项目名/)
  assert.equal(calls, 0)
  assert.equal((await api().create(account, 'my-site', { id: 1, owner: 'owner', name: 'site', branch: 'main' }, 'dist', '24')).name, 'my-site')
})
test('starts a Git build from branch HEAD without claiming to pin a commit', async () => {
  globalThis.fetch = async (input, init) => {
    assert.match(String(input), /\/projects\/my-site\/deployments$/)
    assert.equal(init?.method, 'POST')
    assert.ok(init?.body instanceof FormData)
    assert.equal((init.body as FormData).get('branch'), 'main')
    assert.equal((init.body as FormData).get('commit_hash'), null)
    assert.equal(new Headers(init?.headers).has('Content-Type'), false)
    return Response.json({ success: true, result: deployment('created', sha) })
  }
  assert.deepEqual(await api().createDeployment(account, 'my-site', 'main'), { id: 'created', branch: 'main', commitSha: sha })
})
test('surfaces Cloudflare error codes and messages while hiding credentials', async () => {
  globalThis.fetch = async () => Response.json({ success: false, errors: [{ code: 8000007, message: 'GitHub access denied for secret; Bearer other-token' }] }, { status: 400 })
  await assert.rejects(api().create(account, 'my-site', { id: 1, owner: 'owner', name: 'site', branch: 'main' }, 'dist', '24'), error => {
    assert.ok(error instanceof Error)
    assert.match(error.message, /HTTP 400.*代码 8000007.*GitHub access denied/)
    assert.doesNotMatch(error.message, /secret|other-token/)
    return true
  })
})
test('handles non-JSON errors and success=false responses', async () => {
  globalThis.fetch = async () => new Response('Bad Request', { status: 400 })
  await assert.rejects(api().list(account), /HTTP 400/)
  globalThis.fetch = async () => Response.json({ success: false, errors: [{ code: 1234, message: 'request rejected' }] })
  await assert.rejects(api().list(account), /HTTP 200.*代码 1234.*request rejected/)
})
test('identifies whether list or creation returned the Cloudflare error', async () => {
  globalThis.fetch = async () => Response.json({ success: false, errors: [{ code: 8000024, message: 'Invalid list options' }] }, { status: 400 })
  await assert.rejects(api().list(account), /查询 Cloudflare 项目列表失败.*8000024/)
  await assert.rejects(api().create(account, 'my-site', { id: 1, owner: 'owner', name: 'site', branch: 'main' }, 'dist', '24'), /创建 Cloudflare Pages 项目失败.*8000024/)
})
test.after(() => { globalThis.fetch = previous })
