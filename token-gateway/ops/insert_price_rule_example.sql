-- 调价示例（US-G0-09）：只 INSERT 新版本，勿 UPDATE 覆盖历史价。
-- 金额单位：厘 / 百万 Token。已 charged 的 token_request_logs 金额不回改。
-- 将下方数值换成复核后的正式价；effective_from 用预约生效 UTC 时间。

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
  'deepseek-v4-flash',
  1200,
  2300,
  1008,
  20,
  2016,
  UTC_TIMESTAMP(3),
  UTC_TIMESTAMP(3)
);
