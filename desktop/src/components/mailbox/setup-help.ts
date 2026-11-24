/** A provider name can be used as entered. For an address, the agent only needs its domain. */
export function mailProvider(input: string): string {
  const value = input.trim()
  if (!value.includes('@')) return value
  return /^[^\s@]+@([\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+)$/u.exec(value)?.[1]?.toLowerCase() ?? ''
}

/** The credential is one field: a provider-issued code, or the mailbox's own login password. */
export const CREDENTIAL_LABEL = '授权码或邮箱密码'

export function mailSetupQuestion(provider: string, contact = ''): string {
  const developer = contact ? `开发者 ${contact}` : '开发者'
  return [
    `我想在 FTCS 桌面端连接邮箱，服务商名称或邮箱域名是「${provider}」。请先判断这个邮箱能用哪种方式登录第三方邮件客户端，再按下面的情况回答，不要一上来就给授权码步骤。`,
    '',
    '按判断结果三选一：',
    '1. 只能用 OAuth 网页授权：',
    '   - 如果是 Gmail 或 Google Workspace，告诉我点 FTCS 连接框上方的「Google 授权」按钮并在浏览器完成登录，不要让我去生成授权码。',
    '   - 如果 FTCS 还没有对应的授权方式（如 Outlook.com、Microsoft 365、Proton Mail 等），直接说暂不支持，不要给无效步骤，并提示我可以联系' +
      developer +
      '。',
    '2. 支持授权码或应用专用密码（如 QQ、163、126、网易/腾讯/阿里企业邮箱、新浪、搜狐、139 等）：用中文分步说明从服务商的哪个页面进入、要开启哪些收发服务、如何生成授权码或应用专用密码，以及粘贴到 FTCS 的「' +
      CREDENTIAL_LABEL +
      '」栏。这类邮箱直接填网页登录密码会被拒绝，必须用授权码。',
    '3. 判断不准，或该服务商允许客户端直接用网页登录密码：先让我试着在「' +
      CREDENTIAL_LABEL +
      '」栏直接填网页登录密码；如果认证失败，再让我联系' +
      developer +
      '。不要凭空编造获取入口。',
    '',
    '其他要求：',
    '- 以该服务商当前的官方帮助为准，给出可核实的官方入口；不确定就说不知道。',
    '- 如果仅凭域名无法判断服务商，请先问我平时从哪个网页或应用登录。',
    '- FTCS 的授权码模式用 IMAP 收信、SMTP 发信；Google 授权用 IMAP 收信、Gmail API 发信。',
    '- 请不要让我在聊天中提供密码或授权码。',
  ].join('\n')
}
