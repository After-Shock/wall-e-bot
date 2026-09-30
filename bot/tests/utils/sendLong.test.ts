import { describe, expect, it, jest } from '@jest/globals';
import { CUSTOM_COMMAND_MENTIONS, sendLong } from '../../src/utils/sendLong.js';

describe('sendLong', () => {
  it('applies the mention restriction to every chunk of a custom command reply', async () => {
    const send = jest.fn<(options: any) => Promise<unknown>>().mockResolvedValue(undefined);

    await sendLong({ send }, `@everyone ${'x'.repeat(2100)}`, CUSTOM_COMMAND_MENTIONS);

    expect(send.mock.calls.length).toBeGreaterThan(1);
    for (const [options] of send.mock.calls) {
      expect(options.allowedMentions).toEqual({ parse: ['users'] });
    }
  });

  it('leaves mentions to the client default when no restriction is given', async () => {
    const send = jest.fn<(options: any) => Promise<unknown>>().mockResolvedValue(undefined);

    await sendLong({ send }, '@everyone scheduled announcement');

    expect(send).toHaveBeenCalledWith({ content: '@everyone scheduled announcement', allowedMentions: undefined });
  });
});
