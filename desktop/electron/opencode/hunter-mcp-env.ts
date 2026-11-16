/**
 * hunter-api 子进程环境（US-HC-01 / US-HC-05）。
 * 官方只注入网关凭证与通道标记，不注入用户 Hunter Key。
 * 自定义保持直连所需的 Key，不注入网关 sk。
 */

export function isOfficialChannelMode(channelMode: string | undefined): boolean {
  return (channelMode || 'official').trim() === 'official'
}

export function buildHunterMcpEnvironment(input: {
  workspaceRoot: string
  channelMode: string | undefined
  gatewayBaseUrl: string
  gatewayApiKey?: string
  hunterApiKeys?: string
  hunterApiKey?: string
}): Record<string, string> {
  if (isOfficialChannelMode(input.channelMode)) {
    const env: Record<string, string> = {
      FTCS_WORKSPACE: input.workspaceRoot,
      FTCS_CHANNEL_MODE: 'official',
      FTCS_TOKEN_GATEWAY_BASE_URL: input.gatewayBaseUrl.replace(/\/+$/, ''),
    }
    const gatewayKey = input.gatewayApiKey?.trim()
    if (gatewayKey) env.FTCS_GATEWAY_API_KEY = gatewayKey
    return env
  }

  const env: Record<string, string> = {
    FTCS_WORKSPACE: input.workspaceRoot,
  }
  if (input.hunterApiKeys) env.HUNTER_API_KEYS = input.hunterApiKeys
  if (input.hunterApiKey) env.HUNTER_API_KEY = input.hunterApiKey
  return env
}

/** 官方合并结果里不能残留用户 Hunter Key；自定义不能残留网关凭证。 */
export function mergeHunterMcpEnvironment(
  serverEnvironment: Record<string, string> | undefined,
  built: Record<string, string>,
  official: boolean,
): Record<string, string> {
  const next: Record<string, string> = {
    ...(serverEnvironment ?? {}),
    ...built,
  }
  if (official) {
    delete next.HUNTER_API_KEYS
    delete next.HUNTER_API_KEY
  } else {
    delete next.FTCS_GATEWAY_API_KEY
    delete next.FTCS_TOKEN_GATEWAY_BASE_URL
    delete next.FTCS_CHANNEL_MODE
  }
  return next
}
