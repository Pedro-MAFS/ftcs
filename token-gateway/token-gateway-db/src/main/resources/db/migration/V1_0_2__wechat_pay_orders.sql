-- US-G3-01：微信 Native 充值订单
CREATE TABLE token_wechat_pay_orders (
  id                BIGINT       NOT NULL PRIMARY KEY AUTO_INCREMENT,
  out_trade_no      VARCHAR(32)  NOT NULL COMMENT '商户订单号',
  tenant_id         VARCHAR(64)  NOT NULL,
  user_code         VARCHAR(128) NOT NULL,
  user_id           BIGINT       NOT NULL COMMENT 'token_users.id',
  amount_fen        INT          NOT NULL COMMENT '微信分',
  amount_li         BIGINT       NOT NULL COMMENT '账本厘 = fen*10',
  status            VARCHAR(32)  NOT NULL COMMENT 'created|failed|paid|credited|closed',
  code_url          VARCHAR(512) NULL,
  wx_transaction_id VARCHAR(64)  NULL COMMENT '微信支付订单号；入账后填',
  description       VARCHAR(128) NOT NULL,
  notify_url        VARCHAR(512) NOT NULL,
  fail_reason       VARCHAR(256) NULL,
  paid_at           DATETIME(3)  NULL,
  credited_at       DATETIME(3)  NULL,
  created_at        DATETIME(3)  NOT NULL,
  updated_at        DATETIME(3)  NOT NULL,
  UNIQUE KEY uk_out_trade_no (out_trade_no),
  UNIQUE KEY uk_wx_transaction_id (wx_transaction_id),
  KEY idx_user_created (user_id, created_at),
  KEY idx_status_created (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin
  COMMENT='WeChat Native recharge orders';
