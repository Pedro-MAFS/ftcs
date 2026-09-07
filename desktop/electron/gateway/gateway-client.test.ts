import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseGatewayModel } from './gateway-client'

describe('gateway-client models', () => {
  it('parses gateway model with input/output types', () => {
    assert.deepEqual(
      parseGatewayModel({
        id: 'glm-5.3',
        owned_by: 'glm',
        input_types: ['txt', 'image'],
        output_types: ['txt'],
      }),
      {
        id: 'glm-5.3',
        ownedBy: 'glm',
        inputTypes: ['txt', 'image'],
        outputTypes: ['txt'],
      },
    )
  })

  it('defaults missing types to txt', () => {
    assert.deepEqual(parseGatewayModel({ id: 'deepseek-v4-pro', owned_by: 'deepseek' }), {
      id: 'deepseek-v4-pro',
      ownedBy: 'deepseek',
      inputTypes: ['txt'],
      outputTypes: ['txt'],
    })
  })
})
