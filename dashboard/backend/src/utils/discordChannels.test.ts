import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { channelError, CHANNEL_NOT_VISIBLE } from './discordChannels.js';

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
