import { describe, expect, it } from '@jest/globals';
import { escalationFor } from '../../src/utils/replyEscalation.js';

const MINUTE = 60 * 1000;

describe('escalationFor', () => {
  it('climbs 10 minutes, 1 hour, 1 day and stays at 1 day with a ban warning and manual-action alert', () => {
    expect(escalationFor(1)).toMatchObject({ ms: 10 * MINUTE, label: '10 minutes', notice: null, needsManualAction: false });
    expect(escalationFor(2)).toMatchObject({ ms: 60 * MINUTE, label: '1 hour', needsManualAction: false });
    expect(escalationFor(2).notice).toContain('second offense');
    expect(escalationFor(3)).toMatchObject({ ms: 24 * 60 * MINUTE, label: '1 day', needsManualAction: true });
    expect(escalationFor(3).notice).toContain('ban');
    expect(escalationFor(9)).toEqual(escalationFor(3));
  });
});
