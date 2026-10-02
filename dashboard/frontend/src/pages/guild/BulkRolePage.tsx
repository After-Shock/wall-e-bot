import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { UsersRound, Play, XCircle } from 'lucide-react';
import { api } from '../../services/api';

type FilterType = 'all' | 'humans' | 'bots' | 'has_roles' | 'missing_roles' | 'joined_after' | 'joined_before';

interface Job {
  id: number;
  role_id: string;
  operation: 'add' | 'remove';
  filter_type: FilterType;
  status: 'queued' | 'running' | 'cancelling' | 'cancelled' | 'done' | 'failed';
  total: number | null;
  processed: number;
  changed: number;
  failed: number;
  error: string | null;
  created_at: string;
  finished_at: string | null;
}

interface GuildRole { id: string; name: string }
interface GuildChannel { id: string; name: string }

const FILTERS: { value: FilterType; label: string }[] = [
  { value: 'all', label: 'All members' },
  { value: 'humans', label: 'Humans only' },
  { value: 'bots', label: 'Bots only' },
  { value: 'has_roles', label: 'Members who have specific roles' },
  { value: 'missing_roles', label: 'Members missing specific roles' },
  { value: 'joined_after', label: 'Joined after a date' },
  { value: 'joined_before', label: 'Joined before a date' },
];

const ACTIVE = new Set(['queued', 'running', 'cancelling']);

// Spells out what "Require all" means for the chosen filter (it reads very differently for the two).
function roleFilterMeaning(filter: FilterType, requireAll: boolean) {
  if (filter === 'has_roles') return requireAll ? 'Members who have every selected role.' : 'Members who have at least one selected role.';
  return requireAll
    ? 'Members who have none of the selected roles.'
    : 'Members missing at least one selected role — with several roles selected this can match almost everyone.';
}

export default function BulkRolePage() {
  const { guildId } = useParams<{ guildId: string }>();
  const queryClient = useQueryClient();
  const [roleId, setRoleId] = useState('');
  const [operation, setOperation] = useState<'add' | 'remove'>('add');
  const [filterType, setFilterType] = useState<FilterType>('humans');
  const [filterRoleIds, setFilterRoleIds] = useState<string[]>([]);
  const [requireAll, setRequireAll] = useState(false);
  const [joinedDate, setJoinedDate] = useState('');
  const [notifyChannelId, setNotifyChannelId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: roles = [] } = useQuery<GuildRole[]>({
    queryKey: ['roles', guildId],
    queryFn: () => api.get(`/api/guilds/${guildId}/roles`).then(r => r.data),
    enabled: !!guildId,
  });
  const { data: channels = [] } = useQuery<GuildChannel[]>({
    queryKey: ['channels', guildId],
    queryFn: () => api.get(`/api/guilds/${guildId}/channels`).then(r => r.data),
    enabled: !!guildId,
  });
  const { data: jobs = [] } = useQuery<Job[]>({
    queryKey: ['bulk-role', guildId],
    queryFn: () => api.get(`/api/guilds/${guildId}/bulk-role`).then(r => r.data),
    enabled: !!guildId,
    refetchInterval: query => (query.state.data ?? []).some(j => ACTIVE.has(j.status)) ? 2000 : false,
  });

  const roleName = (id: string) => roles.find(r => r.id === id)?.name ?? 'deleted role';
  const activeJob = jobs.find(j => ACTIVE.has(j.status));
  const roleFilter = filterType === 'has_roles' || filterType === 'missing_roles';
  const dateFilter = filterType === 'joined_after' || filterType === 'joined_before';
  const ready = !!roleId && (!roleFilter || filterRoleIds.length > 0) && (!dateFilter || !!joinedDate);

  const startMutation = useMutation({
    mutationFn: () => api.post(`/api/guilds/${guildId}/bulk-role`, {
      role_id: roleId,
      operation,
      filter_type: filterType,
      filter_role_ids: roleFilter ? filterRoleIds : [],
      require_all: roleFilter && requireAll,
      joined_at: dateFilter ? new Date(`${joinedDate}T00:00:00`).toISOString() : null,
      notify_channel_id: notifyChannelId || null,
    }),
    onSuccess: () => { setError(null); queryClient.invalidateQueries({ queryKey: ['bulk-role', guildId] }); },
    onError: (e: any) => setError(e?.response?.data?.error ?? 'Failed to start'),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) => api.post(`/api/guilds/${guildId}/bulk-role/${id}/cancel`),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['bulk-role', guildId] }),
  });

  const start = () => {
    const who = FILTERS.find(f => f.value === filterType)!.label.toLowerCase();
    const summary = `${operation === 'add' ? 'Add' : 'Remove'} @${roleName(roleId)} ${operation === 'add' ? 'to' : 'from'} ${who}` +
      (dateFilter ? ` (${joinedDate})` : '') + '?\n\nThis changes roles for real and can take a while on large servers.';
    if (window.confirm(summary)) startMutation.mutate();
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <UsersRound className="w-8 h-8 text-discord-blurple" />
        <div>
          <h1 className="text-2xl font-bold">Bulk Role</h1>
          <p className="text-discord-light">Add or remove a role for every member that matches a filter.</p>
        </div>
      </div>

      <div className="card space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="bulk-role">Role</label>
            <select id="bulk-role" value={roleId} onChange={e => setRoleId(e.target.value)} className="input w-full">
              <option value="">— Select role —</option>
              {roles.map(r => <option key={r.id} value={r.id}>@{r.name}</option>)}
            </select>
          </div>
          <div>
            <span className="block text-sm font-medium mb-1">Operation</span>
            <div className="flex gap-4 pt-2">
              {(['add', 'remove'] as const).map(op => (
                <label key={op} className="flex items-center gap-2 text-sm">
                  <input type="radio" name="operation" checked={operation === op} onChange={() => setOperation(op)} />
                  {op === 'add' ? 'Add role' : 'Remove role'}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="bulk-filter">Members</label>
            <select id="bulk-filter" value={filterType} onChange={e => setFilterType(e.target.value as FilterType)} className="input w-full">
              {FILTERS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="bulk-notify">Post a summary in (optional)</label>
            <select id="bulk-notify" value={notifyChannelId} onChange={e => setNotifyChannelId(e.target.value)} className="input w-full">
              <option value="">— No notification —</option>
              {channels.map(c => <option key={c.id} value={c.id}>#{c.name}</option>)}
            </select>
          </div>
        </div>

        {roleFilter && (
          <div className="space-y-2">
            <label className="block text-sm font-medium" htmlFor="bulk-filter-roles">Filter roles</label>
            <select
              id="bulk-filter-roles"
              multiple
              value={filterRoleIds}
              onChange={e => setFilterRoleIds(Array.from(e.target.selectedOptions, o => o.value))}
              className="input w-full h-32"
            >
              {roles.map(r => <option key={r.id} value={r.id}>@{r.name}</option>)}
            </select>
            <p className="text-xs text-discord-light">Hold Ctrl (Cmd on Mac) to pick several.</p>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={requireAll} onChange={e => setRequireAll(e.target.checked)} />
              Require all selected roles
            </label>
            <p className="text-xs text-discord-light">Matches: {roleFilterMeaning(filterType, requireAll)}</p>
          </div>
        )}

        {dateFilter && (
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="bulk-date">Join date</label>
            <input id="bulk-date" type="date" value={joinedDate} onChange={e => setJoinedDate(e.target.value)} className="input" />
          </div>
        )}

        {error && <p className="text-sm text-red-400" role="alert">{error}</p>}

        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-discord-light">
            Wall-E&apos;s role must be above the role you pick. One job runs at a time per server.
          </p>
          <button
            onClick={start}
            disabled={!ready || !!activeJob || startMutation.isPending}
            title={activeJob ? 'A job is already running' : undefined}
            className="btn btn-primary flex items-center gap-2"
          >
            <Play className="w-4 h-4" /> {startMutation.isPending ? 'Starting…' : 'Start'}
          </button>
        </div>
      </div>

      <div className="card space-y-3">
        <h2 className="font-semibold">Recent jobs</h2>
        {jobs.length === 0 && <p className="text-sm text-discord-light">No bulk role jobs yet.</p>}
        {jobs.map(job => {
          const pct = job.total ? Math.round((job.processed / job.total) * 100) : 0;
          return (
            <div key={job.id} className="bg-discord-darker rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-3 text-sm">
                <span className="font-medium flex-1">
                  {job.operation === 'add' ? 'Add' : 'Remove'} @{roleName(job.role_id)} ·{' '}
                  {FILTERS.find(f => f.value === job.filter_type)?.label}
                </span>
                <span className="text-xs text-discord-light">{new Date(job.created_at).toLocaleString()}</span>
                <span className="text-xs px-2 py-0.5 rounded bg-discord-dark">{job.status}</span>
                {(job.status === 'queued' || job.status === 'running') && (
                  <button
                    onClick={() => cancelMutation.mutate(job.id)}
                    className="text-discord-light hover:text-red-400"
                    aria-label={`Cancel job ${job.id}`}
                  >
                    <XCircle className="w-4 h-4" />
                  </button>
                )}
              </div>
              {job.total !== null && (
                <>
                  <div className="h-2 bg-discord-dark rounded" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                    <div className="h-2 bg-discord-blurple rounded" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-xs text-discord-light">
                    {job.processed} / {job.total} processed · {job.changed} changed{job.failed ? ` · ${job.failed} failed` : ''}
                  </p>
                </>
              )}
              {job.error && <p className="text-xs text-red-400">{job.error}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
