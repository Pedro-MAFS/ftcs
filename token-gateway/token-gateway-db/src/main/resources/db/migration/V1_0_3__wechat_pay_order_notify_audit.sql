-- US-G3-02：记录最近一次支付结果通知，便于排查「有无回调 / 通知了什么状态」
ALTER TABLE token_wechat_pay_orders
  ADD COLUMN last_notify_at DATETIME(3) NULL COMMENT '最近一次验签成功的微信回调时间' AFTER credited_at,
  ADD COLUMN last_notify_trade_state VARCHAR(32) NULL COMMENT '最近一次回调的 trade_state' AFTER last_notify_at,
  ADD COLUMN last_notify_result VARCHAR(64) NULL COMMENT '最近一次本地处理结果短码' AFTER last_notify_trade_state,
  ADD COLUMN notify_count INT NOT NULL DEFAULT 0 COMMENT '验签成功的回调次数' AFTER last_notify_result;
