import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  clearAttachmentPreviews,
  describeAttachment,
  localAttachment,
  openAttachment,
  saveAttachment,
} from './attachments'
import { append, atomic } from './storage'
import { ImportIndex } from './conversations'

test('旧消息中同名附件按位置取回，保存原始字节，系统打开独立的命名副本', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ftcs-attachment-test-'))
  t.after(() => {
    clearAttachmentPreviews()
    fs.rmSync(dir, { recursive: true, force: true })
  })
  const attachments = [2, 7].map((byte) => {
    const attachment_id = randomUUID()
    atomic(path.join(dir, 'attachments', attachment_id, 'content'), Buffer.from([byte, 0, 255]))
    return {
      attachment_id,
      filename: '报价单.pdf',
      size_bytes: 3,
      mime_type: 'application/pdf',
      availability: 'local' as const,
    }
  })
  append(path.join(dir, 'messages', '2026-11.jsonl'), {
    message_id: 'm',
    text_body: '报价',
    occurred_at: '2026-11-19',
    conversation_contact_ids: ['c'],
    attachments,
  })
  const index = await ImportIndex.load(dir, () => {})
  const view = (await index.timeline('c', undefined, () => {})).messages[0]
  assert.ok(view.attachments.every((a) => a.available && a.previewable))
  assert.throws(() => index.attachment('m', -1))
  assert.throws(() => index.attachment('other', 0))
  const file = localAttachment(dir, index.attachment('m', 1))
  const target = path.join(dir, '报价单.pdf')
  await saveAttachment(file, target, () => {})
  assert.deepEqual(fs.readFileSync(target), Buffer.from([7, 0, 255]))
  let preview = ''
  await openAttachment(
    file,
    () => {},
    async (name) => {
      preview = name
      assert.equal(path.basename(name), '报价单.pdf')
      assert.deepEqual(fs.readFileSync(name), fs.readFileSync(target))
      fs.writeFileSync(name, 'edited preview')
      return ''
    },
  )
  assert.deepEqual(fs.readFileSync(file.content), Buffer.from([7, 0, 255]))
  clearAttachmentPreviews()
  assert.equal(fs.existsSync(preview), false)
  let checks = 0
  await assert.rejects(
    saveAttachment(localAttachment(dir, attachments[0]), target, () => {
      if (++checks === 2) throw new Error('账号已改变')
    }),
    /账号已改变/,
  )
  assert.deepEqual(fs.readFileSync(target), Buffer.from([7, 0, 255]))
  await assert.rejects(
    openAttachment(
      file,
      () => {},
      async () => 'no associated application',
    ),
    /系统无法打开/,
  )
  fs.unlinkSync(file.content)
  assert.throws(() => localAttachment(dir, attachments[1]), /缺失/)
})

test('原始文件名不作为目录，程序附件支持保存，缺少本地引用时不提供操作', () => {
  const meta = { filename: '../报价.pdf', attachment_id: randomUUID(), size_bytes: 5 }
  assert.equal(describeAttachment(meta).filename, '报价.pdf')
  assert.equal(describeAttachment({ ...meta, filename: '..\\CON.txt' }).filename, '_CON.txt')
  assert.equal(
    describeAttachment({ ...meta, filename: '未命名', mime_type: 'image/png' }).filename,
    '未命名.png',
  )
  const program = describeAttachment({ ...meta, filename: '报价.pdf.exe' })
  assert.ok(program.available && !program.previewable)
  assert.equal(describeAttachment({ ...meta, availability: 'remote' }).available, false)
  assert.equal(describeAttachment({ ...meta, attachment_id: '..' }).available, false)
})
