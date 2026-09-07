import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { applyUserPrefsToOpenCodeConfig } from './user-opencode-prefs'
import {
  clearOfficialModelsCache,
  setOfficialModelsCache,
} from '../gateway/official-models-cache'

const baseConfig = {
  $schema: 'https://opencode.ai/config.json',
} as const

describe('applyUserPrefsToOpenCodeConfig vision modalities', () => {
  it('adds image modalities for official models from gateway cache', () => {
    setOfficialModelsCache(
      [
        {
          id: 'deepseek/deepseek-v4-flash-vision-exp',
          rawId: 'deepseek-v4-flash-vision-exp',
          label: 'deepseek-v4-flash-vision-exp · 读图',
          ownedBy: 'deepseek',
          inputTypes: ['txt', 'image'],
          outputTypes: ['txt'],
        },
        {
          id: 'deepseek/deepseek-v4-pro',
          rawId: 'deepseek-v4-pro',
          label: 'deepseek-v4-pro',
          ownedBy: 'deepseek',
          inputTypes: ['txt'],
          outputTypes: ['txt'],
        },
      ],
      'gateway',
    )

    const config = applyUserPrefsToOpenCodeConfig(baseConfig, {
      FTCS_CHANNEL_MODE: 'official',
      FTCS_GATEWAY_API_KEY: 'sk-test',
      FTCS_MODEL: 'deepseek/deepseek-v4-flash-vision-exp',
      FTCS_SMALL_MODEL: 'deepseek/deepseek-v4-pro',
      FTCS_TOKEN_GATEWAY_BASE_URL: 'https://token.example.com/v1',
    })

    const provider = config.provider?.['ftcs-gateway'] as {
      models?: Record<string, { modalities?: { input: string[] } }>
    }
    assert.deepEqual(provider?.models?.['deepseek-v4-flash-vision-exp']?.modalities?.input, [
      'text',
      'image',
    ])
    assert.equal(provider?.models?.['deepseek-v4-pro']?.modalities, undefined)

    clearOfficialModelsCache()
  })

  it('adds image modalities for custom channel when env flag is true', () => {
    const config = applyUserPrefsToOpenCodeConfig(baseConfig, {
      FTCS_CHANNEL_MODE: 'custom',
      FTCS_MODEL: 'custom/my-vlm',
      FTCS_SMALL_MODEL: 'custom/my-vlm',
      FTCS_MODEL_BASE_URL: 'https://api.example.com/v1',
      FTCS_CUSTOM_MODEL_SUPPORTS_IMAGE: 'true',
      FTCS_CUSTOM_API_KEY: 'sk-custom',
    })

    const provider = config.provider?.custom as {
      models?: Record<string, { modalities?: { input: string[] } }>
    }
    assert.deepEqual(provider?.models?.['my-vlm']?.modalities?.input, ['text', 'image'])
  })

  it('omits image modalities for custom channel when env flag is false', () => {
    const config = applyUserPrefsToOpenCodeConfig(baseConfig, {
      FTCS_CHANNEL_MODE: 'custom',
      FTCS_MODEL: 'custom/my-vlm',
      FTCS_MODEL_BASE_URL: 'https://api.example.com/v1',
      FTCS_CUSTOM_MODEL_SUPPORTS_IMAGE: 'false',
      FTCS_CUSTOM_API_KEY: 'sk-custom',
    })

    const provider = config.provider?.custom as {
      models?: Record<string, { modalities?: { input: string[] } }>
    }
    assert.equal(provider?.models?.['my-vlm']?.modalities, undefined)
  })
})
