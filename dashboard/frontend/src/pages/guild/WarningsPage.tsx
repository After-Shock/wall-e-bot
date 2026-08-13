import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Search } from 'lucide-react';
import { api } from '../../services/api';

interface Warning {
  id: number;
  user_id: string;
  username: string;
  user_avatar: string | null;
  moderator_id: string;
  moderator_name: string;
  reason: string;
  active: boolean;
  created_at: string;
}

export default function WarningsPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  const { data: warnings = [], isLoading } = useQuery<Warning[]>({
    queryKey: ['warnings', guildId],
    queryFn: () => api.get(`/api/guilds/${guildId}/warnings`).then(r => r.data),
  });

  const q = search.toLowerCase();
  const filtered = warnings.filter(w =>
    (showInactive || w.active) &&
    (q === '' || w.username.toLowerCase().includes(q) || w.reason.toLowerCase().includes(q)),
  );

  const activeCount = warnings.filter(w => w.active).length;

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <AlertTriangle className="w-8 h-8 text-yellow-400" />
        <div>
          <h1 className="text-2xl font-bold">Warnings</h1>
          <p className="text-discord-light">{activeCount} active warning{activeCount === 1 ? '' : 's'}</p>
        </div>
      </div>

      <div className="bg-discord-blurple/20 border border-discord-blurple/50 rounded-lg p-4 text-sm">
        Issue and remove warnings with <code>/warn</code> in Discord. This page is a read-only log.
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-discord-light" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by user or reason..."
            className="input w-full pl-9"
          />
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer whitespace-nowrap">
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="w-4 h-4" />
          Show removed
        </label>
      </div>

      {isLoading ? null : filtered.length === 0 ? (
        <div className="card text-center py-12 text-discord-light">
          <AlertTriangle className="w-16 h-16 mx-auto mb-4 opacity-50" />
          <p>{warnings.length === 0 ? 'No warnings on record.' : 'No warnings match your filter.'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(w => (
            <div key={w.id} className={`card flex items-center gap-4 ${w.active ? '' : 'opacity-60'}`}>
              {w.user_avatar ? (
                <img src={w.user_avatar} alt="" className="w-10 h-10 rounded-full" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-discord-dark" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{w.username}</span>
                  {!w.active && <span className="text-xs px-2 py-0.5 rounded bg-discord-dark text-discord-light">removed</span>}
                </div>
                <div className="text-sm text-discord-light break-words">{w.reason}</div>
                <div className="text-xs text-discord-light mt-1">
                  by {w.moderator_name} · {new Date(w.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
