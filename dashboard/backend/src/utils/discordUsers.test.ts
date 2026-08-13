import { test } from 'node:test';
import assert from 'node:assert';
import { avatarUrl } from './discordUsers.js';

test('custom avatar uses png, animated uses gif', () => {
  assert.match(avatarUrl('123', 'abcdef'), /\/avatars\/123\/abcdef\.png\?size=64$/);
  assert.match(avatarUrl('123', 'a_beef'), /\/avatars\/123\/a_beef\.gif\?size=64$/);
});

test('no avatar falls back to a default index in 0..5 via (id >> 22) % 6', () => {
  // 4194304 = 1 << 22, so (id >> 22) = 1 -> index 1
  assert.strictEqual(avatarUrl('4194304', null), 'https://cdn.discordapp.com/embed/avatars/1.png');
  const url = avatarUrl('999999999999999999', null);
  const idx = Number(url.match(/avatars\/(\d)\.png$/)![1]);
  assert.ok(idx >= 0 && idx <= 5);
});
