import fs from 'node:fs'
import path from 'node:path'
import { getWorkspaceRoot } from '../config/paths'
import { readEnvFile } from '../config/env-file'
import { readHunterKeysFromEnv } from '../settings/hunter-keys'
import {
  listLeadsSnapshot,
  type LeadRow,
} from './leads-reader'
import {
  mapHunterVerifierStatus,
  shouldAppendContactC7,
} from './person-helpers'

export interface VerifyPersonEmailInput {
  productId: string
  leadId: string
  personId: string
}

export interface VerifyPersonEmailResult {
  ok: boolean
  message: string
  lead?: LeadRow
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function getScoredPath(productId: string, workspaceRoot: string): string {
  return path.join(workspaceRoot, 'data', 'leads', productId, 'scored.json')
}

async function callEmailVerifier(
  apiKey: string,
  email: string,
): Promise<{
  ok: boolean
  httpStatus: number
  status?: string | null
  score?: number | null
  message: string
}> {
  try {
    const url = new URL('https://api.hunter.io/v2/email-verifier')
    url.searchParams.set('email', email)
    const res = await fetch(url, {
      headers: { 'X-API-Key': apiKey },
    })
    if (res.status === 401) {
      return { ok: false, httpStatus: 401, message: 'Key 无效' }
    }
    if (res.status === 402) {
      return {
        ok: false,
        httpStatus: 402,
        message: 'Hunter 额度不足，请到 Hunter 账户充值',
      }
    }
    if (res.status === 202) {
      return {
        ok: false,
        httpStatus: 202,
        message: '验证仍在处理中，请稍后重试',
        status: null,
      }
    }
    if (!res.ok) {
      return {
        ok: false,
        httpStatus: res.status,
        message: `Hunter 返回 HTTP ${res.status}`,
      }
    }
    const json = (await res.json()) as {
      data?: { status?: string | null; score?: number | null }
    }
    const data = json.data
    return {
      ok: true,
      httpStatus: res.status,
      status: data?.status ?? null,
      score:
        typeof data?.score === 'number' && Number.isFinite(data.score)
          ? Math.round(data.score)
          : null,
      message: 'ok',
    }
  } catch (err) {
    return {
      ok: false,
      httpStatus: 0,
      message: `无法连接 Hunter：${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

/**
 * 主进程单条验邮（US-C-04）：不启 OpenCode。
 */
export async function verifyPersonEmail(
  input: VerifyPersonEmailInput,
  workspaceRoot = getWorkspaceRoot(),
): Promise<VerifyPersonEmailResult> {
  const productId = (input.productId || '').trim()
  const leadId = (input.leadId || '').trim()
  const personId = (input.personId || '').trim()
  if (!productId) return { ok: false, message: '缺少 productId' }
  if (!leadId) return { ok: false, message: '缺少 leadId' }
  if (!personId) return { ok: false, message: '缺少 personId' }

  const env = readEnvFile(path.join(workspaceRoot, '.env'))
  const keys = readHunterKeysFromEnv(env)
  if (keys.length === 0) {
    return {
      ok: false,
      message: '请先在设置 → 集成配置 Hunter API Key',
    }
  }

  const scoredPath = getScoredPath(productId, workspaceRoot)
  if (!fs.existsSync(scoredPath)) {
    return { ok: false, message: `未找到 scored.json：${productId}` }
  }

  let root: Record<string, unknown>
  try {
    root = JSON.parse(fs.readFileSync(scoredPath, 'utf8')) as Record<
      string,
      unknown
    >
  } catch {
    return { ok: false, message: 'scored.json 解析失败' }
  }

  const leads = Array.isArray(root.leads) ? root.leads : []
  const leadIndex = leads.findIndex((item) => {
    const row = asRecord(item)
    return row && String(row.id || '') === leadId
  })
  if (leadIndex < 0) {
    return { ok: false, message: `未找到线索 ${leadId}` }
  }

  const lead = asRecord(leads[leadIndex])!
  const people = Array.isArray(lead.people) ? [...lead.people] : []
  const personIndex = people.findIndex((item) => {
    const row = asRecord(item)
    return row && String(row.id || '') === personId
  })
  if (personIndex < 0) {
    return { ok: false, message: '联系人不存在或已删除' }
  }

  const person = asRecord(people[personIndex])!
  const email = String(person.email || '').trim()
  if (!email) {
    return { ok: false, message: '该联系人没有邮箱' }
  }

  let lastMessage = '验证失败'
  let verified: Awaited<ReturnType<typeof callEmailVerifier>> | null = null
  for (const key of keys) {
    const result = await callEmailVerifier(key, email)
    if (result.httpStatus === 401) {
      lastMessage = result.message
      continue
    }
    if (result.httpStatus === 402) {
      return { ok: false, message: result.message }
    }
    if (!result.ok) {
      return { ok: false, message: result.message }
    }
    verified = result
    break
  }

  if (!verified) {
    return {
      ok: false,
      message:
        lastMessage === 'Key 无效'
          ? 'Key 无效，请检查设置'
          : lastMessage,
    }
  }

  const emailStatus = mapHunterVerifierStatus(verified.status)
  const prevConfidence =
    typeof person.confidence === 'number' && Number.isFinite(person.confidence)
      ? person.confidence
      : 0
  const confidence =
    verified.score != null
      ? Math.max(0, Math.min(100, verified.score))
      : prevConfidence

  const updatedPerson = {
    ...person,
    email_status: emailStatus,
    confidence,
  }
  people[personIndex] = updatedPerson
  lead.people = people

  let contactsAppended = 0
  if (
    shouldAppendContactC7({
      email,
      email_status: emailStatus,
      confidence,
    })
  ) {
    const contacts = Array.isArray(lead.contacts) ? [...lead.contacts] : []
    const existing = new Set(
      contacts
        .map((c) => asRecord(c))
        .filter(Boolean)
        .filter((c) => String(c!.type || '') === 'email')
        .map((c) => String(c!.value || '').toLowerCase()),
    )
    if (!existing.has(email.toLowerCase())) {
      contacts.push({ type: 'email', value: email, confidence: 'high' })
      lead.contacts = contacts
      contactsAppended = 1
    }
  }

  leads[leadIndex] = lead
  root.leads = leads
  root.updated_at = new Date().toISOString()
  fs.writeFileSync(scoredPath, `${JSON.stringify(root, null, 2)}\n`, 'utf8')

  const snapshot = listLeadsSnapshot(productId, workspaceRoot)
  const row = snapshot.rows.find((r) => r.id === leadId)
  return {
    ok: true,
    message:
      contactsAppended > 0
        ? `已验证为 ${emailStatus}，并写入 contacts`
        : `已验证为 ${emailStatus}`,
    lead: row,
  }
}
