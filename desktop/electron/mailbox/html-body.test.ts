import { test } from 'node:test'
import assert from 'node:assert/strict'
import { simpleParser } from 'mailparser'
import { composeBody, readableHtml } from './html-body'

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

test('撰写和恢复草稿保留表格及内嵌图片，只允许支持的图片数据', () => {
  const src = 'data:image/png;base64,iVBORw0KGgo='
  const body = composeBody({
    text_body: '报价\n[图片]',
    html_body:
      '<table style="width:99%"><tbody><tr><th colspan="2">报价</th></tr>' +
      '<tr><td rowspan="2"><img src="' +
      src +
      '" alt="样品"></td></tr></tbody></table>' +
      '<img src="https://invalid.test/external"><img src="file:///private">' +
      '<img src="data:image/svg+xml;base64,AAAA"><img src="data:image/png;base64,invalid!">',
  })
  assert.match(body.html_body!, /<th colspan="2">报价/)
  assert.match(body.html_body!, /<td rowspan="2"><img src="data:image\/png;base64,iVBORw0KGgo=" alt="样品"/)
  assert.doesNotMatch(body.html_body!, /external|private|svg|invalid|style=/)
  assert.deepEqual(composeBody(body), body)
})
