import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildOpenCodeModelConfig,
  isOfficialVisionModel,
  normalizeModelRawId,
  parseEnvBool,
} from './model-vision'

describe('model-vision', () => {
  it('normalizes provider-prefixed model ids', () => {
    assert.equal(normalizeModelRawId('deepseek/deepseek-v4-flash-vision-exp'), 'deepseek-v4-flash-vision-exp')
    assert.equal(normalizeModelRawId('deepseek-v4-pro'), 'deepseek-v4-pro')
  })

  it('matches official vision whitelist by raw id', () => {
    assert.equal(isOfficialVisionModel('deepseek-v4-flash-vision-exp'), true)
    assert.equal(isOfficialVisionModel('deepseek/deepseek-v4-flash-vision-exp'), true)
    assert.equal(isOfficialVisionModel('deepseek/deepseek-v4-pro'), false)
  })

  it('builds modalities only when image input is supported', () => {
    assert.deepEqual(buildOpenCodeModelConfig('m', false), { name: 'm' })
    assert.deepEqual(buildOpenCodeModelConfig('m', true), {
      name: 'm',
      modalities: { input: ['text', 'image'], output: ['text'] },
    })
  })

  it('parses env booleans', () => {
    assert.equal(parseEnvBool('true'), true)
    assert.equal(parseEnvBool('1'), true)
    assert.equal(parseEnvBool('false'), false)
    assert.equal(parseEnvBool(undefined), false)
  })
})
