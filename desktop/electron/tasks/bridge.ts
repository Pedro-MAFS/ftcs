import http from 'node:http'
import { randomBytes, randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import type { Begin, Done } from './lifecycle'

export interface ToolIdentity {
  sessionID: string
  callID: string
  tool: string
  taskID?: string
}
export interface TaskReceiver {
  disconnect(): void
  begin(session: string, request: Begin): Promise<unknown>
  done(session: string, request: Done): unknown
  recordWrite(context: ToolIdentity, result: Record<string, string>): void
  authorize(context: ToolIdentity, args: Record<string, unknown>): string | undefined
}

/** Only the OpenCode host hook can mint a ticket. MCP consumes it exactly once. */
export async function openTaskBridge(receiver: () => TaskReceiver) {
  const pluginKey = randomBytes(32).toString('hex')
  const mcpKey = randomBytes(32).toString('hex')
  const tickets = new Map<
    string,
    { identity: ToolIdentity; args: Record<string, unknown>; expires: number }
  >()
  const receipts = new Map<string, ToolIdentity>()
  const server = http.createServer(async (req, res) => {
    const reply = (status: number, data: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(data))
    }
    const lifecycle = req.url === '/task_begin' || req.url === '/task_done'
    if (req.method !== 'POST' || (!lifecycle && !['/before', '/execute', '/commit'].includes(req.url ?? '')))
      return reply(404, {})
    if (req.headers.authorization !== `Bearer ${req.url === '/before' ? pluginKey : mcpKey}`)
      return reply(403, {})
    try {
      const chunks: Buffer[] = []
      let size = 0
      for await (const chunk of req) {
        size += chunk.length
        if (size > 256 * 1024) throw new Error('请求过大')
        chunks.push(chunk)
      }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      if (req.url === '/commit') {
        const identity = receipts.get(body.receipt)
        if (!identity) throw new Error('无效保存凭据')
        receipts.delete(body.receipt)
        if (body.summary) receiver().recordWrite(identity, body.summary)
        return reply(200, { ok: true })
      }
      if (req.url === '/before') {
        const { sessionID, callID, tool } = body
        if (![sessionID, callID, tool].every((v) => typeof v === 'string' && v.length > 0 && v.length < 256))
          throw new Error('无效调用上下文')
        const identity: ToolIdentity = { sessionID, callID, tool }
        identity.taskID = receiver().authorize(identity, body.args ?? {})
        if (!tool.startsWith('lead-store_')) return reply(200, { ok: true })
        for (const [key, value] of tickets) if (value.expires < Date.now()) tickets.delete(key)
        const ticket = randomUUID()
        tickets.set(ticket, { identity, args: body.args ?? {}, expires: Date.now() + 60_000 })
        return reply(200, { ticket })
      }
      const { _ticket, ...request } = body
      const ticket = tickets.get(_ticket)
      tickets.delete(_ticket)
      if (
        !ticket ||
        ticket.expires < Date.now() ||
        ticket.identity.tool !== `lead-store_${req.url === '/execute' ? request.name : req.url!.slice(1)}`
      )
        throw new Error('无效会话凭据')
      if (req.url === '/execute') {
        const current = receiver().authorize(ticket.identity, ticket.args)
        if (!current || current !== ticket.identity.taskID) throw new Error('任务已结束')
        if (
          request.name === 'exploration_start' &&
          [...receipts.values()].some((call) => call.taskID === current && call.tool === ticket.identity.tool)
        )
          throw new Error('正在创建探索记录')
        const receipt = randomUUID()
        receipts.set(receipt, ticket.identity)
        return reply(200, { ok: true, receipt })
      }
      if (
        req.url === '/task_done' &&
        [...receipts.values()].some((value) => value.taskID === request.task_id)
      )
        throw new Error('业务工具仍在执行，请稍后重试')
      const result =
        req.url === '/task_begin'
          ? await receiver().begin(ticket.identity.sessionID, request)
          : await receiver().done(ticket.identity.sessionID, request)
      reply(200, { ok: true, ...(result as object) })
    } catch (error) {
      const message = error instanceof Error ? error.message : '请求失败'
      const code = /^[A-Z_]+$/.test(message) ? message : 'TASK_REJECTED'
      reply(400, { ok: false, code, message })
    }
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    pluginKey,
    mcpKey,
    close() {
      receiver().disconnect()
      tickets.clear()
      receipts.clear()
      server.close()
      server.closeAllConnections()
    },
  }
}
