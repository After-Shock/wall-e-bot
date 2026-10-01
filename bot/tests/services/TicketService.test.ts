import { describe, expect, it, jest } from '@jest/globals';
import { canCloseTicket, closeTicket, TRANSCRIPT_UNREACHABLE_MESSAGE } from '../../src/services/TicketService.js';

describe('canCloseTicket', () => {
  it('allows only Administrators or members holding one of the support roles', () => {
    expect(canCloseTicket(['member', 'support-b'], ['support-a', 'support-b'], false)).toBe(true);
    expect(canCloseTicket(['member'], [], true)).toBe(true);
    expect(canCloseTicket(['member'], ['support-a'], false)).toBe(false);
    expect(canCloseTicket(['member'], [], false)).toBe(false);
  });
});

function messageBatch() {
  const message = {
    author: { tag: 'User#0001' },
    content: 'Please help',
    createdAt: new Date('2026-09-29T10:00:00Z'),
    attachments: { size: 0, map: () => [] },
    embeds: [],
  };
  return {
    size: 1,
    values: () => [message][Symbol.iterator](),
    last: () => message,
  };
}

function makeFixture(transcriptSend: jest.Mock<(payload: any) => Promise<any>>) {
  const deleteTicketChannel = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const ticketChannel = {
    id: 'ticket-channel',
    name: 'support-0001',
    isTextBased: () => true,
    messages: { fetch: jest.fn<() => Promise<any>>().mockResolvedValue(messageBatch()) },
    setParent: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    setName: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    delete: deleteTicketChannel,
  };
  const transcriptChannel = {
    id: 'transcript-channel',
    isTextBased: () => true,
    send: transcriptSend,
  };
  const channels = new Map<string, any>([
    [ticketChannel.id, ticketChannel],
    [transcriptChannel.id, transcriptChannel],
  ]);
  const guild = {
    name: 'Test Guild',
    channels: {
      cache: channels,
      fetch: jest.fn<(id: string) => Promise<any>>(async id => channels.get(id) ?? null),
    },
  };
  const ownerSend = jest.fn<(payload: any) => Promise<void>>().mockResolvedValue(undefined);
  const query = jest.fn<(sql: string, values: unknown[]) => Promise<any>>().mockResolvedValue({ rowCount: 1 });
  const client = {
    db: { pool: { query } },
    users: { fetch: jest.fn<() => Promise<any>>().mockResolvedValue({ send: ownerSend }) },
  };
  const ticket = {
    id: 1,
    channel_id: ticketChannel.id,
    user_id: 'owner-id',
    created_at: new Date('2026-09-29T09:00:00Z'),
    category_closed_id: 'closed-category',
    transcript_channel_id: transcriptChannel.id,
  };

  return { client, guild, ticket, ownerSend, query, deleteTicketChannel };
}

describe('closeTicket', () => {
  it('posts the transcript to the transcript channel and DMs it to the requestor', async () => {
    const transcriptSend = jest.fn<(payload: any) => Promise<any>>().mockResolvedValue({ id: 'transcript-message' });
    const fixture = makeFixture(transcriptSend);

    const result = await closeTicket(
      fixture.client as any,
      fixture.guild as any,
      fixture.ticket,
      'staff-id',
      'Resolved',
    );

    expect(result).toEqual({ closed: true, transcriptMessageId: 'transcript-message' });
    expect(transcriptSend).toHaveBeenCalledTimes(1);
    expect(transcriptSend.mock.calls[0][0]).toMatchObject({ files: [expect.objectContaining({ name: 'transcript-support-0001.txt' })] });
    expect(fixture.query).toHaveBeenCalledWith(expect.stringContaining("status = 'closed'"), [1, 'staff-id', 'Resolved', 'transcript-message']);
    expect(fixture.ownerSend).toHaveBeenCalledTimes(1);
    expect(fixture.ownerSend.mock.calls[0][0]).toMatchObject({ files: [expect.objectContaining({ name: 'transcript-support-0001.txt' })] });
  });

  it('omits the reason everywhere when none is given', async () => {
    const transcriptSend = jest.fn<(payload: any) => Promise<any>>().mockResolvedValue({ id: 'transcript-message' });
    const fixture = makeFixture(transcriptSend);

    await closeTicket(fixture.client as any, fixture.guild as any, fixture.ticket, 'staff-id', '');

    const fieldNames = transcriptSend.mock.calls[0][0].embeds[0].data.fields.map((f: any) => f.name);
    expect(fieldNames).not.toContain('Reason');
    expect(fixture.query).toHaveBeenCalledWith(expect.any(String), [1, 'staff-id', null, 'transcript-message']);
    expect(fixture.ownerSend.mock.calls[0][0].content).not.toContain('Reason');
  });

  it('still closes when the requestor has DMs disabled', async () => {
    const transcriptSend = jest.fn<(payload: any) => Promise<any>>().mockResolvedValue({ id: 'transcript-message' });
    const fixture = makeFixture(transcriptSend);
    fixture.ownerSend.mockRejectedValue(new Error('Cannot send messages to this user'));

    const result = await closeTicket(fixture.client as any, fixture.guild as any, fixture.ticket, 'staff-id', 'Resolved');

    expect(result).toEqual({ closed: true, transcriptMessageId: 'transcript-message' });
  });

  it('leaves the ticket open when transcript delivery fails', async () => {
    const transcriptSend = jest.fn<(payload: any) => Promise<any>>().mockRejectedValue(new Error('Missing Access'));
    const fixture = makeFixture(transcriptSend);

    const result = await closeTicket(
      fixture.client as any,
      fixture.guild as any,
      fixture.ticket,
      'staff-id',
      'Resolved',
    );

    expect(result).toEqual({ closed: false, error: TRANSCRIPT_UNREACHABLE_MESSAGE });
    expect(fixture.query).not.toHaveBeenCalled();
    expect(fixture.deleteTicketChannel).not.toHaveBeenCalled();
    expect(fixture.ownerSend).not.toHaveBeenCalled();
  });
});
