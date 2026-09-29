import { describe, expect, it, jest } from '@jest/globals';
import { closeTicket, TRANSCRIPT_REQUIRED_MESSAGE } from '../../src/services/TicketService.js';

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
  it('posts the transcript only to the transcript channel before closing', async () => {
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
    expect(fixture.ownerSend).toHaveBeenCalledWith(expect.any(String));
    expect(fixture.ownerSend.mock.calls[0][0]).not.toEqual(expect.objectContaining({ files: expect.anything() }));
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

    expect(result).toEqual({ closed: false, error: TRANSCRIPT_REQUIRED_MESSAGE });
    expect(fixture.query).not.toHaveBeenCalled();
    expect(fixture.deleteTicketChannel).not.toHaveBeenCalled();
    expect(fixture.ownerSend).not.toHaveBeenCalled();
  });
});
