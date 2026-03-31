-- 添加 content 列，用于直接存储文件内容（不再使用 R2）
ALTER TABLE files ADD COLUMN content TEXT NOT NULL DEFAULT '';
