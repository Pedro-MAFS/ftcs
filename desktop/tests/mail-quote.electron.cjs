// Run from desktop with: node_modules/.bin/electron tests/mail-quote.electron.cjs
const { app, BrowserWindow } = require('electron')
const assert = require('node:assert/strict')
const path = require('node:path')

app.whenReady().then(async () => {
  try {
    const { build } = await import('vite')
    const [bundle] = await build({
      configFile: false,
      logLevel: 'silent',
      build: {
        write: false,
        lib: {
          entry: path.resolve(__dirname, '../src/components/mailbox/html-quote.ts'),
          formats: ['iife'],
          name: 'MailQuote',
        },
      },
    })
    const win = new BrowserWindow({ show: false })
    await win.loadURL('about:blank')
    const header = '<div><b>发件人:</b>A<br>发送时间: 昨天<br>收件人: B<br>主题: 测试</div>'
    const divider = '<div><span>-------- </span><span>原始邮件</span><span> --------</span></div>'
    const reply = '<p>回复下</p><p>发自我的iPhone</p>'
    const grouped = '<section>' + divider + header + '</section>'
    const cases = [
      [grouped + '<p>旧正文</p>', true],
      ['<div><p>-------- 原始邮件 --------</p>' + header + '</div><p>旧正文</p>', true],
      ['<span style="display:block">----&nbsp;原始邮件&nbsp;----</span>' + header + '<p>旧正文</p>', true],
      [
        '<div class="gmail_quote"><div class="gmail_attr">On Monday, A wrote:</div><blockquote>旧正文</blockquote></div>',
        true,
      ],
      [divider + header + '<blockquote>旧正文</blockquote>', true],
      [divider + header + '<blockquote type="cite">旧正文</blockquote>', true],
      ['-------- <b>原始邮件</b> --------<br>' + header + '<p>旧正文</p>', true],
      ['<p>-------- 原始邮件 --------</p><p>这是我自己的备注</p>', false],
      ['<div>' + divider + header + '<p>旧正文</p></div><p>补充回复</p>', false],
      [
        divider + header + '<blockquote>问题一</blockquote><p>我的答复</p><blockquote>问题二</blockquote>',
        false,
      ],
    ]
    const actual = await win.webContents.executeJavaScript(
      bundle.output[0].code +
        '\n' +
        '(' +
        ((reply, cases) =>
          cases.map(([tail]) => {
            document.body.innerHTML = reply + tail
            const prefix = MailQuote.replyPrefix(document)
            return prefix ? prefix.textContent.trim() : null
          })).toString() +
        ')(' +
        JSON.stringify(reply) +
        ',' +
        JSON.stringify(cases) +
        ')',
    )
    assert.deepEqual(
      actual,
      cases.map(([, fold]) => (fold ? '回复下发自我的iPhone' : null)),
    )
    console.log('HTML quote boundary cases passed:', cases.length)
    app.exit(0)
  } catch (error) {
    console.error(error)
    app.exit(1)
  }
})
