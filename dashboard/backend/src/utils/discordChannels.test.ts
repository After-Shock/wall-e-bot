import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  categoryError, channelError, isChannelPermissionError, CATEGORY_NOT_VISIBLE, CHANNEL_NOT_VISIBLE, NOT_A_CATEGORY,
} from './discordChannels.js';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const respond = (status: number, body: unknown = {}) => {
  globalThis.fetch = (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;
};

test('channelError accepts a visible channel in the same guild', async () => {
  respond(200, { guild_id: 'guild-1' });
  assert.equal(await channelError('chan', 'guild-1'), null);
});

test('channelError explains a channel the bot cannot see', async () => {
  respond(403, { message: 'Missing Access', code: 50001 });
  assert.equal(await channelError('chan', 'guild-1'), CHANNEL_NOT_VISIBLE);
});

test('channelError rejects a channel from another guild or an unknown channel', async () => {
  respond(200, { guild_id: 'other-guild' });
  assert.equal(await channelError('chan', 'guild-1'), 'Invalid channel');
  respond(404);
  assert.equal(await channelError('chan', 'guild-1'), 'Invalid channel');
});

test('categoryError accepts only visible categories in the same guild', async () => {
  respond(200, { guild_id: 'guild-1', type: 4 });
  assert.equal(await categoryError('12345678901234567', 'guild-1'), null);
  respond(200, { guild_id: 'guild-1', type: 0 });
  assert.equal(await categoryError('12345678901234567', 'guild-1'), NOT_A_CATEGORY);
  respond(403, { message: 'Missing Access', code: 50001 });
  assert.equal(await categoryError('12345678901234567', 'guild-1'), CATEGORY_NOT_VISIBLE);
  assert.equal(await categoryError('not-an-id', 'guild-1'), NOT_A_CATEGORY);
});

test('isChannelPermissionError recognises Missing Access and Missing Permissions only', () => {
  assert.equal(isChannelPermissionError('{"message": "Missing Permissions", "code": 50013}'), true);
  assert.equal(isChannelPermissionError('{"message": "Missing Access", "code": 50001}'), true);
  assert.equal(isChannelPermissionError('{"message": "Cannot edit a message authored by another user", "code": 50005}'), false);
  assert.equal(isChannelPermissionError('not json'), false);
});
