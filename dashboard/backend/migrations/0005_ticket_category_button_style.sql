-- 0005_ticket_category_button_style
-- Panel button colour per category: primary (blue), success (green), secondary (grey), danger (red).
ALTER TABLE ticket_categories ADD COLUMN IF NOT EXISTS button_style VARCHAR(10) NOT NULL DEFAULT 'primary';
