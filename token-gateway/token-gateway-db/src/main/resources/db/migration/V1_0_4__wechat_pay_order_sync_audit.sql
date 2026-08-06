-- US-G3-03：主动查单审计字段（与 last_notify_* 分离）
-- 注意：TiDB 同一条 ALTER 内不能 AFTER 引用本语句刚 ADD 的列，故分四条执行。
ALTER TABLE token_wechat_pay_orders
  ADD COLUMN last_sync_at DATETIME(3) NULL COMMENT '最近一次主动查单时间' AFTER notify_count;

ALTER TABLE token_wechat_pay_orders
  ADD COLUMN last_sync_trade_state VARCHAR(32) NULL COMMENT '最近一次查单 trade_state' AFTER last_sync_at;

ALTER TABLE token_wechat_pay_orders
  ADD COLUMN last_sync_result VARCHAR(64) NULL COMMENT '最近一次查单本地处理结果' AFTER last_sync_trade_state;

ALTER TABLE token_wechat_pay_orders
  ADD COLUMN sync_count INT NOT NULL DEFAULT 0 COMMENT '主动查单次数' AFTER last_sync_result;
