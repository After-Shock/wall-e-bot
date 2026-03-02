import { stripServerIds } from '@wall-e/shared';

describe('stripServerIds', () => {
  it('nulls top-level channelId and roleId keys', () => {
    const config = {
      channelId: '111',
      muteRoleId: '222',
      prefix: '!',
    };
    const result = stripServerIds(config);
    expect(result.channelId).toBeNull();
    expect(result.muteRoleId).toBeNull();
    expect(result.prefix).toBe('!');
  });

  it('nulls nested channelId and roleId keys', () => {
    const config = {
      moderation: {
        modLogChannelId: '333',
        muteRoleId: '444',
        autoDeleteModCommands: true,
      },
      welcome: {
        channelId: '555',
        message: 'Hello!',
      },
    };
    const result = stripServerIds(config);
    expect(result.moderation.modLogChannelId).toBeNull();
    expect(result.moderation.muteRoleId).toBeNull();
    expect(result.moderation.autoDeleteModCommands).toBe(true);
    expect(result.welcome.channelId).toBeNull();
    expect(result.welcome.message).toBe('Hello!');
  });

  it('handles arrays by processing each element', () => {
    const config = {
      roles: [{ roleId: '777', name: 'Admin' }],
    };
    const result = stripServerIds(config);
    expect(result.roles[0].roleId).toBeNull();
    expect(result.roles[0].name).toBe('Admin');
  });

  it('returns a new object without mutating the original', () => {
    const config = { channelId: '111' };
    const result = stripServerIds(config);
    expect(config.channelId).toBe('111'); // original unchanged
    expect(result.channelId).toBeNull();
  });

  it('handles null and undefined values gracefully', () => {
    const config = { channelId: null, roleId: undefined, prefix: '!' };
    const result = stripServerIds(config as any);
    expect(result.prefix).toBe('!');
    expect(result.channelId).toBeNull();  // already null → stays null
    expect(result.roleId).toBeNull();     // undefined → nulled (matched by pattern)
  });
});
