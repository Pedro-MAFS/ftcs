-- US-G0-10: multi-instance claim columns, settle_failed comment, ledger request_id unique.

ALTER TABLE token_request_logs
  ADD COLUMN settle_owner VARCHAR(64) NULL COMMENT 'settlement worker id' AFTER billing_status,
  ADD COLUMN settle_claimed_at DATETIME(3) NULL COMMENT 'claim time UTC' AFTER settle_owner;

ALTER TABLE token_request_logs
  MODIFY COLUMN billing_status VARCHAR(32) NOT NULL DEFAULT 'pending'
    COMMENT 'pending|settling|charged|skipped_no_usage|settle_failed';

ALTER TABLE token_ledger_entries
  ADD UNIQUE KEY uk_token_ledger_request_id (request_id);
