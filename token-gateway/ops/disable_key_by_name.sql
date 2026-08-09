-- 按客户端 name 禁用 Key（不影响同用户其它 name）
-- 日常请走管理端 US-G6-05（PATCH /admin/v1/users/{id}/keys/{name}/status）；本脚本仅应急。
-- 先查：SELECT id, user_id, name, status FROM token_api_keys WHERE name = 'ftcs-desktop';

UPDATE token_api_keys
   SET status = 'disabled',
       updated_at = UTC_TIMESTAMP(3)
 WHERE user_id = @user_id
   AND name = @key_name;
