import test from 'node:test'
import assert from 'node:assert/strict'
import { GithubRepositories } from './github-repositories.ts'

const originalFetch = globalThis.fetch
const service = () => new GithubRepositories(async () => 'secret-token')
const repo = (id: number, push = true) => ({ id, name: `site-${id}`, full_name: `owner/site-${id}`, owner: { login: 'owner' }, private: true, default_branch: 'main', permissions: { push } })

test('lists every installation and repository page with effective write access', async () => {
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input))
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer secret-token')
    if (url.pathname === '/user/installations') return Response.json({ installations: [{ id: 1, permissions: { contents: 'write' } }, { id: 2, permissions: { contents: 'read' } }, { id: 3 }] })
    if (url.pathname === '/user/installations/1/repositories') return Response.json({ repositories: url.searchParams.get('page') === '1' ? Array.from({ length: 100 }, (_, i) => repo(i + 1)) : [repo(101, false)] })
    if (url.pathname === '/user/installations/2/repositories') return Response.json({ repositories: [repo(102)] })
    if (url.pathname === '/user/installations/3/repositories') return Response.json({ repositories: [repo(103)] })
    throw new Error('unexpected request')
  }
  const result = await service().list()
  assert.equal(result.length, 103)
  assert.equal(result.find(item => item.id === 1)?.writeAccess, 'yes')
  assert.equal(result.find(item => item.id === 101)?.writeAccess, 'no')
  assert.equal(result.find(item => item.id === 102)?.writeAccess, 'no')
  assert.equal(result.find(item => item.id === 103)?.writeAccess, 'unknown')
  assert.equal(JSON.stringify(result).includes('secret-token'), false)
})

test('does not return partial lists when a later page fails', async () => {
  globalThis.fetch = async (input) => {
    const url = new URL(String(input))
    if (url.pathname === '/user/installations') return Response.json({ installations: [{ id: 1, permissions: { contents: 'write' } }] })
    return url.searchParams.get('page') === '1' ? Response.json({ repositories: Array.from({ length: 100 }, (_, i) => repo(i + 1)) }) : new Response('', { status: 403 })
  }
  await assert.rejects(service().list(), /拒绝/)
})

test('branches are restricted to currently authorized repositories and show protection', async () => {
  const calls: string[] = []
  globalThis.fetch = async (input) => {
    const url = new URL(String(input)); calls.push(url.pathname)
    if (url.pathname === '/user/installations') return Response.json({ installations: [{ id: 1, permissions: { contents: 'write' } }] })
    if (url.pathname === '/user/installations/1/repositories') return Response.json({ repositories: [repo(1)] })
    if (url.pathname === '/repos/owner/site-1/branches') return Response.json([{ name: 'main', protected: true }])
    throw new Error('unexpected request')
  }
  assert.deepEqual(await service().branches(1), [{ name: 'main', protected: true }])
  await assert.rejects(service().branches(2), /仓库不可用/)
  assert.equal(calls.filter(path => path.includes('/branches')).length, 1)
})

test('creates a private initialized repository only for a valid name', async () => {
  let requests = 0
  globalThis.fetch = async (input, init) => {
    requests++
    assert.equal(String(input), 'https://api.github.com/user/repos')
    assert.equal(init?.method, 'POST')
    assert.deepEqual(JSON.parse(String(init?.body)), { name: 'my-site', private: true, auto_init: true })
    return Response.json(repo(1))
  }
  await assert.rejects(service().create('../bad', true), /仓库名称/)
  assert.equal(requests, 0)
  assert.deepEqual(await service().create('my-site', true), { fullName: 'owner/site-1' })
})

test('empty repository and unknown errors provide actionable feedback', async () => {
  globalThis.fetch = async (input) => {
    const pathname = new URL(String(input)).pathname
    if (pathname === '/user/installations') return Response.json({ installations: [{ id: 1 }] })
    if (pathname === '/user/installations/1/repositories') return Response.json({ repositories: [repo(1)] })
    return new Response('', { status: 409 })
  }
  await assert.rejects(service().branches(1), /初始化/)
})

test('commit uses the confirmed branch head as an atomic condition', async () => {
  const head = '1'.repeat(40), committed = '2'.repeat(40)
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), 'https://api.github.com/graphql')
    const body = JSON.parse(String(init?.body))
    assert.equal(body.variables.input.expectedHeadOid, head)
    assert.equal(body.variables.input.branch.repositoryNameWithOwner, 'owner/site-1')
    assert.equal(body.variables.input.branch.branchName, 'main')
    assert.deepEqual(body.variables.input.fileChanges.additions, [{ path: 'image.png', contents: 'AP8=' }])
    return Response.json({ data: { createCommitOnBranch: { commit: { oid: committed } } } })
  }
  const repository = { id: 1, owner: 'owner', name: 'site-1', fullName: 'owner/site-1', private: true, defaultBranch: 'main', writeAccess: 'yes' as const }
  assert.equal(await service().commit(repository, 'main', head, [{ path: 'image.png', contents: 'AP8=' }], []), committed)
  globalThis.fetch = async () => Response.json({ errors: [{ message: 'expectedHeadOid did not match' }] })
  await assert.rejects(service().commit(repository, 'main', head, [], []), /未确认提交/)
})

test.after(() => { globalThis.fetch = originalFetch })
