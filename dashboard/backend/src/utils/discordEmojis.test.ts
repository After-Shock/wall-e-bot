import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCustomEmojis } from './discordEmojis.js';

const emojis = [{ id: '111', name: 'sullyflix', animated: false }, { id: '222', name: 'dance', animated: true }];

test('turns server emoji shortcodes into Discord emoji codes', () => {
  assert.equal(resolveCustomEmojis('Hi :sullyflix: and :dance:!', emojis), 'Hi <:sullyflix:111> and <a:dance:222>!');
});

test('leaves existing codes, unknown names and times alone', () => {
  assert.equal(resolveCustomEmojis('<:sullyflix:111> <a:dance:222>', emojis), '<:sullyflix:111> <a:dance:222>');
  assert.equal(resolveCustomEmojis(':eggplant: at 10:30:45', emojis), ':eggplant: at 10:30:45');
});
