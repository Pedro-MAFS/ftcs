import type { AgentPreflightKind, AgentPreflightResult } from '../types/electron'

/**
 * 启动 AI 任务前调用：检测 OpenCode / 模型 / 搜索 / MCP。
 * 未通过时返回错误文案（可直接展示）；通过返回 null。
 */
export async function ensureAgentReady(
  kind: AgentPreflightKind,
): Promise<string | null> {
  if (!window.ftcs?.checkAgentPreflight) {
    return '当前环境不支持环境预检，请使用桌面客户端'
  }
  try {
    const res: AgentPreflightResult = await window.ftcs.checkAgentPreflight(kind)
    if (res.ok) return null
    return res.message || '环境未就绪，请先到设置页完成配置'
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}
