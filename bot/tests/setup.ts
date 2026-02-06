/**
 * Jest Test Setup
 * 
 * Global mocks and test utilities loaded before each test file.
 */

import { jest } from '@jest/globals';

// Mock environment variables
process.env.DISCORD_TOKEN = 'test-token';
process.env.DISCORD_CLIENT_ID = 'test-client-id';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.NODE_ENV = 'test';

// Mock winston logger to suppress output during tests
jest.mock('../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Global test utilities
declare global {
  // eslint-disable-next-line no-var
  var testUtils: {
    createMockGuild: (overrides?: Partial<MockGuild>) => MockGuild;
    createMockUser: (overrides?: Partial<MockUser>) => MockUser;
    createMockChannel: (overrides?: Partial<MockChannel>) => MockChannel;
    createMockInteraction: (overrides?: Partial<MockInteraction>) => MockInteraction;
  };
}

interface MockGuild {
  id: string;
  name: string;
  memberCount: number;
  ownerId: string;
  channels: { cache: Map<string, MockChannel> };
  members: { cache: Map<string, MockUser>; fetch: jest.Mock };
  roles: { cache: Map<string, MockRole> };
}

interface MockUser {
  id: string;
  username: string;
  discriminator: string;
  bot: boolean;
  roles: { cache: Map<string, MockRole>; add: jest.Mock; remove: jest.Mock };
}

interface MockChannel {
  id: string;
  name: string;
  type: number;
  send: jest.Mock;
  delete: jest.Mock;
}

interface MockRole {
  id: string;
  name: string;
  position: number;
}

interface MockInteraction {
  guildId: string;
  guild: MockGuild;
  user: MockUser;
  member: MockUser;
  channelId: string;
  channel: MockChannel;
  reply: jest.Mock;
  deferReply: jest.Mock;
  editReply: jest.Mock;
  followUp: jest.Mock;
  options: {
    getString: jest.Mock;
    getInteger: jest.Mock;
    getBoolean: jest.Mock;
    getUser: jest.Mock;
    getChannel: jest.Mock;
    getRole: jest.Mock;
    getSubcommand: jest.Mock;
  };
}

globalThis.testUtils = {
  createMockGuild: (overrides = {}) => ({
    id: '123456789012345678',
    name: 'Test Server',
    memberCount: 100,
    ownerId: '987654321098765432',
    channels: { cache: new Map() },
    members: { cache: new Map(), fetch: jest.fn() },
    roles: { cache: new Map() },
    ...overrides,
  }),

  createMockUser: (overrides = {}) => ({
    id: '111222333444555666',
    username: 'TestUser',
    discriminator: '0001',
    bot: false,
    roles: {
      cache: new Map(),
      add: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined),
    },
    ...overrides,
  }),

  createMockChannel: (overrides = {}) => ({
    id: '999888777666555444',
    name: 'test-channel',
    type: 0, // GuildText
    send: jest.fn().mockResolvedValue({ id: 'msg-123' }),
    delete: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  }),

  createMockInteraction: (overrides = {}) => {
    const guild = globalThis.testUtils.createMockGuild();
    const user = globalThis.testUtils.createMockUser();
    const channel = globalThis.testUtils.createMockChannel();

    return {
      guildId: guild.id,
      guild,
      user,
      member: user,
      channelId: channel.id,
      channel,
      reply: jest.fn().mockResolvedValue(undefined),
      deferReply: jest.fn().mockResolvedValue(undefined),
      editReply: jest.fn().mockResolvedValue(undefined),
      followUp: jest.fn().mockResolvedValue(undefined),
      options: {
        getString: jest.fn(),
        getInteger: jest.fn(),
        getBoolean: jest.fn(),
        getUser: jest.fn(),
        getChannel: jest.fn(),
        getRole: jest.fn(),
        getSubcommand: jest.fn(),
      },
      ...overrides,
    };
  },
};

// Increase timeout for async operations
jest.setTimeout(10000);
