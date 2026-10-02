export interface BulkRoleJob {
  id: number;
  guild_id: string;
  role_id: string;
  operation: 'add' | 'remove';
  filter_type: 'all' | 'humans' | 'bots' | 'has_roles' | 'missing_roles' | 'joined_after' | 'joined_before';
  filter_role_ids: string[];
  require_all: boolean;
  joined_at: Date | null;
  notify_channel_id: string | null;
  status: string;
  started_by: string;
  changed: number;
  failed: number;
}

export interface FilterableMember {
  bot: boolean;
  roleIds: string[];
  joinedAt: Date | null;
}

/**
 * Whether a member falls under a bulk role job's filter (YAGPDB semantics):
 * - has_roles: require_all → has every role; otherwise has at least one.
 * - missing_roles: require_all → has none of them; otherwise lacks at least one.
 */
export function matchesBulkRoleFilter(member: FilterableMember, job: Pick<BulkRoleJob,
  'filter_type' | 'filter_role_ids' | 'require_all' | 'joined_at'>): boolean {
  const has = (id: string) => member.roleIds.includes(id);
  switch (job.filter_type) {
    case 'all': return true;
    case 'humans': return !member.bot;
    case 'bots': return member.bot;
    case 'has_roles':
      return job.require_all ? job.filter_role_ids.every(has) : job.filter_role_ids.some(has);
    case 'missing_roles':
      return job.require_all ? !job.filter_role_ids.some(has) : !job.filter_role_ids.every(has);
    case 'joined_after':
      return !!member.joinedAt && !!job.joined_at && member.joinedAt > job.joined_at;
    case 'joined_before':
      return !!member.joinedAt && !!job.joined_at && member.joinedAt < job.joined_at;
    default: return false;
  }
}

/** Whether the member still needs the change (already has / lacks the role → skip). */
export function needsChange(member: FilterableMember, job: Pick<BulkRoleJob, 'role_id' | 'operation'>): boolean {
  const hasRole = member.roleIds.includes(job.role_id);
  return job.operation === 'add' ? !hasRole : hasRole;
}
