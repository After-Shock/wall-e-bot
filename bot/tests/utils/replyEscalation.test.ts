import { describe, expect, it } from '@jest/globals';
import { escalationFor } from '../../src/utils/replyEscalation.js';

const HOUR = 60 * 60 * 1000;

describe('escalationFor', () => {
  it('climbs 1 hour, 1 day, 1 week and stays at 1 week with a manual-action alert', () => {
    expect(escalationFor(1)).toEqual({ ms: HOUR, label: '1 hour', needsManualAction: false });
    expect(escalationFor(2)).toEqual({ ms: 24 * HOUR, label: '1 day', needsManualAction: false });
    expect(escalationFor(3)).toEqual({ ms: 7 * 24 * HOUR, label: '1 week', needsManualAction: true });
    expect(escalationFor(9)).toEqual({ ms: 7 * 24 * HOUR, label: '1 week', needsManualAction: true });
  });
});
