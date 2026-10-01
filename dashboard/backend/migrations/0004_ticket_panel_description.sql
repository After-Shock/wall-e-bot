-- 0004_ticket_panel_description
-- Instructions shown under the panel title (e.g. which button to pick).
ALTER TABLE ticket_panels ADD COLUMN IF NOT EXISTS description TEXT;
