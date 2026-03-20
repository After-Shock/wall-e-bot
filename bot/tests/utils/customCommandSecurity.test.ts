import { describe, expect, it } from '@jest/globals';
import {
  canExecuteCustomCommand,
  isSafeCustomCommandRegex,
} from '@wall-e/shared';

describe('canExecuteCustomCommand', () => {
  it('allows commands with no role or channel restrictions', () => {
    expect(canExecuteCustomCommand({
      allowedChannels: [],
      allowedRoles: [],
      channelId: '123',
      memberRoleIds: ['999'],
    })).toBe(true);
  });

  it('rejects commands outside allowed channels', () => {
    expect(canExecuteCustomCommand({
      allowedChannels: ['555'],
      allowedRoles: [],
      channelId: '123',
      memberRoleIds: ['999'],
    })).toBe(false);
  });

  it('rejects commands when the member lacks every allowed role', () => {
    expect(canExecuteCustomCommand({
      allowedChannels: [],
      allowedRoles: ['111', '222'],
      channelId: '123',
      memberRoleIds: ['999'],
    })).toBe(false);
  });

  it('allows commands when the member has an allowed role in an allowed channel', () => {
    expect(canExecuteCustomCommand({
      allowedChannels: ['123'],
      allowedRoles: ['111', '222'],
      channelId: '123',
      memberRoleIds: ['999', '222'],
    })).toBe(true);
  });
});

describe('isSafeCustomCommandRegex', () => {
  it('accepts a simple anchored pattern', () => {
    expect(isSafeCustomCommandRegex('^hello (world|there)$')).toBe(true);
  });

  it('rejects nested quantifiers that are prone to catastrophic backtracking', () => {
    expect(isSafeCustomCommandRegex('(a+)+$')).toBe(false);
  });

  it('rejects backreferences', () => {
    expect(isSafeCustomCommandRegex('^(a+)\\1$')).toBe(false);
  });

  it('rejects very long patterns', () => {
    expect(isSafeCustomCommandRegex('a'.repeat(300))).toBe(false);
  });
});
