import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertValidSessionSecret,
  isSafeExternalImageUrl,
  isSafeDiscordOAuthRedirect,
} from './security.js';

test('assertValidSessionSecret accepts a strong secret', () => {
  assert.doesNotThrow(() => {
    assertValidSessionSecret('a'.repeat(32));
  });
});

test('assertValidSessionSecret rejects a missing secret', () => {
  assert.throws(() => {
    assertValidSessionSecret(undefined);
  }, /SESSION_SECRET/);
});

test('assertValidSessionSecret rejects a short secret', () => {
  assert.throws(() => {
    assertValidSessionSecret('short-secret');
  }, /SESSION_SECRET/);
});

test('isSafeExternalImageUrl accepts a normal HTTPS CDN URL', () => {
  assert.equal(
    isSafeExternalImageUrl('https://images.example.com/avatar.png'),
    true,
  );
});

test('isSafeExternalImageUrl rejects localhost URLs', () => {
  assert.equal(
    isSafeExternalImageUrl('http://127.0.0.1:8080/private.png'),
    false,
  );
});

test('isSafeExternalImageUrl rejects private network hostnames', () => {
  assert.equal(
    isSafeExternalImageUrl('https://internal.service.local/avatar.png'),
    false,
  );
});

test('isSafeExternalImageUrl rejects private IPv4 ranges', () => {
  assert.equal(
    isSafeExternalImageUrl('http://192.168.1.10/avatar.png'),
    false,
  );
});

test('isSafeDiscordOAuthRedirect accepts same-origin dashboard redirects', () => {
  assert.equal(
    isSafeDiscordOAuthRedirect('https://dashboard.example.com', '/dashboard'),
    true,
  );
});

test('isSafeDiscordOAuthRedirect rejects cross-origin redirects', () => {
  assert.equal(
    isSafeDiscordOAuthRedirect('https://dashboard.example.com', 'https://evil.example/phish'),
    false,
  );
});
