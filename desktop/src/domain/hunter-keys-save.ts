/**
 * 官方保存不提交 Hunter Key 槽位，避免空数组把磁盘上的 Key 清掉（US-HC-05）。
 * 自定义仍提交槽位，由 settings-service 写回。
 */
export function hunterApiKeysSaveField(
  channelMode: string,
  slots: readonly string[],
): { hunterApiKeys?: string[] } {
  if (channelMode !== 'custom') return {}
  return { hunterApiKeys: slots.map((key) => String(key)) }
}
