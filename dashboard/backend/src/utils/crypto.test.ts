import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

process.env.TOKEN_ENCRYPTION_KEY = 'a'.repeat(64); // 32-byte hex key

const { encryptToken, decryptToken } = await import('./crypto.js');

describe('crypto helpers', () => {
  it('round-trips plaintext through encrypt/decrypt', () => {
    const original = 'my-discord-access-token-abc123';
    const encrypted = encryptToken(original);
    assert.equal(decryptToken(encrypted), original);
  });

  it('encrypted value differs from plaintext', () => {
    const token = 'my-discord-access-token-abc123';
    assert.notEqual(encryptToken(token), token);
  });

  it('each encryption produces a different ciphertext (random IV)', () => {
    const token = 'same-token';
    assert.notEqual(encryptToken(token), encryptToken(token));
  });

  it('decryptToken returns null for invalid ciphertext', () => {
    assert.equal(decryptToken('garbage:data:here'), null);
  });

  it('decryptToken returns null for plaintext (migration guard)', () => {
    assert.equal(decryptToken('plaintext-token-no-colons'), null);
  });
});
