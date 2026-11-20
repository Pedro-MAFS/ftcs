import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { getEmailDraftSlot, getEmailRecipientPool } from './emails-reader'
import { approveEmailDraft, assertReviewSlot } from './emails-writer'
import { accountDir, uuid } from '../mailbox/storage'
import { reviewAddresses, type ReviewSend, type OutreachBinding, type OutreachSource } from '../mailbox/outreach-types'
import type { ComposerStore } from '../mailbox/composer-store'

/** Finish local validation and persist the approval before the first SMTP call. */
export function approveForDelivery(root: string, account: string, edit: ReviewSend, store: ComposerStore) {
  assertReviewSlot(edit.productId, edit.leadId, edit.recipientKey)
  if (
    !uuid(edit.request) ||
    !edit.version ||
    !edit.subject.trim() ||
    /[\r\n\0]/.test(edit.subject) ||
    !edit.body.trim()
  )
    throw new Error('请核对开发信的主题和正文。')
  const { productId, leadId, recipientKey } = edit
  const slot = getEmailDraftSlot(productId, leadId, recipientKey, root, edit.to)
  if (!slot.ok || !slot.exists) throw new Error(slot.message || '开发信不存在。')
  const old = slot.outreach
  if (old && old.account_id !== account) throw new Error('此发送记录属于原邮箱，请先重新连接原邮箱。')
  const existing = store.outreachResult(edit.request, edit)
  if (existing) {
    if (!store.sameReview(edit.request, edit)) throw new Error('请求对应的收件人或原文不同，请重新核对。')
    return { result: existing }
  }
  const prior = old && store.outreachResult(old.request_id, edit)
  if (prior && prior.state !== 'failed') {
    if (!store.sameReview(old!.request_id, edit)) throw new Error('此草稿已有发送记录，请刷新并核对原文。')
    return { result: prior }
  }
  if (slot.version !== edit.version) throw new Error('草稿已更新，请刷新并重新核对。')
  const pool = getEmailRecipientPool(productId, leadId, root)
  const item = pool.pool.find((p) => p.recipientKey === recipientKey)
  if (!item || !reviewAddresses(slot, item).includes(edit.to)) throw new Error('收件地址已改变，请重新选择。')

  const created = new Date().toISOString()
  const log = path.join(
    accountDir(path.join(root, 'data', 'mail'), account),
    'sends',
    created.slice(0, 7) + '.jsonl',
  )
  const binding: OutreachBinding = {
    account_id: account,
    request_id: edit.request,
    created_at: created,
    offset: fs.existsSync(log) ? fs.statSync(log).size : 0,
    review_id: old && store.sameReview(old.request_id, edit) ? old.review_id : randomUUID(),
  }
  const approval = approveEmailDraft(
    { ...edit, selectedTo: edit.to, expectedVersion: edit.version },
    root,
    binding,
  )
  if (!approval.ok) throw new Error(approval.message)
  const source: OutreachSource = {
    kind: 'outreach',
    product_id: productId,
    lead_id: leadId,
    recipient_key: recipientKey,
    review_id: binding.review_id,
    recipient_profile: slot.recipientProfile,
  }
  return { binding, source }
}
