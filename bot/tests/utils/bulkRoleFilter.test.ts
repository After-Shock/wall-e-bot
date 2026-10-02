import { describe, expect, it } from '@jest/globals';
import { matchesBulkRoleFilter, needsChange } from '../../src/utils/bulkRoleFilter.js';

const member = (roleIds: string[], extra: Partial<{ bot: boolean; joinedAt: Date | null }> = {}) =>
  ({ bot: false, joinedAt: new Date('2026-06-01'), roleIds, ...extra });
const job = (filter_type: any, extra: Record<string, unknown> = {}) =>
  ({ filter_type, filter_role_ids: ['a', 'b'], require_all: false, joined_at: null, ...extra });

describe('matchesBulkRoleFilter', () => {
  it('splits humans and bots', () => {
    expect(matchesBulkRoleFilter(member([]), job('humans'))).toBe(true);
    expect(matchesBulkRoleFilter(member([], { bot: true }), job('humans'))).toBe(false);
    expect(matchesBulkRoleFilter(member([], { bot: true }), job('bots'))).toBe(true);
  });

  it('has_roles: any by default, every with require_all', () => {
    expect(matchesBulkRoleFilter(member(['a']), job('has_roles'))).toBe(true);
    expect(matchesBulkRoleFilter(member(['a']), job('has_roles', { require_all: true }))).toBe(false);
    expect(matchesBulkRoleFilter(member(['a', 'b']), job('has_roles', { require_all: true }))).toBe(true);
    expect(matchesBulkRoleFilter(member(['c']), job('has_roles'))).toBe(false);
  });

  it('missing_roles: lacks at least one by default, has none with require_all', () => {
    expect(matchesBulkRoleFilter(member(['a']), job('missing_roles'))).toBe(true);
    expect(matchesBulkRoleFilter(member(['a', 'b']), job('missing_roles'))).toBe(false);
    expect(matchesBulkRoleFilter(member(['a']), job('missing_roles', { require_all: true }))).toBe(false);
    expect(matchesBulkRoleFilter(member(['c']), job('missing_roles', { require_all: true }))).toBe(true);
  });

  it('filters by join date', () => {
    const cutoff = new Date('2026-05-01');
    expect(matchesBulkRoleFilter(member([]), job('joined_after', { joined_at: cutoff }))).toBe(true);
    expect(matchesBulkRoleFilter(member([]), job('joined_before', { joined_at: cutoff }))).toBe(false);
    expect(matchesBulkRoleFilter(member([], { joinedAt: null }), job('joined_after', { joined_at: cutoff }))).toBe(false);
  });
});

describe('needsChange', () => {
  it('skips members already in the desired state', () => {
    expect(needsChange(member(['r']), { role_id: 'r', operation: 'add' })).toBe(false);
    expect(needsChange(member([]), { role_id: 'r', operation: 'add' })).toBe(true);
    expect(needsChange(member([]), { role_id: 'r', operation: 'remove' })).toBe(false);
    expect(needsChange(member(['r']), { role_id: 'r', operation: 'remove' })).toBe(true);
  });
});
