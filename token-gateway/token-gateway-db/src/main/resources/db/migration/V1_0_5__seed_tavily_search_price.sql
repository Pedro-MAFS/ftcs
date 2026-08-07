-- US-G5-03: tavily.search per-call price encoded as li/MTok * 1e6 (see US-G5-03 design).
-- Seed: user 0 li/call; cogs 60 li/call (= 6 fen / 0.06 CNY). Ops may INSERT a new effective_from later.
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
  '2020-01-01 00:00:00.000',
  UTC_TIMESTAMP(3)
);
