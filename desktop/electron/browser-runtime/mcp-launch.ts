import type { Config } from '@opencode-ai/sdk/v2'

export const CHROME_DEVTOOLS_MCP = 'chrome-devtools-mcp@1.6.0'
export const BROWSER_URL_PLACEHOLDER = 'http://127.0.0.1:0'

type McpEntry = {
  command?: string[]
  [key: string]: unknown
}

type ConfigWithMcp = Config & {
  mcp?: Record<string, McpEntry>
}

export function rewriteChromeDevtoolsLaunch(config: Config, browserUrl: string | null): Config {
  const source = config as ConfigWithMcp
  const mcp = source.mcp
  if (!mcp || typeof mcp !== 'object' || !mcp['chrome-devtools']) return config
  const url = browserUrl && browserUrl.trim() ? browserUrl.trim() : BROWSER_URL_PLACEHOLDER
  return {
    ...source,
    mcp: {
      ...mcp,
      'chrome-devtools': {
        ...mcp['chrome-devtools'],
        command: ['npx', '-y', CHROME_DEVTOOLS_MCP, '--browserUrl', url],
      },
    },
  }
}
