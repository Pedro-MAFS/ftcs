// The host supplies sessionID/callID. Never take identity from model arguments.
const lifecycle = new Set(['lead-store_task_begin', 'lead-store_task_done'])
const siteTools = new Set(['lead-store_site_status', 'lead-store_site_preview', 'lead-store_site_open_preview', 'lead-store_site_build', 'lead-store_site_publish_prepare'])
const writes = new Set([
  'product_save',
  'inputs_ensure_dir',
  'keywords_save',
  'lead_append_raw',
  'lead_set_company_intelligence',
  'exploration_start',
  'exploration_update',
  'exploration_finish',
  'leads_score_and_dedupe',
  'leads_patch_scored',
  'email_draft_plan',
  'email_draft_plan_slot',
  'email_draft_save',
  'email_draft_save_zh',
])
const metered = new Set([
  'search-api_search_web',
  'places-api_places_text_search',
  'places-api_place_details',
  'hunter-api_domain_search',
  'hunter-api_email_verifier',
])
export const TaskContext = async () => ({
  'tool.execute.before': async ({ sessionID, callID, tool }, { args }) => {
    if (
      !metered.has(tool) &&
      !siteTools.has(tool) &&
      !lifecycle.has(tool) &&
      !(tool.startsWith('lead-store_') && writes.has(tool.slice(11)))
    )
      return
    const { lead_id, recipient_key, rounds, round } = args
    const run_id = args.run_id ?? args.lead?.run_id
    const product_id = args.product_id ?? args.draft?.product_id
    const response = await fetch(`${process.env.FTCS_TASK_URL}/before`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${process.env.FTCS_TASK_PLUGIN_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sessionID,
        callID,
        tool,
        args: { product_id, lead_id, recipient_key, run_id, rounds, round },
      }),
    })
    const result = await response.json()
    if (!response.ok) throw new Error(result.message || '桌面任务校验失败')
    if (!metered.has(tool)) args._ticket = result.ticket
  },
})
