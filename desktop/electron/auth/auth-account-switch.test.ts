import test from 'node:test'
import assert from 'node:assert/strict'
import { shouldPromptGatewayReset } from './auth-identity'

test('shouldPromptGatewayReset when account switched and official provisioned', () => {
  assert.equal(
    shouldPromptGatewayReset({
      previousIdentity: 'sub:user-a',
      currentIdentity: 'sub:user-b',
      officialProvisioned: true,
      channelMode: 'official',
    }),
    true,
  )
})

test('shouldPromptGatewayReset skips same account', () => {
  assert.equal(
    shouldPromptGatewayReset({
      previousIdentity: 'sub:user-a',
      currentIdentity: 'sub:user-a',
      officialProvisioned: true,
      channelMode: 'official',
    }),
    false,
  )
})

test('shouldPromptGatewayReset skips when gateway not provisioned', () => {
  assert.equal(
    shouldPromptGatewayReset({
      previousIdentity: 'sub:user-a',
      currentIdentity: 'sub:user-b',
      officialProvisioned: false,
      channelMode: 'official',
    }),
    false,
  )
})

test('shouldPromptGatewayReset skips custom channel', () => {
  assert.equal(
    shouldPromptGatewayReset({
      previousIdentity: 'sub:user-a',
      currentIdentity: 'sub:user-b',
      officialProvisioned: true,
      channelMode: 'custom',
    }),
    false,
  )
})
