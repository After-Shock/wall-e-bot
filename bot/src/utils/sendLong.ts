type Sendable = { send: (content: string) => Promise<unknown> };

export async function sendLong(channel: Sendable, text: string): Promise<void> {
  if (!text.trim()) return;

  if (text.length <= 2000) {
    await channel.send(text);
    return;
  }

  let remaining = text;
  while (remaining.length > 0) {
    if (!remaining.trim()) break;

    if (remaining.length <= 2000) {
      await channel.send(remaining);
      break;
    }

    const slice = remaining.slice(0, 2000);
    let splitAt = slice.lastIndexOf('\n');
    if (splitAt <= 0) splitAt = slice.lastIndexOf(' ');
    if (splitAt <= 0) splitAt = 2000;

    await channel.send(remaining.slice(0, splitAt).trimEnd());
    remaining = remaining.slice(splitAt).trimStart();
  }
}
