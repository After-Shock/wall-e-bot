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

describe('isSafeCustomCommandRegex — catastrophic backtracking', () => {
  it('rejects quantified alternation, the shape the original check missed', () => {
    // Each of these is exponential on a non-matching tail and would stall the
    // event loop for every guild this process serves.
    expect(isSafeCustomCommandRegex('(a|a)*$')).toBe(false);
    expect(isSafeCustomCommandRegex('(a|ab)*c')).toBe(false);
    expect(isSafeCustomCommandRegex('^(\\s|\\s\\s)+$')).toBe(false);
  });

  it('still rejects nested quantifiers and backreferences', () => {
    expect(isSafeCustomCommandRegex('(a+)+$')).toBe(false);
    expect(isSafeCustomCommandRegex('(\\w+)\\1')).toBe(false);
  });

  it('still accepts ordinary patterns', () => {
    expect(isSafeCustomCommandRegex('^hello\\s+world$')).toBe(true);
    expect(isSafeCustomCommandRegex('\\d{3}-\\d{4}')).toBe(true);
    expect(isSafeCustomCommandRegex('(cat|dog)')).toBe(true);
  });

  it('rejects patterns over the length cap and invalid syntax', () => {
    expect(isSafeCustomCommandRegex('a'.repeat(201))).toBe(false);
    expect(isSafeCustomCommandRegex('([unclosed')).toBe(false);
  });
});
