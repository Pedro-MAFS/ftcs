import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

const id = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[a-zA-Z0-9_.+-]+$/)
  .refine((v) => v !== '.' && v !== '..')
const common = {
  protocol_version: z.literal(1),
  request_id: z.string().uuid(),
  _ticket: z.string().optional().describe('Desktop runtime only; omit.'),
}
async function call(name: string, data: unknown) {
  const url = process.env.FTCS_TASK_URL
  const key = process.env.FTCS_TASK_MCP_KEY
  try {
    if (!url || !key) throw new Error('桌面任务通道未连接')
    const response = await fetch(`${url}/${name}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify(data),
    })
    return { isError: !response.ok, content: [{ type: 'text' as const, text: await response.text() }] }
  } catch (e) {
    return {
      isError: true,
      content: [{ type: 'text' as const, text: e instanceof Error ? e.message : '任务通道不可用' }],
    }
  }
}
export function registerTaskTools(server: McpServer) {
  server.tool(
    'task_begin',
    'Start a desktop task after required inputs are selected. Reuse request_id when retrying. Use returned task_id and prepared inputs.',
    {
      ...common,
      task_type: z.enum([
        'extract-product-profile',
        'expand-keywords',
        'discover-leads',
        'discover-leads-r2',
        'discover-leads-r3',
        'score-and-dedupe',
        'enrich-lead-contacts',
        'draft-outreach-email',
        'translate-outreach-email',
      ]),
      scope: z
        .object({
          product_id: id.nullable().optional(),
          lead_id: id.optional(),
          recipient_key: id.optional(),
        })
        .strict(),
      parameters: z
        .object({
          library_sources: z.array(z.string().min(1).max(1000)).min(1).max(500).optional(),
          mode: z.enum(['batch', 'slot']).optional(),
          lead_ids: z.array(id).max(1000).optional(),
          verify_emails: z.boolean().optional(),
          max_queries: z.number().int().positive().optional(),
          email: z.string().email().optional(),
        })
        .strict(),
    },
    (data) => call('task_begin', data),
  )
  server.tool(
    'task_done',
    'Finish this specific desktop task after business tools finish. Report partial or failed when appropriate.',
    {
      ...common,
      task_id: z.string().uuid(),
      outcome: z.enum(['succeeded', 'partial', 'failed', 'cancelled']),
      message: z.string().max(500),
      result: z
        .object({
          run_id: id.optional(),
          completed_count: z.number().int().nonnegative().optional(),
          skipped_count: z.number().int().nonnegative().optional(),
        })
        .strict()
        .optional(),
    },
    (data) => call('task_done', data),
  )
}

// Confirm storage results inside MCP, before OpenCode can truncate a long tool
// response. Only identifiers from the result cross the desktop boundary.
export function businessTool<Shape extends z.ZodRawShape>(
  server: McpServer,
  name: string,
  description: string,
  shape: Shape,
  execute: (
    args: z.output<z.ZodObject<Shape>>,
  ) => Promise<import('@modelcontextprotocol/sdk/types.js').CallToolResult>,
) {
  const schema = z.object(shape).extend({ _ticket: common._ticket })
  server.registerTool(name, { description, inputSchema: schema }, async (input) => {
    const { _ticket, ...args } = input
    const check = await call('execute', { _ticket, name })
    if (check.isError) return check
    const receipt = JSON.parse(check.content[0].text).receipt
    let summary: Record<string, unknown> | null = null
    try {
      const output = await execute(args as z.output<z.ZodObject<Shape>>)
      const first = output.content[0]
      if (!output.isError && first?.type === 'text') {
        const saved = JSON.parse(first.text)
        if (!saved.error && saved.success !== false) {
          const slots =
            saved.plans?.flatMap((plan: { lead_id: string; slots: { recipient_key: string }[] }) =>
              plan.slots.map((slot) => [plan.lead_id, slot.recipient_key]),
            ) ?? (saved.slot ? [[saved.lead_id, saved.slot.recipient_key]] : undefined)
          summary = {
            run_id: saved.run_id,
            lead_id: saved.lead_id,
            recipient_key: saved.recipient_key,
            slots,
          }
        }
      }
      return output
    } finally {
      const ack = await call('commit', { receipt, summary })
      if (ack.isError) throw new Error('桌面未能确认工具执行结果')
    }
  })
}
