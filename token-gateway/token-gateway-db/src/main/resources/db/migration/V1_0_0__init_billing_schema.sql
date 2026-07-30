-- Aligns with application release 1.0.0 (Flyway version 1.0.0).
-- Billing schema: token_* tables, amounts in CNY li (BIGINT). Collation utf8mb4_bin.
-- Encoding: UTF-8 (ASCII comments only). See US-G0-02 design.

CREATE TABLE token_users (
  id              BIGINT       NOT NULL AUTO_INCREMENT,
  tenant_id       VARCHAR(64)  NOT NULL COMMENT 'UC tenant id',
  user_code       VARCHAR(128) NOT NULL COMMENT 'UC user code',
  balance_li      BIGINT       NOT NULL DEFAULT 0 COMMENT 'balance in li',
  status          VARCHAR(32)  NOT NULL DEFAULT 'active' COMMENT 'active|disabled',
  rpm_limit       INT          NULL COMMENT 'account RPM; null=default',
  tpm_limit       INT          NULL COMMENT 'account TPM; null=default',
  daily_limit_li  BIGINT       NULL COMMENT 'daily spend limit in li',
  created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_token_users_tenant_user (tenant_id, user_code),
  KEY idx_token_users_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin
  COMMENT='billing account; balance shared across keys';

CREATE TABLE token_api_keys (
  id           BIGINT       NOT NULL AUTO_INCREMENT,
  user_id      BIGINT       NOT NULL COMMENT 'logical ref token_users.id',
  name         VARCHAR(64)  NOT NULL COMMENT 'client name e.g. ftcs-desktop',
  key_hash     CHAR(64)     NOT NULL COMMENT 'SHA-256 hex; see US-G0-02',
  key_prefix   VARCHAR(32)  NOT NULL COMMENT 'display prefix e.g. sk-ab12',
  status       VARCHAR(32)  NOT NULL DEFAULT 'active' COMMENT 'active|disabled',
  created_at   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  last_used_at DATETIME(3)  NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_token_api_keys_user_name (user_id, name),
  UNIQUE KEY uk_token_api_keys_hash (key_hash),
  KEY idx_token_api_keys_user_status (user_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin
  COMMENT='named API keys; plaintext returned once only';

CREATE TABLE token_price_rules (
  id                                  BIGINT       NOT NULL AUTO_INCREMENT,
  model                               VARCHAR(128) NOT NULL COMMENT 'request model id',
  input_price_li_per_mTok             BIGINT       NOT NULL COMMENT 'user input price li/MTok',
  output_price_li_per_mTok            BIGINT       NOT NULL COMMENT 'user output price li/MTok',
  upstream_input_cost_li_per_mTok     BIGINT       NOT NULL COMMENT 'upstream uncached input cost',
  upstream_cache_cost_li_per_mTok     BIGINT       NOT NULL COMMENT 'upstream cache input cost',
  upstream_output_cost_li_per_mTok    BIGINT       NOT NULL COMMENT 'upstream output cost',
  effective_from                      DATETIME(3)  NOT NULL COMMENT 'effective from UTC',
  created_at                          DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_token_price_model_from (model, effective_from),
  KEY idx_token_price_model_from (model, effective_from)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin
  COMMENT='price versions; insert new rows on change';

CREATE TABLE token_ledger_entries (
  id               BIGINT       NOT NULL AUTO_INCREMENT,
  user_id          BIGINT       NOT NULL,
  type             VARCHAR(32)  NOT NULL COMMENT 'topup|charge|adjust',
  amount_li        BIGINT       NOT NULL COMMENT 'topup positive, charge negative',
  balance_after_li BIGINT       NOT NULL COMMENT 'balance after change in li',
  request_id       VARCHAR(64)  NULL COMMENT 'ref token_request_logs.request_id',
  note             VARCHAR(512) NULL COMMENT 'required for topup/adjust',
  operator         VARCHAR(128) NULL COMMENT 'required for topup/adjust',
  created_at       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_token_ledger_user_time (user_id, created_at),
  KEY idx_token_ledger_request (request_id),
  KEY idx_token_ledger_type_time (type, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin
  COMMENT='ledger; balance updates must insert in same txn';

CREATE TABLE token_request_logs (
  request_id         VARCHAR(64)  NOT NULL COMMENT 'gateway request id',
  user_id            BIGINT       NOT NULL,
  key_id             BIGINT       NOT NULL,
  key_name           VARCHAR(64)  NOT NULL COMMENT 'denormalized api_keys.name',
  model              VARCHAR(128) NOT NULL,
  status             VARCHAR(32)  NOT NULL COMMENT 'success|error|interrupted',
  prompt_tokens      INT          NULL,
  completion_tokens  INT          NULL,
  cached_tokens      INT          NULL,
  uncached_tokens    INT          NULL,
  revenue_li         BIGINT       NULL COMMENT 'revenue in li',
  cogs_li            BIGINT       NULL COMMENT 'cogs in li',
  margin_li          BIGINT       NULL COMMENT 'margin in li',
  latency_ms         INT          NULL,
  upstream_status    INT          NULL,
  error_summary      VARCHAR(512) NULL COMMENT 'summary only; no prompts',
  billing_status     VARCHAR(32)  NOT NULL DEFAULT 'pending'
                       COMMENT 'charged|skipped_no_usage|pending',
  created_at         DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (request_id),
  KEY idx_token_req_user_time (user_id, created_at),
  KEY idx_token_req_key_name_time (key_name, created_at),
  KEY idx_token_req_billing_time (billing_status, created_at),
  KEY idx_token_req_model_time (model, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin
  COMMENT='request metering; no prompt/completion bodies';

-- US-G0-09 placeholder seed prices (li per million tokens).
-- Ref USD (approx 2026-07-21 DeepSeek public card) × FX 7.2 CNY/USD × 1000 = li/MTok.
-- flash: miss $0.14 / hit $0.0028 / out $0.28 → COGS 1008 / 20 / 2016; sell 1200 / 2300 (placeholder margin).
-- pro:   miss $0.435 / hit $0.003625 / out $0.87 → COGS 3132 / 26 / 6264; sell 3600 / 7000.
-- NOT production final prices — ops must INSERT a new effective_from row after sample review.
INSERT INTO token_price_rules (
  model,
  input_price_li_per_mTok,
  output_price_li_per_mTok,
  upstream_input_cost_li_per_mTok,
  upstream_cache_cost_li_per_mTok,
  upstream_output_cost_li_per_mTok,
  effective_from,
  created_at
) VALUES
(
  'deepseek-v4-flash',
  1200,
  2300,
  1008,
  20,
  2016,
  '2020-01-01 00:00:00.000',
  UTC_TIMESTAMP(3)
),
(
  'deepseek-v4-pro',
  3600,
  7000,
  3132,
  26,
  6264,
  '2020-01-01 00:00:00.000',
  UTC_TIMESTAMP(3)
);
