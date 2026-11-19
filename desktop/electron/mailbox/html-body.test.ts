import { test } from 'node:test'
import assert from 'node:assert/strict'
import { simpleParser } from 'mailparser'
import { readableHtml } from './html-body'

test('保留邮件排版和 RFC 邮件内嵌图片', async () => {
  const mail = await simpleParser(
    [
      'MIME-Version: 1.0',
      'Content-Type: multipart/related; boundary=parts',
      '',
      '--parts',
      'Content-Type: text/html; charset=utf-8',
      '',
      '<table><tr><td style="color: red">产品图</td></tr></table><img src="cid:product">',
      '--parts',
      'Content-Type: image/png',
      'Content-ID: <product>',
      'Content-Transfer-Encoding: base64',
      '',
      'iVBORw0KGgo=',
      '--parts--',
      '',
    ].join('\r\n'),
    { skipHtmlToText: true, skipTextToHtml: true },
  )
  assert.ok(mail.html)
  const { fragment, remoteImages } = readableHtml(mail.html)
  assert.match(fragment, /<table>/)
  assert.match(fragment, /style="color: red"/)
  assert.match(fragment, /src="data:image\/png;base64,iVBORw0KGgo="/)
  assert.equal(remoteImages, false)
})
test('外部资源需用户选择，邮件不能携带可执行元素或导航地址', () => {
  const { fragment, remoteImages } = readableHtml(
    '<meta http-equiv="refresh"><style>.logo{color:red}</style><iframe src="file:///etc"></iframe><script>bad()</script><img src="//images.example.test/logo.png" onerror="bad()"><img src="file:///tmp/private"><a href="https://example.test">站点</a>',
  )
  assert.equal(remoteImages, true)
  assert.match(fragment, /https:\/\/images.example.test\/logo.png/)
  assert.match(fragment, /data-mail-link="https:\/\/example.test"/)
  assert.match(fragment, /<style>/)
  assert.doesNotMatch(fragment, /<iframe|<meta|<script|bad\(\)|onerror|file:\/\/| href=/)
})
