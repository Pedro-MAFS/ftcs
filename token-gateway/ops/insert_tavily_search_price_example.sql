-- 调价示例（US-G5-03）：tavily.search 按次价，只 INSERT 新版本，勿 UPDATE 覆盖历史价。
-- 编码约定（方案 A）：
--   input_price_li_per_mTok  = 厘/次 × 1000000
--   output_price_li_per_mTok = 0
--   upstream_input_cost_li_per_mTok = 上游成本厘/次 × 1000000
-- 单位：1 元 = 1000 厘；6 分 = 0.06 元 = 60 厘
-- 例（与当前种子一致）：用户 0 厘/次 → input = 0；COGS 60 厘/次 → upstream_input = 60000000
-- 已 charged 的 token_request_logs 金额不回改。

INSERT INTO token_price_rules (
  model,
  input_price_li_per_mTok,
  output_price_li_per_mTok,
  upstream_input_cost_li_per_mTok,
  upstream_cache_cost_li_per_mTok,
  upstream_output_cost_li_per_mTok,
  effective_from,
  created_at
) VALUES (
  'tavily.search',
  0,
  0,
  60000000,
  0,
  0,
  UTC_TIMESTAMP(3),
  UTC_TIMESTAMP(3)
);
