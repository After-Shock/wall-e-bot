/**
 * Resolve a channel name template with ticket variables.
 * Variables: {type}, {number}, {username}, {userid}
 * Discord channel names: lowercase, no spaces, max 100 chars
 */
export function resolveChannelName(
  template: string,
  vars: { type: string; number: number; username: string; userid: string },
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

/**
 * Show a form answer as a code block so it stands apart from the bold question.
 * Fences inside the answer are broken up so they can't close the block, and the
 * result fits Discord's 1024-character field limit.
 */
export function formatFormAnswer(answer: string): string {
  const text = answer.trim();
  if (!text) return '*(no answer)*';
  const safe = text.replace(/```/g, '`\u200b``');
  const max = 1024 - '```\n\n```'.length;
  const body = safe.length > max ? `${safe.slice(0, max - 1)}…` : safe;
  return `\`\`\`\n${body}\n\`\`\``;
}

/** Undo formatFormAnswer for the plain-text transcript. */
function unfence(value: string): string {
  const match = /^```\n([\s\S]*)\n```$/.exec(value);
  return match ? match[1].replace(/`\u200b``/g, '```') : value;
}

interface TranscriptMessage {
  author: { tag: string };
  content: string;
  createdAt: Date;
  attachments: { size: number; map?: (fn: (a: { url: string }) => string) => string[] };
  embeds?: Array<{
    title?: string | null;
    description?: string | null;
    fields?: Array<{ name: string; value: string }>;
  }>;
}

/**
 * Build a plain-text transcript from a list of messages.
 */
export function buildTranscript(
  channelName: string,
  userId: string,
  createdAt: Date,
  messages: TranscriptMessage[],
): string {
  let transcript = `Ticket Transcript - ${channelName}\n`;
  transcript += `Created: ${createdAt.toISOString()}\n`;
  transcript += `User ID: ${userId}\n\n`;
  transcript += '='.repeat(50) + '\n\n';

  for (const msg of messages) {
    const time = msg.createdAt.toISOString();
    transcript += `[${time}] ${msg.author.tag}: ${msg.content}\n`;
    for (const embed of msg.embeds ?? []) {
      if (embed.title) transcript += `  ${embed.title}\n`;
      if (embed.description) transcript += `  ${embed.description.replace(/\n/g, '\n  ')}\n`;
      for (const field of embed.fields ?? []) {
        transcript += `  ${field.name}: ${unfence(field.value).replace(/\n/g, '\n    ')}\n`;
      }
    }
    if (msg.attachments.size > 0 && msg.attachments.map) {
      const urls = msg.attachments.map(a => a.url);
      transcript += `  Attachments: ${urls.join(', ')}\n`;
    }
  }

  return transcript;
}
