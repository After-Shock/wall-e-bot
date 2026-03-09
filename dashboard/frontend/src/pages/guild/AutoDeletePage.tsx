import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import { Plus, Clock, Trash2, Play } from 'lucide-react';

interface AutoDeleteConfig {
  id: number;
  guild_id: string;
  channel_id: string;
  max_age_hours: number | null;
  max_messages: number | null;
  exempt_roles: string[];
  enabled: boolean;
}

interface DiscordChannel {
  id: string;
  name: string;
  parent_id: string | null;
}

interface GuildRole {
  id: string;
  name: string;
  color: number;
}

export default function AutoDeletePage() {
  const { guildId } = useParams<{ guildId: string }>();
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<{
    channel_id: string;
    max_age_hours: string;
    max_messages: string;
    exempt_roles: string[];
  }>({ channel_id: '', max_age_hours: '', max_messages: '', exempt_roles: [] });
  const [formError, setFormError] = useState<string | null>(null);
  const [runAllDone, setRunAllDone] = useState(false);
  const [runOneDone, setRunOneDone] = useState<number | null>(null);

  const runAllMutation = useMutation({
    mutationFn: () => api.post(`/api/guilds/${guildId}/auto-delete/run`),
    onSuccess: () => {
      setRunAllDone(true);
      setTimeout(() => setRunAllDone(false), 3000);
    },
  });

  const runOneMutation = useMutation({
    mutationFn: (id: number) => api.post(`/api/guilds/${guildId}/auto-delete/${id}/run`),
    onSuccess: (_data, id) => {
      setRunOneDone(id);
      setTimeout(() => setRunOneDone(null), 3000);
    },
  });

  const { data: configs = [] } = useQuery<AutoDeleteConfig[]>({
    queryKey: ['auto-delete', guildId],
    queryFn: () => api.get(`/api/guilds/${guildId}/auto-delete`).then(r => r.data),
  });

  const { data: channels = [] } = useQuery<DiscordChannel[]>({
    queryKey: ['channels', guildId],
    queryFn: () => api.get(`/api/guilds/${guildId}/channels`).then(r => r.data),
  });

  const { data: roles = [] } = useQuery<GuildRole[]>({
    queryKey: ['guild-roles', guildId],
    queryFn: () => api.get(`/api/guilds/${guildId}/roles`).then(r => r.data),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['auto-delete', guildId] });

  const addMutation = useMutation({
    mutationFn: (data: object) => api.post(`/api/guilds/${guildId}/auto-delete`, data).then(r => r.data),
    onSuccess: () => {
      invalidate();
      setShowAdd(false);
      setForm({ channel_id: '', max_age_hours: '', max_messages: '', exempt_roles: [] });
      setFormError(null);
    },
    onError: (e: unknown) => setFormError((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to save'),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      api.patch(`/api/guilds/${guildId}/auto-delete/${id}`, { enabled }),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/api/guilds/${guildId}/auto-delete/${id}`),
    onSuccess: invalidate,
  });

  const channelName = (id: string) => channels.find(c => c.id === id)?.name ?? id;
  const roleName = (id: string) => roles.find(r => r.id === id)?.name ?? id;

  const handleAdd = () => {
    if (!form.channel_id) { setFormError('Select a channel'); return; }
    if (!form.max_age_hours && !form.max_messages) { setFormError('Set at least one limit (age or message count)'); return; }
    addMutation.mutate({
      channel_id: form.channel_id,
      max_age_hours: form.max_age_hours ? parseInt(form.max_age_hours, 10) : null,
      max_messages: form.max_messages ? parseInt(form.max_messages, 10) : null,
      exempt_roles: form.exempt_roles,
    });
  };

  const usedChannelIds = new Set(configs.map(c => c.channel_id));
  const availableChannels = channels.filter(c => !usedChannelIds.has(c.id));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Auto-Delete</h2>
          <p className="text-sm text-discord-light mt-1">Automatically clean up old messages per channel. Pinned messages are always preserved.</p>
        </div>
        <div className="flex items-center gap-2">
          {configs.some(c => c.enabled) && (
            <button
              onClick={() => runAllMutation.mutate()}
              disabled={runAllMutation.isPending}
              className="btn btn-secondary flex items-center gap-2"
              title="Run all enabled auto-delete configs now"
            >
              {runAllMutation.isPending ? (
                <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              {runAllDone ? 'Done ✓' : 'Run All Now'}
            </button>
          )}
          <button onClick={() => { setShowAdd(true); setFormError(null); }} className="btn btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Add Channel
          </button>
        </div>
      </div>

      {showAdd && (
        <div className="card space-y-4 border border-discord-blurple/30">
          <h3 className="font-semibold">Configure Channel</h3>

          <div>
            <label className="block text-sm font-medium mb-1">Channel</label>
            <select value={form.channel_id} onChange={e => setForm(f => ({ ...f, channel_id: e.target.value }))} className="input w-full">
              <option value="">— Select channel —</option>
              {availableChannels.map(c => <option key={c.id} value={c.id}>#{c.name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Max age (hours)</label>
              <input type="number" min="1" max="8760" value={form.max_age_hours} onChange={e => setForm(f => ({ ...f, max_age_hours: e.target.value }))} className="input w-full" placeholder="e.g. 24" />
              <p className="text-xs text-discord-light mt-1">Delete messages older than this</p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Max messages</label>
              <input type="number" min="1" max="10000" value={form.max_messages} onChange={e => setForm(f => ({ ...f, max_messages: e.target.value }))} className="input w-full" placeholder="e.g. 50" />
              <p className="text-xs text-discord-light mt-1">Keep only this many recent messages</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Exempt roles <span className="text-discord-light font-normal">(messages from these roles are never deleted)</span></label>
            <div className="flex flex-wrap gap-2 mb-2">
              {form.exempt_roles.map(id => (
                <span key={id} className="flex items-center gap-1 bg-discord-darker px-2 py-0.5 rounded text-xs">
                  {roleName(id)}
                  <button onClick={() => setForm(f => ({ ...f, exempt_roles: f.exempt_roles.filter(r => r !== id) }))} className="text-discord-light hover:text-white">×</button>
                </span>
              ))}
            </div>
            <select
              value=""
              onChange={e => { if (e.target.value) setForm(f => ({ ...f, exempt_roles: [...f.exempt_roles, e.target.value] })); }}
              className="input w-full"
            >
              <option value="">— Add exempt role —</option>
              {roles.filter(r => !form.exempt_roles.includes(r.id)).map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>

          {formError && <p className="text-sm text-red-400">{formError}</p>}

          <div className="flex gap-2 justify-end">
            <button onClick={() => { setShowAdd(false); setFormError(null); }} className="btn btn-secondary">Cancel</button>
            <button onClick={handleAdd} disabled={addMutation.isPending} className="btn btn-primary">
              {addMutation.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {configs.length === 0 && !showAdd && (
        <div className="text-center py-12 text-discord-light">
          <Clock className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>No channels configured. Add a channel to start auto-deleting messages.</p>
        </div>
      )}

      <div className="space-y-3">
        {configs.map(config => (
          <div key={config.id} className="card flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <p className="font-medium">#{channelName(config.channel_id)}</p>
              <p className="text-xs text-discord-light mt-0.5">
                {config.max_age_hours ? `Older than ${config.max_age_hours}h` : ''}
                {config.max_age_hours && config.max_messages ? ' · ' : ''}
                {config.max_messages ? `Keep last ${config.max_messages} messages` : ''}
                {config.exempt_roles.length > 0 && ` · Exempt: ${config.exempt_roles.map(id => roleName(id)).join(', ')}`}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => toggleMutation.mutate({ id: config.id, enabled: !config.enabled })}
                className={`toggle ${config.enabled ? 'toggle-enabled' : 'toggle-disabled'}`}
              >
                <span className={`toggle-dot ${config.enabled ? 'translate-x-5' : 'translate-x-1'}`} />
              </button>
              <button
                onClick={() => runOneMutation.mutate(config.id)}
                disabled={runOneMutation.isPending && runOneMutation.variables === config.id}
                className="btn btn-secondary p-1.5"
                title="Run auto-delete for this channel now"
              >
                {runOneMutation.isPending && runOneMutation.variables === config.id ? (
                  <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin block" />
                ) : runOneDone === config.id ? (
                  <span className="text-xs text-green-400">✓</span>
                ) : (
                  <Play className="w-4 h-4" />
                )}
              </button>
              <button
                onClick={() => window.confirm(`Remove auto-delete for #${channelName(config.channel_id)}?`) && deleteMutation.mutate(config.id)}
                className="btn bg-red-500/20 text-red-400 hover:bg-red-500/30 p-1.5"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
