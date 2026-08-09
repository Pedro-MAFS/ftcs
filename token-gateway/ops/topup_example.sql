-- 【应急】人工充值示例（厘）：10 元 = 10000 厘
-- 日常请走管理端 US-G6-07：POST /admin/v1/users/{id}/adjustments（/ops/topups）。
-- 仅在 admin 不可用时手工执行；将 @user_id 换成 token_users.id；operator/note 必填。
-- 禁止只改 balance_li 不写流水。详见 US-G0-02 §7 / 需求 §8.3 / US-G6-07。

START TRANSACTION;

UPDATE token_users
   SET balance_li = balance_li + 10000,
       updated_at = UTC_TIMESTAMP(3)
 WHERE id = @user_id;

INSERT INTO token_ledger_entries (
  user_id, type, amount_li, balance_after_li, note, operator, created_at
)
SELECT id, 'topup', 10000, balance_li, 'manual topup 10 CNY', 'ops:replace_me', UTC_TIMESTAMP(3)
  FROM token_users
 WHERE id = @user_id;

COMMIT;
