import { z } from 'zod';

const SNOWFLAKE = /^\d{17,20}$/;

export const reactionRoleBody = z.object({
  channel_id: z.string().regex(SNOWFLAKE),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000).default(''),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#5865F2'),
  type: z.enum(['buttons', 'dropdown']).default('buttons'),
  roles: z.array(z.object({
    role_id: z.string().regex(SNOWFLAKE),
    // reaction_roles has UNIQUE(message_id, emoji), so emoji is required and distinct
    emoji: z.string().trim().min(1, 'Every role needs an emoji').max(100),
    label: z.string().trim().min(1).max(80),
  })).min(1).max(25),
}).refine(
  b => new Set(b.roles.map(r => r.emoji)).size === b.roles.length,
  { message: 'Each role needs a different emoji' },
).refine(
  b => new Set(b.roles.map(r => r.role_id)).size === b.roles.length,
  { message: 'The same role is listed twice' },
);

export type ReactionRoleEntry = { role_id: string; emoji: string; label: string };

/**
 * Discord wants `{ name }` for unicode emoji but `{ id, name, animated }` for
 * custom ones. Users paste custom emoji in their message form: <:name:id> or
 * <a:name:id> when animated.
 */
export function parseEmoji(raw: string): { id?: string; name: string; animated?: boolean } {
  const custom = /^<(a?):([\w~]+):(\d{17,20})>$/.exec(raw.trim());
  if (!custom) return { name: raw.trim() };
  return { id: custom[3], name: custom[2], animated: custom[1] === 'a' };
}

/**
 * Builds the Discord message payload. custom_ids match what the bot's
 * buttonInteraction handler already listens for: `rr_<roleId>` and `rr_select`.
 */
export function buildReactionRoleMessage(
  body: { title: string; description: string; color: string; type: string },
  roles: ReactionRoleEntry[],
) {
  const embed = {
    title: body.title,
    description: body.description || undefined,
    color: parseInt(body.color.slice(1), 16),
  };

  if (body.type === 'dropdown') {
    return {
      embeds: [embed],
      components: [{
        type: 1,
        components: [{
          type: 3,
          custom_id: 'rr_select',
          placeholder: 'Select roles...',
          min_values: 0,
          max_values: roles.length,
          options: roles.map(r => ({
            label: r.label,
            value: r.role_id,
            emoji: parseEmoji(r.emoji),
          })),
        }],
      }],
    };
  }

  // Buttons: 5 per action row, 5 rows max — hence the 25 role cap above.
  const rows = [];
  for (let i = 0; i < roles.length; i += 5) {
    rows.push({
      type: 1,
      components: roles.slice(i, i + 5).map(r => ({
        type: 2,
        style: 2,
        label: r.label,
        custom_id: `rr_${r.role_id}`,
        emoji: parseEmoji(r.emoji),
      })),
    });
  }
  return { embeds: [embed], components: rows };
}
