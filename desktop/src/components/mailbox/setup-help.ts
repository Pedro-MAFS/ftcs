/** A provider name can be used as entered. For an address, the agent only needs its domain. */
export function mailProvider(input: string): string {
  const value = input.trim()
  if (!value.includes('@')) return value
  return /^[^\s@]+@([\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+)$/u.exec(value)?.[1]?.toLowerCase() ?? ''
}

export function mailSetupQuestion(provider: string): string {
  return [
    `我想在 FTCS 桌面端连接邮箱，服务商名称或邮箱域名是「${provider}」。邮箱授权码是什么，我该怎么获取并填写？`,
    '请用中文给第一次配置邮箱的人分步说明，从服务商的哪个页面进入、需要开启哪些收发服务、如何生成授权码或应用专用密码，以及在 FTCS 哪里填写。FTCS 使用 IMAP 收信、SMTP 发信。',
    '请以该服务商当前的官方帮助为准，给出可核实的官方入口。如果仅凭域名无法判断服务商，请先问我平时从哪个网页或应用登录。如果该账号或组织不支持这种连接方式，请说明原因。',
    '我会自行操作，生成的授权码只填在 FTCS 的「邮箱授权码」框里。请不要让我在聊天中提供密码或授权码。',
  ].join('\n')
}
