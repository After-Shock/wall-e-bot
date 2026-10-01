-- 0003_widen_ticket_category_emoji
-- Custom emoji are stored as <a:name:id>, far longer than the old 10 characters.
ALTER TABLE ticket_categories ALTER COLUMN emoji TYPE VARCHAR(100);
