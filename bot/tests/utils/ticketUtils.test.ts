import { describe, it, expect } from '@jest/globals';
import { resolveChannelName, buildTranscript } from '../../src/utils/ticketUtils.js';

describe('resolveChannelName', () => {
  it('replaces {type} with lowercased hyphenated category name', () => {
    const result = resolveChannelName('{type}-{number}', {
      type: 'General Support',
      number: 1,
      username: 'testuser',
      userid: '123',
    });
    expect(result).toBe('general-support-0001');
  });

  it('replaces {number} zero-padded to 4 digits', () => {
    const result = resolveChannelName('ticket-{number}', {
      type: 'support',
      number: 42,
      username: 'user',
      userid: '456',
    });
    expect(result).toBe('ticket-0042');
  });

  it('replaces {username} lowercased and sanitized', () => {
    const result = resolveChannelName('{username}-ticket', {
      type: 'support',
      number: 1,
      username: 'JohnDoe',
      userid: '789',
    });
    expect(result).toBe('johndoe-ticket');
  });

  it('replaces {userid}', () => {
    const result = resolveChannelName('{userid}-support', {
      type: 'support',
      number: 1,
      username: 'user',
      userid: '999',
    });
    expect(result).toBe('999-support');
  });

  it('truncates result to 100 characters', () => {
    const result = resolveChannelName('{type}-{number}', {
      type: 'a'.repeat(200),
      number: 1,
      username: 'user',
      userid: '1',
    });
    expect(result.length).toBeLessThanOrEqual(100);
  });

  it('sanitizes special characters for Discord channel names', () => {
    const result = resolveChannelName('{username}-ticket', {
      type: 'support',
      number: 1,
      username: 'John Doe!',
      userid: '1',
    });
    expect(result).toBe('john-doe-ticket');
  });
});

describe('buildTranscript', () => {
  it('generates header with ticket info', () => {
    const messages = [
      {
        author: { tag: 'User#1234' },
        content: 'Hello',
        createdAt: new Date('2026-01-01'),
        attachments: { size: 0, map: () => [] },
      },
    ];
    const result = buildTranscript('ticket-0001', 'user-123', new Date('2026-01-01'), messages as any);
    expect(result).toContain('Ticket Transcript - ticket-0001');
    expect(result).toContain('user-123');
  });

  it('includes all messages in chronological order', () => {
    const messages = [
      { author: { tag: 'User#1' }, content: 'First', createdAt: new Date('2026-01-01T10:00:00Z'), attachments: { size: 0, map: () => [] } },
      { author: { tag: 'Staff#2' }, content: 'Second', createdAt: new Date('2026-01-01T10:05:00Z'), attachments: { size: 0, map: () => [] } },
    ];
    const result = buildTranscript('ticket-0001', 'u1', new Date(), messages as any);
    const firstIdx = result.indexOf('First');
    const secondIdx = result.indexOf('Second');
    expect(firstIdx).toBeLessThan(secondIdx);
  });

  it('includes attachment URLs', () => {
    const messages = [
      {
        author: { tag: 'User#1' },
        content: 'See attached',
        createdAt: new Date(),
        attachments: {
          size: 1,
          map: (fn: any) => [fn({ url: 'https://cdn.discord.com/file.png' })],
        },
      },
    ];
    const result = buildTranscript('ticket-0001', 'u1', new Date(), messages as any);
    expect(result).toContain('https://cdn.discord.com/file.png');
  });
});
