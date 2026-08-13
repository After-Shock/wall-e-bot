import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Trophy, MessageSquare } from 'lucide-react';
import { api } from '../../services/api';

interface LeaderboardEntry {
  user_id: string;
  rank: number;
  username: string;
  avatar: string | null;
  level: number;
  xp: number;
  total_xp: number;
  message_count: number;
}

interface LeaderboardResponse {
  data: LeaderboardEntry[];
  total: number;
  page: number;
  limit: number;
}

const LIMIT = 50;
const rankColor = (rank: number) =>
  rank === 1 ? 'text-yellow-400' : rank === 2 ? 'text-gray-300' : rank === 3 ? 'text-amber-600' : 'text-discord-light';

export default function LeaderboardPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery<LeaderboardResponse>({
    queryKey: ['leaderboard', guildId, page],
    queryFn: () => api.get(`/api/guilds/${guildId}/leaderboard?page=${page}&limit=${LIMIT}`).then(r => r.data),
  });

  const rows = data?.data ?? [];
  const total = data?.total ?? 0;
  const maxPage = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <Trophy className="w-8 h-8 text-yellow-400" />
        <div>
          <h1 className="text-2xl font-bold">Leaderboard</h1>
          <p className="text-discord-light">{total} ranked member{total === 1 ? '' : 's'}</p>
        </div>
      </div>

      {isLoading ? null : rows.length === 0 ? (
        <div className="card text-center py-12 text-discord-light">
          <Trophy className="w-16 h-16 mx-auto mb-4 opacity-50" />
          <p>No ranked members yet. XP is earned as members chat.</p>
        </div>
      ) : (
        <div className="card divide-y divide-discord-dark">
          {rows.map(e => (
            <div key={e.user_id} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
              <div className={`w-8 text-center font-bold ${rankColor(e.rank)}`}>#{e.rank}</div>
              {e.avatar ? (
                <img src={e.avatar} alt="" className="w-10 h-10 rounded-full" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-discord-dark" />
              )}
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">{e.username}</div>
                <div className="flex items-center gap-3 text-xs text-discord-light">
                  <span>Level {e.level}</span>
                  <span>{e.total_xp.toLocaleString()} XP</span>
                  <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" />{e.message_count.toLocaleString()}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {maxPage > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="btn btn-secondary disabled:opacity-50">
            Previous
          </button>
          <span className="text-sm text-discord-light">Page {page} of {maxPage}</span>
          <button onClick={() => setPage(p => Math.min(maxPage, p + 1))} disabled={page >= maxPage} className="btn btn-secondary disabled:opacity-50">
            Next
          </button>
        </div>
      )}
    </div>
  );
}
