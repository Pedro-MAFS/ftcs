-- US-G3-06：官方通道充值短时 ticket（只存 hash）
CREATE TABLE token_recharge_tickets (
  id              BIGINT       NOT NULL PRIMARY KEY AUTO_INCREMENT,
  ticket_hash     CHAR(64)     NOT NULL COMMENT 'SHA-256 hex of pepper||raw',
  tenant_id       VARCHAR(64)  NOT NULL,
  user_code       VARCHAR(128) NOT NULL,
  user_id         BIGINT       NULL COMMENT 'token_users.id when known',
  expires_at      DATETIME(3)  NOT NULL,
  created_at      DATETIME(3)  NOT NULL,
  last_used_at    DATETIME(3)  NULL,
  revoked_at      DATETIME(3)  NULL COMMENT 'manual revoke',
  UNIQUE KEY uk_ticket_hash (ticket_hash),
  KEY idx_tenant_user_created (tenant_id, user_code, created_at),
  KEY idx_tenant_user_exp (tenant_id, user_code, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin
  COMMENT='Official-channel recharge short-lived tickets';
