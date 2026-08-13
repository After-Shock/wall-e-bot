import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Calendar, Plus, Trash2, Clock, Hash, Play, Pause } from 'lucide-react';
import { api } from '../../services/api';

interface ScheduledMessage {
  id: number;
  channel_id: string;
  message: string;
  embed: boolean;
  embed_color: string | null;
  interval_minutes: number;
  next_run: string;
  last_run: string | null;
  enabled: boolean;
}

interface DiscordChannel {
  id: string;
  name: string;
  parent_id: string | null;
}

const blankForm = { channel_id: '', message: '', embed: false, embed_color: '#5865F2', interval_minutes: 1440 };

// Common intervals in minutes for the dropdown.
const INTERVALS: [number, string][] = [
  [60, 'Every hour'],
  [360, 'Every 6 hours'],
  [720, 'Every 12 hours'],
  [1440, 'Every day'],
  [10080, 'Every week'],
];

function formatWhen(iso: string) {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return 'due now';
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(h / 24);
  if (d > 0) return `in ${d}d ${h % 24}h`;
  if (h > 0) return `in ${h}h`;
  return `in ${Math.max(1, Math.floor(diff / 60000))}m`;
}

export default function ScheduledMessagesPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(blankForm);
  const [error, setError] = useState<string | null>(null);

  const { data: messages = [] } = useQuery<ScheduledMessage[]>({
    queryKey: ['scheduled-messages', guildId],
    queryFn: () => api.get(`/api/guilds/${guildId}/scheduled-messages`).then(r => r.data),
  });

  const { data: channels = [] } = useQuery<DiscordChannel[]>({
    queryKey: ['channels', guildId],
    queryFn: () => api.get(`/api/guilds/${guildId}/channels`).then(r => r.data),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['scheduled-messages', guildId] });
  const apiError = (e: unknown) =>
    setError((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Request failed');

  const createMutation = useMutation({
    mutationFn: () => api.post(`/api/guilds/${guildId}/scheduled-messages`, form),
    onSuccess: () => { invalidate(); setShowAdd(false); setForm(blankForm); setError(null); },
    onError: apiError,
  });

  const toggleMutation = useMutation({
    mutationFn: (m: ScheduledMessage) =>
      api.patch(`/api/guilds/${guildId}/scheduled-messages/${m.id}`, { enabled: !m.enabled }),
    onSuccess: () => { invalidate(); setError(null); },
    onError: apiError,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/api/guilds/${guildId}/scheduled-messages/${id}`),
    onSuccess: () => { invalidate(); setError(null); },
    onError: apiError,
  });

  const channelName = (id: string) => channels.find(c => c.id === id)?.name ?? id;

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Calendar className="w-8 h-8 text-blue-400" />
          <div>
            <h1 className="text-2xl font-bold">Scheduled Messages</h1>
            <p className="text-discord-light">Automate recurring announcements on a fixed interval</p>
          </div>
        </div>
        {!showAdd && (
          <button onClick={() => { setShowAdd(true); setError(null); }} className="btn btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> New Schedule
          </button>
        )}
      </div>

      {error && <div className="card bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{error}</div>}

      {showAdd && (
        <div className="card space-y-4">
          <h3 className="font-semibold">New Scheduled Message</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Channel</label>
              <select value={form.channel_id} onChange={e => setForm({ ...form, channel_id: e.target.value })} className="input w-full">
                <option value="">Select channel...</option>
                {channels.map(c => <option key={c.id} value={c.id}>#{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Frequency</label>
              <select
                value={form.interval_minutes}
                onChange={e => setForm({ ...form, interval_minutes: parseInt(e.target.value) })}
                className="input w-full"
              >
                {INTERVALS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Message</label>
            <textarea
              value={form.message}
              onChange={e => setForm({ ...form, message: e.target.value })}
              className="input w-full h-24 resize-none"
              placeholder="Supports {server} and {memberCount}"
              maxLength={2000}
            />
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.embed} onChange={e => setForm({ ...form, embed: e.target.checked })} className="w-4 h-4" />
              Send as embed
            </label>
            {form.embed && (
              <input type="color" value={form.embed_color} onChange={e => setForm({ ...form, embed_color: e.target.value })} className="w-9 h-9 rounded cursor-pointer" />
            )}
          </div>
          <p className="text-xs text-discord-light">First message posts one interval from now.</p>
          <div className="flex gap-3">
            <button onClick={() => { setShowAdd(false); setError(null); }} className="btn btn-secondary">Cancel</button>
            <button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !form.channel_id || !form.message.trim()}
              className="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {createMutation.isPending ? 'Creating...' : 'Create'}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {messages.length === 0 && !showAdd ? (
          <div className="card text-center py-12 text-discord-light">
            <Calendar className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <p>No scheduled messages yet.</p>
          </div>
        ) : (
          messages.map(m => (
            <div key={m.id} className={`card ${m.enabled ? '' : 'opacity-60'}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2 text-sm text-discord-light">
                    <Hash className="w-4 h-4" /> {channelName(m.channel_id)}
                    <Clock className="w-4 h-4 ml-2" /> every {Math.round(m.interval_minutes / 60) || m.interval_minutes / 60}h
                    <span className="ml-2">next {formatWhen(m.next_run)}</span>
                  </div>
                  <p className="whitespace-pre-wrap break-words">{m.message}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => toggleMutation.mutate(m)}
                    className="btn btn-secondary"
                    title={m.enabled ? 'Pause' : 'Resume'}
                  >
                    {m.enabled ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate(m.id)}
                    className="btn bg-red-500/20 text-red-400 hover:bg-red-500/30"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
