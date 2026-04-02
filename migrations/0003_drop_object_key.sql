-- 删除已废弃的 object_key 列（原 R2 用途，现已改为直接存入 D1）
ALTER TABLE files DROP COLUMN object_key;
