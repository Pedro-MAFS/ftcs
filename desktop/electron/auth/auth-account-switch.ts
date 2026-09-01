import { getSettingsSnapshot } from '../settings/settings-service'
import {
  buildLoginIdentity,
  loadLastLoginIdentity,
  saveLastLoginIdentity,
} from './auth-meta'
import { shouldPromptGatewayReset } from './auth-identity'

/** 登录成功后调用：更新上次身份，并在换号且已开通官方通道时提示重置 sk */
export function evaluateLoginAccountSwitch(input: {
  sub?: string
  email?: string
}): { promptGatewayReset: boolean } {
  const currentIdentity = buildLoginIdentity(input)
  const previousIdentity = loadLastLoginIdentity()
  const settings = getSettingsSnapshot()
  const promptGatewayReset = shouldPromptGatewayReset({
    previousIdentity,
    currentIdentity,
    officialProvisioned: settings.officialProvisioned,
    channelMode: settings.channelMode,
  })
  if (currentIdentity) {
    saveLastLoginIdentity(currentIdentity)
  }
  return { promptGatewayReset }
}
