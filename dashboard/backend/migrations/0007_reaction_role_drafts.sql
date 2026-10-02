-- 0007_reaction_role_drafts
-- A draft is a reaction role message saved but not yet posted: no channel or
-- message yet, and its roles live in draft_roles until it is posted (posted
-- messages keep their roles in reaction_roles, keyed by Discord message).
ALTER TABLE reaction_role_messages ALTER COLUMN channel_id DROP NOT NULL;
ALTER TABLE reaction_role_messages ALTER COLUMN message_id DROP NOT NULL;
ALTER TABLE reaction_role_messages ADD COLUMN IF NOT EXISTS draft_roles JSONB;
