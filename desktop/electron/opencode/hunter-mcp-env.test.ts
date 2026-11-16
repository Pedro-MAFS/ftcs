import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildHunterMcpEnvironment,
  mergeHunterMcpEnvironment,
} from './hunter-mcp-env.ts'

describe('hunter mcp env', () => {
  it('官方注入网关凭证与通道，不注入用户 Hunter Key', () => {
    const built = buildHunterMcpEnvironment({
      workspaceRoot: '/work',
      channelMode: 'official',
      gatewayBaseUrl: 'https://gw.example/v1/',
      gatewayApiKey: 'sk-official',
      hunterApiKeys: 'hunter-a,hunter-b',
      hunterApiKey: 'hunter-legacy',
    })
    assert.equal(built.FTCS_CHANNEL_MODE, 'official')
    assert.equal(built.FTCS_GATEWAY_API_KEY, 'sk-official')
    assert.equal(built.FTCS_TOKEN_GATEWAY_BASE_URL, 'https://gw.example/v1')
    assert.equal(built.FTCS_WORKSPACE, '/work')
    assert.equal('HUNTER_API_KEYS' in built, false)
    assert.equal('HUNTER_API_KEY' in built, false)
    assert.equal(JSON.stringify(built).includes('hunter-a'), false)
    assert.equal(JSON.stringify(built).includes('hunter-legacy'), false)
  })

  it('未写通道时按官方注入，且不带用户 Key', () => {
    const built = buildHunterMcpEnvironment({
      workspaceRoot: '/work',
      channelMode: undefined,
      gatewayBaseUrl: 'https://token.ai-utills.com/v1',
      hunterApiKeys: 'still-on-disk',
    })
    assert.equal(built.FTCS_CHANNEL_MODE, 'official')
    assert.equal('HUNTER_API_KEYS' in built, false)
    assert.equal('FTCS_GATEWAY_API_KEY' in built, false)
  })

  it('自定义只放工作区与用户 Key，不放网关 sk', () => {
    const built = buildHunterMcpEnvironment({
      workspaceRoot: '/work',
      channelMode: 'custom',
      gatewayBaseUrl: 'https://gw.example/v1',
      gatewayApiKey: 'sk-official',
      hunterApiKeys: 'k1,k2',
      hunterApiKey: 'legacy',
    })
    assert.deepEqual(built, {
      FTCS_WORKSPACE: '/work',
      HUNTER_API_KEYS: 'k1,k2',
      HUNTER_API_KEY: 'legacy',
    })
    assert.equal(JSON.stringify(built).includes('sk-official'), false)
  })

  it('合并时官方删掉模板里残留的 Key，自定义删掉网关变量', () => {
    const official = mergeHunterMcpEnvironment(
      {
        FTCS_WORKSPACE: '.',
        HUNTER_API_KEYS: 'from-template',
        HUNTER_API_KEY: 'from-template-single',
      },
      {
        FTCS_WORKSPACE: '/work',
        FTCS_CHANNEL_MODE: 'official',
        FTCS_GATEWAY_API_KEY: 'sk-official',
        FTCS_TOKEN_GATEWAY_BASE_URL: 'https://gw.example/v1',
      },
      true,
    )
    assert.equal(official.HUNTER_API_KEYS, undefined)
    assert.equal(official.HUNTER_API_KEY, undefined)
    assert.equal(official.FTCS_GATEWAY_API_KEY, 'sk-official')
    assert.equal(JSON.stringify(official).includes('from-template'), false)

    const custom = mergeHunterMcpEnvironment(
      {
        FTCS_WORKSPACE: '.',
        FTCS_CHANNEL_MODE: 'official',
        FTCS_GATEWAY_API_KEY: 'sk-leaked',
        FTCS_TOKEN_GATEWAY_BASE_URL: 'https://gw.example/v1',
      },
      {
        FTCS_WORKSPACE: '/work',
        HUNTER_API_KEYS: 'k1',
      },
      false,
    )
    assert.equal(custom.HUNTER_API_KEYS, 'k1')
    assert.equal(custom.FTCS_GATEWAY_API_KEY, undefined)
    assert.equal(custom.FTCS_TOKEN_GATEWAY_BASE_URL, undefined)
    assert.equal(custom.FTCS_CHANNEL_MODE, undefined)
    assert.equal(JSON.stringify(custom).includes('sk-leaked'), false)
  })
})
