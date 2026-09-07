import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildOpenCodeModelConfig,
  buildOpenCodeModelConfigFromGateway,
  gatewayModelSupportsImage,
  mapGatewayTypesToModalities,
  normalizeModelRawId,
  parseEnvBool,
} from './model-vision'

describe('model-vision', () => {
  it('normalizes provider-prefixed model ids', () => {
    assert.equal(normalizeModelRawId('deepseek/deepseek-v4-flash-vision-exp'), 'deepseek-v4-flash-vision-exp')
    assert.equal(normalizeModelRawId('glm/glm-5.3'), 'glm-5.3')
  })

  it('maps gateway txt/image types to OpenCode modalities', () => {
    assert.deepEqual(mapGatewayTypesToModalities(['txt'], ['txt']), {
      input: ['text'],
      output: ['text'],
    })
    assert.deepEqual(mapGatewayTypesToModalities(['txt', 'image'], ['txt']), {
      input: ['text', 'image'],
      output: ['text'],
    })
  })

  it('detects image support from gateway input_types', () => {
    assert.equal(gatewayModelSupportsImage(['txt', 'image']), true)
    assert.equal(gatewayModelSupportsImage(['txt']), false)
  })

  it('builds custom modalities only when image input is supported', () => {
    assert.deepEqual(buildOpenCodeModelConfig('m', false), { name: 'm' })
    assert.deepEqual(buildOpenCodeModelConfig('m', true), {
      name: 'm',
      modalities: { input: ['text', 'image'], output: ['text'] },
    })
  })

  it('builds official modalities from gateway types', () => {
    assert.deepEqual(buildOpenCodeModelConfigFromGateway('glm-5.3', ['txt'], ['txt']), {
      name: 'glm-5.3',
    })
    assert.deepEqual(
      buildOpenCodeModelConfigFromGateway('glm-5.3', ['txt', 'image'], ['txt']),
      {
        name: 'glm-5.3',
        modalities: { input: ['text', 'image'], output: ['text'] },
      },
    )
  })

  it('parses env booleans', () => {
    assert.equal(parseEnvBool('true'), true)
    assert.equal(parseEnvBool('1'), true)
    assert.equal(parseEnvBool('false'), false)
    assert.equal(parseEnvBool(undefined), false)
  })
})
