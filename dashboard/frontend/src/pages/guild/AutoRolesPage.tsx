import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Save, Plus, Trash2, CheckCircle } from 'lucide-react';
import { api } from '../../services/api';

interface AutoRole {
  role_id: string;
  delay_minutes: number;
  include_bots: boolean;
}

interface GuildRole {
  id: string;
  name: string;
  color: number;
}

export default function AutoRolesPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<AutoRole[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  const { data } = useQuery<AutoRole[]>({
    queryKey: ['auto-roles', guildId],
    queryFn: () => api.get(`/api/guilds/${guildId}/auto-roles`).then(r => r.data),
  });

  const { data: guildRoles = [] } = useQuery<GuildRole[]>({
    queryKey: ['guild-roles', guildId],
    queryFn: () => api.get(`/api/guilds/${guildId}/roles`).then(r => r.data),
  });

  useEffect(() => { if (data) setRows(data); }, [data]);

  const saveMutation = useMutation({
    mutationFn: (roles: AutoRole[]) => api.put(`/api/guilds/${guildId}/auto-roles`, { roles }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auto-roles', guildId] });
      setError(null);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    },
    onError: (e: unknown) =>
      setError((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to save'),
  });

  if (!rows) return null;

  const usedIds = new Set(rows.map(r => r.role_id));
  const update = (i: number, u: Partial<AutoRole>) =>
    setRows(prev => prev!.map((r, idx) => (idx === i ? { ...r, ...u } : r)));
  const invalid = rows.some(r => !r.role_id);

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="w-8 h-8 text-discord-blurple" />
          <div>
            <h1 className="text-2xl font-bold">Auto Roles</h1>
            <p className="text-discord-light">Automatically assign roles to new members</p>
          </div>
        </div>
        <button
          onClick={() => rows && saveMutation.mutate(rows)}
          disabled={saveMutation.isPending || invalid}
          className="btn btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {showSuccess ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saveMutation.isPending ? 'Saving...' : showSuccess ? 'Saved!' : 'Save Changes'}
        </button>
      </div>

      {error && <div className="card bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{error}</div>}

      <div className="bg-discord-blurple/20 border border-discord-blurple/50 rounded-lg p-4 text-sm">
        Roles are assigned when a member joins. Wall-E's role must sit above every auto role in
        Server Settings → Roles. A delay holds the assignment for that many minutes after join
        (delayed assignments don't survive a bot restart).
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Auto Roles ({rows.length})</h3>
          <button
            onClick={() => setRows([...rows, {
              role_id: guildRoles.find(r => !usedIds.has(r.id))?.id ?? '',
              delay_minutes: 0,
              include_bots: false,
            }])}
            disabled={guildRoles.length === 0 || rows.length >= 50}
            className="btn btn-secondary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Add Role
          </button>
        </div>

        {rows.length === 0 ? (
          <p className="text-discord-light text-center py-8">No auto roles configured.</p>
        ) : (
          <div className="space-y-3">
            {rows.map((row, i) => (
              <div key={i} className="bg-discord-dark rounded-lg p-4 flex items-end gap-4 flex-wrap">
                <div className="flex-1 min-w-[12rem]">
                  <label className="block text-xs text-discord-light mb-1">Role</label>
                  <select
                    value={row.role_id}
                    onChange={e => update(i, { role_id: e.target.value })}
                    className="input w-full"
                  >
                    <option value="">Select role...</option>
                    {guildRoles.map(r => (
                      <option key={r.id} value={r.id} disabled={r.id !== row.role_id && usedIds.has(r.id)}>
                        @{r.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="w-32">
                  <label className="block text-xs text-discord-light mb-1">Delay (min)</label>
                  <input
                    type="number"
                    min={0}
                    max={10080}
                    value={row.delay_minutes}
                    onChange={e => update(i, { delay_minutes: parseInt(e.target.value) || 0 })}
                    className="input w-full"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm pb-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={row.include_bots}
                    onChange={e => update(i, { include_bots: e.target.checked })}
                    className="w-4 h-4"
                  />
                  Include bots
                </label>
                <button
                  onClick={() => setRows(rows.filter((_, idx) => idx !== i))}
                  className="p-2 text-discord-light hover:text-red-400 pb-3"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
