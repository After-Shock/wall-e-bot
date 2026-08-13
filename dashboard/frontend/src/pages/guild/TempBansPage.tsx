import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ban, Clock, ShieldCheck } from 'lucide-react';
import { api } from '../../services/api';

interface TempBan {
  id: number;
  user_id: string;
  moderator_id: string;
  reason: string | null;
  unban_at: string;
  created_at: string;
  username: string;
  user_avatar: string | null;
  moderator_name: string;
}

function formatExpiry(iso: string) {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return 'expiring now';
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(h / 24);
  if (d > 0) return `in ${d}d ${h % 24}h`;
  if (h > 0) return `in ${h}h`;
  return `in ${Math.max(1, Math.floor(diff / 60000))}m`;
}

export default function TempBansPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const { data: bans = [], isLoading } = useQuery<TempBan[]>({
    queryKey: ['temp-bans', guildId],
    queryFn: () => api.get(`/api/guilds/${guildId}/temp-bans`).then(r => r.data),
  });

  const liftMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/api/guilds/${guildId}/temp-bans/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['temp-bans', guildId] });
      setError(null);
    },
    onError: (e: unknown) =>
      setError((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to lift ban'),
  });

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <Ban className="w-8 h-8 text-red-400" />
        <div>
          <h1 className="text-2xl font-bold">Temp Bans</h1>
          <p className="text-discord-light">Active temporary bans — lifted automatically when they expire</p>
        </div>
      </div>

      {error && <div className="card bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{error}</div>}

      <div className="bg-discord-blurple/20 border border-discord-blurple/50 rounded-lg p-4 text-sm">
        Create temp bans with <code>/tempban</code> in Discord. Wall-E lifts them automatically at
        expiry; use “Lift now” to unban early.
      </div>

      {isLoading ? null : bans.length === 0 ? (
        <div className="card text-center py-12 text-discord-light">
          <ShieldCheck className="w-16 h-16 mx-auto mb-4 opacity-50" />
          <p>No active temp bans.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {bans.map(ban => (
            <div key={ban.id} className="card flex items-center gap-4">
              {ban.user_avatar ? (
                <img src={ban.user_avatar} alt="" className="w-10 h-10 rounded-full" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-discord-dark" />
              )}
              <div className="flex-1 min-w-0">
                <div className="font-semibold">{ban.username}</div>
                <div className="text-sm text-discord-light truncate">
                  {ban.reason || 'No reason provided'} · by {ban.moderator_name}
                </div>
                <div className="flex items-center gap-1 text-xs text-discord-light mt-1">
                  <Clock className="w-3 h-3" /> expires {formatExpiry(ban.unban_at)}
                </div>
              </div>
              <button
                onClick={() => liftMutation.mutate(ban.id)}
                disabled={liftMutation.isPending}
                className="btn btn-secondary shrink-0 disabled:opacity-50"
              >
                Lift now
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
