import type { MessageMentionOptions } from 'discord.js';

type Sendable = { send: (options: { content: string; allowedMentions?: MessageMentionOptions }) => Promise<unknown> };

/** Custom command output can echo user input, so it may only ping users, never @everyone/@here or roles. */
export const CUSTOM_COMMAND_MENTIONS: MessageMentionOptions = { parse: ['users'] };

export async function sendLong(channel: Sendable, text: string, allowedMentions?: MessageMentionOptions): Promise<void> {
  if (!text.trim()) return;

  const send = (content: string) => channel.send({ content, allowedMentions });

  if (text.length <= 2000) {
    await send(text);
    return;
  }

  let remaining = text;
  while (remaining.length > 0) {
    if (!remaining.trim()) break;

    if (remaining.length <= 2000) {
      await send(remaining);
      break;
    }

    const slice = remaining.slice(0, 2000);
    let splitAt = slice.lastIndexOf('\n');
    if (splitAt <= 0) splitAt = slice.lastIndexOf(' ');
    if (splitAt <= 0) splitAt = 2000;

    await send(remaining.slice(0, splitAt).trimEnd());
    remaining = remaining.slice(splitAt).trimStart();
  }
}
