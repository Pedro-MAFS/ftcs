-- US-G0-10: ShedLock JDBC table (scheduler distributed lock).

CREATE TABLE token_shedlock (
  name       VARCHAR(64)  NOT NULL,
  lock_until TIMESTAMP(3) NOT NULL,
  locked_at  TIMESTAMP(3) NOT NULL,
  locked_by  VARCHAR(255) NOT NULL,
  PRIMARY KEY (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin
  COMMENT='ShedLock; settlement scheduler mutual exclusion';
