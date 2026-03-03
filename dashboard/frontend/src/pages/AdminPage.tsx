import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { Shield, Server, Users, Clock, CheckCircle, XCircle, LogOut } from 'lucide-react';

interface AdminGuild {
  id: string;
  name: string;
  icon: string | null;
  memberCount: number;
  status: 'pending' | 'approved' | 'blacklisted';
  addedAt: string;
  approvedAt: string | null;
  leftAt: string | null;
}

interface AdminStats {
  totalGuilds: number;
  totalUsers: number;
  pendingGuilds: number;
}

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-400',
  approved: 'bg-green-500/20 text-green-400',
  blacklisted: 'bg-red-500/20 text-red-400',
};

export default function AdminPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const ownerIds = (import.meta.env.VITE_BOT_OWNER_ID || '').split(',').map((s: string) => s.trim());
  const isOwner = user && ownerIds.includes(user.id);

  if (!isOwner) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Shield className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
          <p className="text-discord-light">This area is restricted to bot owners only.</p>
        </div>
      </div>
    );
  }

  const { data: stats } = useQuery<AdminStats>({
    queryKey: ['admin-stats'],
    queryFn: () => api.get('/api/admin/stats').then(r => r.data),
    refetchInterval: 30_000,
  });

  const { data: guilds, isLoading } = useQuery<AdminGuild[]>({
    queryKey: ['admin-guilds'],
    queryFn: () => api.get('/api/admin/guilds').then(r => r.data),
    refetchInterval: 30_000,
  });

  const approve = useMutation({
    mutationFn: (guildId: string) => api.post(`/api/admin/guilds/${guildId}/approve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-guilds'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
    },
  });

  const blacklist = useMutation({
    mutationFn: (guildId: string) => api.post(`/api/admin/guilds/${guildId}/blacklist`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-guilds'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
    },
  });

  const leave = useMutation({
    mutationFn: (guildId: string) => api.delete(`/api/admin/guilds/${guildId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-guilds'] }),
  });

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Shield className="w-8 h-8 text-discord-blurple" />
        <div>
          <h1 className="text-2xl font-bold">Bot Admin Panel</h1>
          <p className="text-discord-light">Manage servers and access control</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <Server className="w-5 h-5 text-discord-blurple" />
          </div>
          <div className="text-3xl font-bold">{stats?.totalGuilds ?? '—'}</div>
          <div className="text-sm text-discord-light">Active Servers</div>
        </div>
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <Users className="w-5 h-5 text-green-400" />
          </div>
          <div className="text-3xl font-bold">{stats?.totalUsers ?? '—'}</div>
          <div className="text-sm text-discord-light">Tracked Users</div>
        </div>
        <div className="card border border-yellow-500/30">
          <div className="flex items-center justify-between mb-2">
            <Clock className="w-5 h-5 text-yellow-400" />
            {(stats?.pendingGuilds ?? 0) > 0 && (
              <span className="bg-yellow-500 text-black text-xs font-bold px-2 py-0.5 rounded-full">
                {stats!.pendingGuilds} new
              </span>
            )}
          </div>
          <div className="text-3xl font-bold">{stats?.pendingGuilds ?? '—'}</div>
          <div className="text-sm text-discord-light">Pending Approval</div>
        </div>
      </div>

      {/* Guild Table */}
      <div className="card">
        <h2 className="text-xl font-semibold mb-4">All Servers</h2>
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-discord-blurple" />
          </div>
        ) : !guilds?.length ? (
          <p className="text-discord-light text-center py-8">No servers found</p>
        ) : (
          <div className="space-y-2">
            {guilds.map(guild => (
              <div key={guild.id} className={`bg-discord-darker rounded-lg p-4 flex items-center gap-4 ${guild.status === 'pending' ? 'border border-yellow-500/30' : ''}`}>
                {/* Icon */}
                {guild.icon ? (
                  <img
                    src={`https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`}
                    alt={guild.name}
                    className="w-10 h-10 rounded-full shrink-0"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-discord-dark flex items-center justify-center shrink-0">
                    <Server className="w-5 h-5 text-discord-light" />
                  </div>
                )}

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold truncate">{guild.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLES[guild.status] ?? 'bg-discord-dark text-discord-light'}`}>
                      {guild.status}
                    </span>
                    {guild.leftAt && <span className="text-xs bg-discord-dark text-discord-light px-2 py-0.5 rounded-full">left</span>}
                  </div>
                  <div className="text-xs text-discord-light mt-0.5 flex gap-3">
                    <span>{guild.memberCount.toLocaleString()} members</span>
                    <span>ID: {guild.id}</span>
                    <span>Added {new Date(guild.addedAt).toLocaleDateString()}</span>
                  </div>
                </div>

                {/* Actions */}
                {!guild.leftAt && (
                  <div className="flex items-center gap-2 shrink-0">
                    {guild.status === 'pending' && (
                      <button
                        onClick={() => approve.mutate(guild.id)}
                        disabled={approve.isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30 text-sm transition-colors"
                      >
                        <CheckCircle className="w-4 h-4" />
                        Approve
                      </button>
                    )}
                    {guild.status !== 'blacklisted' && (
                      <button
                        onClick={() => {
                          if (window.confirm(`Blacklist "${guild.name}"? The bot will leave immediately.`)) {
                            blacklist.mutate(guild.id);
                          }
                        }}
                        disabled={blacklist.isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 text-sm transition-colors"
                      >
                        <XCircle className="w-4 h-4" />
                        Blacklist
                      </button>
                    )}
                    {guild.status === 'approved' && (
                      <button
                        onClick={() => {
                          if (window.confirm(`Leave "${guild.name}"? The server will stay approved.`)) {
                            leave.mutate(guild.id);
                          }
                        }}
                        disabled={leave.isPending}
                        className="p-1.5 rounded-lg text-discord-light hover:text-white hover:bg-discord-dark transition-colors"
                        title="Leave server"
                      >
                        <LogOut className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
