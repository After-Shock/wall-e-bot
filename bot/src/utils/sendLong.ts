type Sendable = { send: (content: string) => Promise<unknown> };

/**
 * Send a potentially long text message, splitting into ≤2000-char chunks
 * at the last newline or space boundary before the limit.
 */
export async function sendLong(channel: Sendable, text: string): Promise<void> {
  if (text.length <= 2000) {
    await channel.send(text);
    return;
  }

  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= 2000) {
      await channel.send(remaining);
      break;
    }

    // Find best split point within first 2000 chars
    const slice = remaining.slice(0, 2000);
    let splitAt = slice.lastIndexOf('\n');
    if (splitAt <= 0) splitAt = slice.lastIndexOf(' ');
    if (splitAt <= 0) splitAt = 2000; // hard cut as last resort

    await channel.send(remaining.slice(0, splitAt).trimEnd());
    remaining = remaining.slice(splitAt).trimStart();
  }
}
