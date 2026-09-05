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
