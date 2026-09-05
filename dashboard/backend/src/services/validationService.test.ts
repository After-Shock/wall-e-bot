import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AutoModConfigSchema,
  GuildConfigSchema,
  LevelingConfigSchema,
  LoggingConfigSchema,
  ModerationConfigSchema,
} from './validationService.js';

test('section PATCH accepts an omitted top-level sibling', () => {
  const result = LevelingConfigSchema.safeParse({ roleRewards: [] });
  assert.equal(result.success, true);
});

test('section PATCH rejects an incomplete submitted nested object', () => {
  assert.equal(LevelingConfigSchema.safeParse({ xpPerMessage: { min: 10 } }).success, false);
  assert.equal(ModerationConfigSchema.safeParse({ warnThresholds: { kick: 3 } }).success, false);
  assert.equal(AutoModConfigSchema.safeParse({ antiSpam: { enabled: true } }).success, false);
  assert.equal(LoggingConfigSchema.safeParse({ events: { memberJoin: true } }).success, false);
});

test('legacy PATCH accepts partial module flags for atomic merging', () => {
  const result = GuildConfigSchema.safeParse({ modules: { welcome: true } });
  assert.equal(result.success, true);
  if (result.success) assert.deepEqual(result.data, { modules: { welcome: true } });
});

test('automod writes reject retired advanced options instead of stripping them', () => {
  const retiredOptions = {
    imageScanning: { enabled: true, scanForNsfw: true, scanForViolence: true, scanForGore: true, action: 'delete', threshold: 90 },
    linkSafety: { enabled: true, checkPhishing: true, checkMalware: true, checkIpLoggers: true, action: 'delete' },
    raidProtection: { enabled: true, joinThreshold: 10, accountAgeMinimum: 7, verificationLevel: 'high', action: 'ban' },
  } as const;
  for (const [retiredKey, value] of Object.entries(retiredOptions)) {
    const result = AutoModConfigSchema.safeParse({ [retiredKey]: value });
    assert.equal(result.success, false, `${retiredKey} must be rejected`);
  }
});

test('automod writes reject unsupported actions and mute without a positive duration', () => {
  const antiSpam = { enabled: true, maxMessages: 5, interval: 10 };
  const wordFilter = { enabled: true, words: ['blocked'] };

  assert.equal(AutoModConfigSchema.safeParse({ antiSpam: { ...antiSpam, action: 'kick' } }).success, false);
  assert.equal(AutoModConfigSchema.safeParse({ antiSpam: { ...antiSpam, action: 'ban' } }).success, false);
  assert.equal(AutoModConfigSchema.safeParse({ antiSpam: { ...antiSpam, action: 'mute' } }).success, false);
  assert.equal(AutoModConfigSchema.safeParse({ antiSpam: { ...antiSpam, action: 'mute', muteDuration: 0 } }).success, false);
  assert.equal(AutoModConfigSchema.safeParse({ wordFilter: { ...wordFilter, action: 'mute' } }).success, false);
  assert.equal(AutoModConfigSchema.safeParse({ linkFilter: { enabled: true, allowedDomains: [], action: 'mute' } }).success, false);
});

test('automod writes normalize valid allowed hosts and reject malformed entries', () => {
  const valid = AutoModConfigSchema.safeParse({
    linkFilter: { enabled: true, allowedDomains: [' Example.COM. ', 'Sub.Example.com'], action: 'delete' },
  });
  assert.equal(valid.success, true);
  if (valid.success) {
    assert.deepEqual(valid.data.linkFilter?.allowedDomains, ['example.com', 'sub.example.com']);
  }

  for (const malformed of [
    'https://example.com',
    'example.com/path',
    '*.example.com',
    'example.com:443',
    '-example.com',
    'example..com',
    '.',
  ]) {
    const result = AutoModConfigSchema.safeParse({
      linkFilter: { enabled: true, allowedDomains: [malformed], action: 'warn' },
    });
    assert.equal(result.success, false, `${malformed} must be rejected`);
  }
});

test('legacy writes reject retired starboard and advanced automod options', () => {
  assert.equal(GuildConfigSchema.safeParse({ starboard: { enabled: true, threshold: 3, emoji: '⭐', selfStar: false, ignoredChannels: [] } }).success, false);
  assert.equal(GuildConfigSchema.safeParse({ modules: { starboard: true } }).success, false);
  assert.equal(GuildConfigSchema.safeParse({ automod: { raidProtection: { enabled: true, joinThreshold: 10, accountAgeMinimum: 7, verificationLevel: 'high', action: 'ban' } } }).success, false);
});
