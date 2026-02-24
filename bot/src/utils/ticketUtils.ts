/**
 * Resolve a channel name template with ticket variables.
 * Variables: {type}, {number}, {username}, {userid}
 * Discord channel names: lowercase, no spaces, max 100 chars
 */
export function resolveChannelName(
  template: string,
  vars: { type: string; number: number; username: string; userid: string }
): string {
  const sanitize = (s: string) =>
    s.toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

  const result = template
    .replace(/{type}/g, sanitize(vars.type))
    .replace(/{number}/g, vars.number.toString().padStart(4, '0'))
    .replace(/{username}/g, sanitize(vars.username))
    .replace(/{userid}/g, vars.userid);

  return result.substring(0, 100);
}

interface TranscriptMessage {
  author: { tag: string };
  content: string;
  createdAt: Date;
  attachments: { size: number; map?: (fn: (a: { url: string }) => string) => string[] };
}

/**
 * Build a plain-text transcript from a list of messages.
 */
export function buildTranscript(
  channelName: string,
  userId: string,
  createdAt: Date,
  messages: TranscriptMessage[]
): string {
  let transcript = `Ticket Transcript - ${channelName}\n`;
  transcript += `Created: ${createdAt.toISOString()}\n`;
  transcript += `User ID: ${userId}\n\n`;
  transcript += '='.repeat(50) + '\n\n';

  for (const msg of messages) {
    const time = msg.createdAt.toISOString();
    transcript += `[${time}] ${msg.author.tag}: ${msg.content}\n`;
    if (msg.attachments.size > 0 && msg.attachments.map) {
      const urls = msg.attachments.map(a => a.url);
      transcript += `  Attachments: ${urls.join(', ')}\n`;
    }
  }

  return transcript;
}
