import test from 'node:test'
import assert from 'node:assert/strict'
import { CloudflarePages, verifyPagesProject } from './cloudflare-pages.ts'

const previous = globalThis.fetch
const project = { name: 'my-site', subdomain: 'my-site.pages.dev', production_branch: 'main', source: { type: 'github', config: { owner: 'owner', repo_name: 'site', repo_id: '1', production_deployments_enabled: true } }, build_config: { build_command: 'npm run build', destination_dir: 'dist' }, canonical_deployment: { id: 'current' } }
const api = () => new CloudflarePages(async () => ({ accessToken: 'secret', accountId: 'a'.repeat(32) }))
const account = 'a'.repeat(32)
const sha = 'f'.repeat(40)
const deployment = (id: string, commit: string, env = 'production') => ({ id, environment: env, url: 'https://example.pages.dev', latest_stage: { name: 'deploy', status: 'success' }, deployment_trigger: { metadata: { commit_hash: commit, branch: 'main' } } })

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
  let deployments = [deployment('old', 'a'.repeat(40)), deployment('preview', sha, 'preview')]
  globalThis.fetch = async input => Response.json({ success: true, result: String(input).includes('/deployments?') ? deployments : project })
  assert.equal((await api().status(account, 'my-site', 'main', sha)).state, 'waiting')
  deployments = [deployment('current', sha)]
  const result = await api().status(account, 'my-site', 'main', sha)
  assert.equal(result.state, 'success'); assert.equal(result.productionCurrent, true); assert.equal(result.productionUrl, 'https://my-site.pages.dev')
  deployments = [deployment('old', sha)]
  assert.equal((await api().status(account, 'my-site', 'main', sha)).productionCurrent, false)
  deployments = [{ ...deployment('current', sha), latest_stage: { name: 'build', status: 'success' } }]
  assert.equal((await api().status(account, 'my-site', 'main', sha)).state, 'building')
})

test('does not query a different Cloudflare account', async () => {
  let called = false
  globalThis.fetch = async () => { called = true; return Response.json({}) }
  await assert.rejects(api().list('b'.repeat(32)), /账号已变化/)
  assert.equal(called, false)
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
test.after(() => { globalThis.fetch = previous })
