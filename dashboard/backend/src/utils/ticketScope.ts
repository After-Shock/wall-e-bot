/**
 * Ticket ownership guards.
 *
 * Ticket panels/categories/fields are addressed by their own serial IDs, which
 * are global — so every route that takes one from the URL must prove it belongs
 * to the guild in the URL. Most did this inline via a join; the form-field
 * create path did not, which let anyone who admins one guild write into another
 * guild's category. These helpers are the one place that check lives now.
 *
 * @module utils/ticketScope
 */

import { db } from '../db/index.js';

/**
 * Resolve a ticket category, but only if it belongs to `guildId`.
 * Returns null when it doesn't exist or belongs to another guild — callers
 * should treat both the same way (404), so ids aren't enumerable.
 */
export async function findCategoryInGuild(
  categoryId: string | number,
  guildId: string,
): Promise<Record<string, unknown> | null> {
  // categoryId comes from a URL segment: a non-numeric value makes Postgres
  // raise 22P02 rather than returning no rows, so reject it up front.
  if (!/^\d+$/.test(String(categoryId))) return null;

  const result = await db.query(
    `SELECT tc.* FROM ticket_categories tc
     JOIN ticket_panels tp ON tc.panel_id = tp.id
     WHERE tc.id = $1 AND tp.guild_id = $2`,
    [categoryId, guildId],
  );
  return result.rows[0] ?? null;
}
