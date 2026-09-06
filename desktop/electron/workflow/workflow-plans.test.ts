import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { BUILTIN_WORKFLOW_PLANS } from './builtin-plans'
import { WORKFLOW_NODE_CATALOG, isWorkflowNodeId } from './workflow-nodes'
import {
  deleteUserWorkflowPlan,
  listWorkflowPlans,
  loadUserWorkflowPlans,
  saveUserWorkflowPlan,
} from './workflow-plans'

function tempRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ftcs-wf-'))
}

function plansFile(root: string): string {
  return path.join(root, 'data', 'prefs', 'workflow-plans.json')
}

test('T1 listWorkflowPlans on empty workspace returns builtin-standard only', () => {
  const root = tempRoot()
  const plans = listWorkflowPlans(root)
  assert.equal(plans.length, 1)
  assert.equal(plans[0].id, 'builtin-standard')
  assert.equal(plans[0].name, '标准获客')
  assert.equal(plans[0].builtin, true)
  assert.deepEqual(
    plans[0].steps.map((step) => step.nodeId),
    ['discover-r1', 'discover-r2', 'score-and-dedupe', 'draft-outreach-email'],
  )
})

test('T2 save creates user plan with timestamps and persists file', () => {
  const root = tempRoot()
  const saved = saveUserWorkflowPlan(root, {
    name: '只跑 R1',
    steps: [{ nodeId: 'discover-r1' }],
  })

  assert.match(saved.id, /^user_[0-9a-f]{8}$/)
  assert.equal(saved.name, '只跑 R1')
  assert.ok(saved.createdAt)
  assert.ok(saved.updatedAt)
  assert.equal(saved.builtin, undefined)

  assert.ok(fs.existsSync(plansFile(root)))
  const onDisk = JSON.parse(fs.readFileSync(plansFile(root), 'utf8')) as {
    version: number
    plans: Array<{ id: string }>
  }
  assert.equal(onDisk.version, 1)
  assert.equal(onDisk.plans.length, 1)
  assert.equal(onDisk.plans[0].id, saved.id)
})

test('T3 save updates existing user plan and preserves createdAt', () => {
  const root = tempRoot()
  const created = saveUserWorkflowPlan(root, {
    name: '方案 A',
    steps: [{ nodeId: 'discover-r1' }],
  })
  const createdAt = created.createdAt

  const updated = saveUserWorkflowPlan(root, {
    id: created.id,
    name: '方案 B',
    steps: [{ nodeId: 'discover-r2' }, { nodeId: 'score-and-dedupe' }],
  })

  assert.equal(updated.id, created.id)
  assert.equal(updated.name, '方案 B')
  assert.equal(updated.steps.length, 2)
  assert.equal(updated.createdAt, createdAt)
  assert.ok(updated.updatedAt)
})

test('T4 save rejects duplicate user plan names case-insensitively', () => {
  const root = tempRoot()
  saveUserWorkflowPlan(root, {
    name: 'My Plan',
    steps: [{ nodeId: 'discover-r1' }],
  })

  assert.throws(
    () =>
      saveUserWorkflowPlan(root, {
        name: 'my plan',
        steps: [{ nodeId: 'discover-r2' }],
      }),
    /已存在同名方案/,
  )
})

test('T5 save rejects invalid nodeId', () => {
  const root = tempRoot()
  assert.throws(
    () =>
      saveUserWorkflowPlan(root, {
        name: '坏方案',
        steps: [{ nodeId: 'extract-product-profile' as 'discover-r1' }],
      }),
    /未知步骤：extract-product-profile/,
  )
})

test('save accepts expand-keywords node', () => {
  const root = tempRoot()
  const saved = saveUserWorkflowPlan(root, {
    name: '扩展后 R1',
    steps: [{ nodeId: 'expand-keywords' }, { nodeId: 'discover-r1' }],
  })
  assert.equal(saved.steps.length, 2)
  assert.equal(saved.steps[0].nodeId, 'expand-keywords')
})

test('T6 save rejects builtin-standard id', () => {
  const root = tempRoot()
  assert.throws(
    () =>
      saveUserWorkflowPlan(root, {
        id: 'builtin-standard',
        name: '伪造内置',
        steps: [{ nodeId: 'discover-r1' }],
      }),
    /内置方案不可修改/,
  )
})

test('T7 delete removes user plan from disk and list', () => {
  const root = tempRoot()
  const saved = saveUserWorkflowPlan(root, {
    name: '待删',
    steps: [{ nodeId: 'discover-r1' }],
  })

  deleteUserWorkflowPlan(root, saved.id)
  assert.equal(listWorkflowPlans(root).length, 1)
  assert.equal(loadUserWorkflowPlans(root).length, 0)
})

test('T8 delete rejects builtin-standard', () => {
  const root = tempRoot()
  assert.throws(() => deleteUserWorkflowPlan(root, 'builtin-standard'), /内置方案不可删除/)
  assert.equal(listWorkflowPlans(root).length, 1)
})

test('T9 loadUserWorkflowPlans drops forged builtin records from file', () => {
  const root = tempRoot()
  fs.mkdirSync(path.dirname(plansFile(root)), { recursive: true })
  fs.writeFileSync(
    plansFile(root),
    `${JSON.stringify({
      version: 1,
      plans: [
        {
          id: 'builtin-evil',
          name: '伪造内置',
          builtin: true,
          steps: [{ nodeId: 'discover-r1' }],
        },
        {
          id: 'user_deadbeef',
          name: '合法用户方案',
          steps: [{ nodeId: 'discover-r1' }],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    })}\n`,
    'utf8',
  )

  const plans = listWorkflowPlans(root)
  assert.equal(plans.length, 2)
  assert.equal(plans[0].id, 'builtin-standard')
  assert.equal(plans[1].id, 'user_deadbeef')
})

test('T10 corrupt json keeps builtin plans available', () => {
  const root = tempRoot()
  fs.mkdirSync(path.dirname(plansFile(root)), { recursive: true })
  fs.writeFileSync(plansFile(root), '{not json', 'utf8')

  const plans = listWorkflowPlans(root)
  assert.equal(plans.length, 1)
  assert.equal(plans[0].id, 'builtin-standard')
})

test('user plans are sorted by zh-CN name after builtin plans', () => {
  const root = tempRoot()
  saveUserWorkflowPlan(root, { name: '乙方案', steps: [{ nodeId: 'discover-r1' }] })
  saveUserWorkflowPlan(root, { name: '甲方案', steps: [{ nodeId: 'discover-r2' }] })

  const names = listWorkflowPlans(root).map((plan) => plan.name)
  assert.deepEqual(names, ['标准获客', '甲方案', '乙方案'])
})

test('WORKFLOW_NODE_CATALOG covers all WorkflowNodeId values', () => {
  assert.equal(WORKFLOW_NODE_CATALOG.length, 6)
  assert.equal(WORKFLOW_NODE_CATALOG[0].id, 'expand-keywords')
  for (const node of WORKFLOW_NODE_CATALOG) {
    assert.equal(isWorkflowNodeId(node.id), true)
  }
})

test('builtin-standard steps reference valid workflow nodes', () => {
  const builtin = BUILTIN_WORKFLOW_PLANS[0]
  for (const step of builtin.steps) {
    assert.equal(isWorkflowNodeId(step.nodeId), true)
  }
})
