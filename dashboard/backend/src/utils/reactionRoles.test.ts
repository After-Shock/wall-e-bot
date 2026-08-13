import { test } from 'node:test';
import assert from 'node:assert';
import { buildReactionRoleMessage, reactionRoleBody, parseEmoji } from './reactionRoles.js';

const base = { title: 'Pick roles', description: 'go', color: '#5865F2', type: 'buttons' };
const role = (n: number) => ({ role_id: `${100000000000000000 + n}`, emoji: `e${n}`, label: `Role ${n}` });

test('buttons chunk into rows of 5 with rr_<roleId> custom ids', () => {
  const roles = Array.from({ length: 12 }, (_, i) => role(i));
  const msg = buildReactionRoleMessage(base, roles);

  assert.deepStrictEqual(msg.components.map(r => (r.components as unknown[]).length), [5, 5, 2]);
  const first = (msg.components[0].components as { custom_id: string }[])[0];
  assert.strictEqual(first.custom_id, `rr_${roles[0].role_id}`);
  assert.strictEqual(msg.embeds[0].color, 0x5865f2);
});

test('dropdown is one row with rr_select and every role as an option', () => {
  const roles = [role(1), role(2), role(3)];
  const msg = buildReactionRoleMessage({ ...base, type: 'dropdown' }, roles);

  assert.strictEqual(msg.components.length, 1);
  const select = (msg.components[0].components as {
    custom_id: string; max_values: number; options: { value: string }[];
  }[])[0];
  assert.strictEqual(select.custom_id, 'rr_select');
  assert.strictEqual(select.max_values, 3);
  assert.deepStrictEqual(select.options.map(o => o.value), roles.map(r => r.role_id));
});

test('duplicate emoji is rejected — the DB has UNIQUE(message_id, emoji)', () => {
  const dup = { ...role(1), emoji: 'same' };
  const result = reactionRoleBody.safeParse({
    ...base, channel_id: '123456789012345678',
    roles: [dup, { ...role(2), emoji: 'same' }],
  });
  assert.strictEqual(result.success, false);
});

test('custom and animated emoji become {id, name, animated}, unicode stays {name}', () => {
  assert.deepStrictEqual(parseEmoji('🎮'), { name: '🎮' });
  assert.deepStrictEqual(parseEmoji('<:pepe:123456789012345678>'), {
    id: '123456789012345678', name: 'pepe', animated: false,
  });
  assert.deepStrictEqual(parseEmoji('<a:blob:123456789012345678>'), {
    id: '123456789012345678', name: 'blob', animated: true,
  });
  // Not a real emoji tag — must not be mistaken for one
  assert.deepStrictEqual(parseEmoji('<:broken:>'), { name: '<:broken:>' });
});

test('a button carries the parsed custom emoji through to the payload', () => {
  const msg = buildReactionRoleMessage(base, [
    { role_id: '100000000000000001', emoji: '<a:blob:123456789012345678>', label: 'Blob' },
  ]);
  const button = (msg.components[0].components as { emoji: object }[])[0];
  assert.deepStrictEqual(button.emoji, { id: '123456789012345678', name: 'blob', animated: true });
});

test('valid payload parses and applies defaults', () => {
  const result = reactionRoleBody.safeParse({
    channel_id: '123456789012345678', title: 'Roles', roles: [role(1)],
  });
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.data!.type, 'buttons');
  assert.strictEqual(result.data!.color, '#5865F2');
});
