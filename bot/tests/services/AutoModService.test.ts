import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { AutoModConfig } from '@wall-e/shared';
import { AutoModService } from '../../src/services/AutoModService.js';
import { logger } from '../../src/utils/logger.js';

const warnLog = jest.spyOn(logger, 'warn').mockImplementation(() => logger);

const baseConfig = (): AutoModConfig => ({
  enabled: true,
  antiSpam: { enabled: false, maxMessages: 5, interval: 10, action: 'warn' },
  wordFilter: { enabled: false, words: [], action: 'delete' },
  linkFilter: { enabled: false, allowedDomains: [], action: 'delete' },
  capsFilter: { enabled: false, threshold: 70, minLength: 10, action: 'delete' },
  ignoredChannels: [],
  ignoredRoles: [],
});

const buildFixture = (config: AutoModConfig, content = 'hello') => {
  const deleteMessage = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const warn = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const timeout = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const incrementSpamTracker = jest.fn<() => Promise<number>>().mockResolvedValue(0);
  const client = {
    cache: {
      getGuildConfig: jest.fn<() => Promise<unknown>>().mockResolvedValue({ automod: config }),
      setGuildConfig: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      incrementSpamTracker,
    },
    db: {
      getGuildConfig: jest.fn<() => Promise<unknown>>().mockResolvedValue({ moderation: {} }),
    },
    moderation: { warn, timeout },
  };
  const member = { roles: { cache: new Map() } };
  const channel = { id: 'channel-1', toString: () => '#general' };
  const guild = {
    id: 'guild-1',
    members: { me: { id: 'bot-1' } },
    channels: { cache: new Map() },
  };
  const message = {
    content,
    author: { id: 'user-1', bot: false, toString: () => '<@user-1>' },
    member,
    channel,
    guild,
    delete: deleteMessage,
  };

  // These are intentionally narrow Discord/client fakes: no live API or DB calls.
  const service = new AutoModService(client as never);
  return { service, message, deleteMessage, warn, timeout, incrementSpamTracker };
};

describe('AutoModService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    ['exact host', 'https://example.com/path'],
    ['subdomain', 'https://docs.example.com/path'],
    ['mixed-case host and normalized legacy allowlist', 'https://DoCs.Example.COM/path'],
  ])('allows an approved %s', async (_label, content) => {
    const config = baseConfig();
    config.linkFilter = { enabled: true, allowedDomains: [' Example.COM. '], action: 'delete' };
    const fixture = buildFixture(config, content);

    await expect(fixture.service.handleMessage(fixture.message as never)).resolves.toBe(false);
    expect(fixture.deleteMessage).not.toHaveBeenCalled();
  });

  it('blocks a suffix impostor host', async () => {
    const config = baseConfig();
    config.linkFilter = { enabled: true, allowedDomains: ['example.com'], action: 'delete' };
    const fixture = buildFixture(config, 'https://notexample.com/path');

    await expect(fixture.service.handleMessage(fixture.message as never)).resolves.toBe(true);
    expect(fixture.deleteMessage).toHaveBeenCalledTimes(1);
  });

  it('ignores malformed persisted allowlist entries and honors a later valid host', async () => {
    const config = baseConfig();
    config.linkFilter = {
      enabled: true,
      allowedDomains: [null, 42, ' Example.COM. '] as never,
      action: 'delete',
    };
    const fixture = buildFixture(config, 'https://example.com/path');

    await expect(fixture.service.handleMessage(fixture.message as never)).resolves.toBe(false);
    expect(fixture.deleteMessage).not.toHaveBeenCalled();
  });

  it('does not let malformed persisted allowlist entries approve a host', async () => {
    const config = baseConfig();
    config.linkFilter = {
      enabled: true,
      allowedDomains: ['https://example.com', null, 42] as never,
      action: 'delete',
    };
    const fixture = buildFixture(config, 'https://example.com/path');

    await expect(fixture.service.handleMessage(fixture.message as never)).resolves.toBe(true);
    expect(fixture.deleteMessage).toHaveBeenCalledTimes(1);
  });

  it('uses first-match order and applies only one punishment', async () => {
    const config = baseConfig();
    config.antiSpam = { enabled: true, maxMessages: 1, interval: 10, action: 'warn' };
    config.wordFilter = { enabled: true, words: ['blocked'], action: 'warn' };
    const fixture = buildFixture(config, 'blocked');
    fixture.incrementSpamTracker.mockResolvedValue(2);

    await expect(fixture.service.handleMessage(fixture.message as never)).resolves.toBe(true);
    expect(fixture.deleteMessage).toHaveBeenCalledTimes(1);
    expect(fixture.warn).toHaveBeenCalledTimes(1);
  });

  it.each(['kick', 'ban'])('logs and safely skips legacy anti-spam action %s', async action => {
    const config = baseConfig();
    config.antiSpam = { enabled: true, maxMessages: 1, interval: 10, action } as never;
    const fixture = buildFixture(config);
    fixture.incrementSpamTracker.mockResolvedValue(2);

    await expect(fixture.service.handleMessage(fixture.message as never)).resolves.toBe(false);
    expect(fixture.deleteMessage).not.toHaveBeenCalled();
    expect(fixture.warn).not.toHaveBeenCalled();
    expect(fixture.timeout).not.toHaveBeenCalled();
    expect(warnLog).toHaveBeenCalledWith(expect.stringContaining(`unsupported action "${action}"`));
  });

  it.each(['kick', 'ban'])('continues to a valid word action after skipped legacy spam action %s', async action => {
    const config = baseConfig();
    config.antiSpam = { enabled: true, maxMessages: 1, interval: 10, action } as never;
    config.wordFilter = { enabled: true, words: ['blocked'], action: 'warn' };
    const fixture = buildFixture(config, 'blocked');
    fixture.incrementSpamTracker.mockResolvedValue(2);

    await expect(fixture.service.handleMessage(fixture.message as never)).resolves.toBe(true);
    expect(fixture.deleteMessage).toHaveBeenCalledTimes(1);
    expect(fixture.warn).toHaveBeenCalledTimes(1);
    expect(fixture.timeout).not.toHaveBeenCalled();
  });

  it('logs and safely skips mute when its duration is unusable', async () => {
    const config = baseConfig();
    config.wordFilter = { enabled: true, words: ['blocked'], action: 'mute' };
    const fixture = buildFixture(config, 'blocked');

    await expect(fixture.service.handleMessage(fixture.message as never)).resolves.toBe(false);
    expect(fixture.deleteMessage).not.toHaveBeenCalled();
    expect(fixture.timeout).not.toHaveBeenCalled();
    expect(warnLog).toHaveBeenCalledWith(expect.stringContaining('positive mute duration'));
  });

  it('retains delete behavior', async () => {
    const deleteConfig = baseConfig();
    deleteConfig.wordFilter = { enabled: true, words: ['blocked'], action: 'delete' };
    const deleted = buildFixture(deleteConfig, 'blocked');
    await deleted.service.handleMessage(deleted.message as never);
    expect(deleted.deleteMessage).toHaveBeenCalledTimes(1);
  });

  it('retains warn behavior', async () => {
    const warnConfig = baseConfig();
    warnConfig.wordFilter = { enabled: true, words: ['blocked'], action: 'warn' };
    const warned = buildFixture(warnConfig, 'blocked');
    await warned.service.handleMessage(warned.message as never);
    expect(warned.deleteMessage).toHaveBeenCalledTimes(1);
    expect(warned.warn).toHaveBeenCalledTimes(1);
  });

  it('retains timed mute behavior', async () => {
    const muteConfig = baseConfig();
    muteConfig.wordFilter = { enabled: true, words: ['blocked'], action: 'mute', muteDuration: 15 };
    const muted = buildFixture(muteConfig, 'blocked');
    await muted.service.handleMessage(muted.message as never);
    expect(muted.deleteMessage).toHaveBeenCalledTimes(1);
    expect(muted.timeout).toHaveBeenCalledWith(
      muted.message.guild,
      muted.message.member,
      muted.message.guild.members.me,
      15 * 60 * 1000,
      '[AutoMod] Blocked word detected',
    );
  });
});
