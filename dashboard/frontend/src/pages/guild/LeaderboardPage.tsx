import { useState } from 'react';
import { Trophy, Search, Download, RefreshCw, Crown, Medal } from 'lucide-react';

interface LeaderboardEntry {
  rank: number;
  id: string;
  username: string;
  discriminator: string;
  avatar: string;
  level: number;
  xp: number;
  messages: number;
}

export default function LeaderboardPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [timeframe, setTimeframe] = useState<'all' | 'month' | 'week'>('all');

  // Mock data
  const leaderboard: LeaderboardEntry[] = [
    { rank: 1, id: '1', username: 'TopChatter', discriminator: '0001', avatar: '', level: 52, xp: 125000, messages: 8432 },
    { rank: 2, id: '2', username: 'ActiveUser', discriminator: '1234', avatar: '', level: 48, xp: 98000, messages: 6521 },
    { rank: 3, id: '3', username: 'RegularMember', discriminator: '5678', avatar: '', level: 45, xp: 87500, messages: 5890 },
    { rank: 4, id: '4', username: 'ChatEnjoyer', discriminator: '9012', avatar: '', level: 42, xp: 76000, messages: 5124 },
    { rank: 5, id: '5', username: 'ServerFan', discriminator: '3456', avatar: '', level: 38, xp: 62000, messages: 4231 },
    { rank: 6, id: '6', username: 'NightOwl', discriminator: '7890', avatar: '', level: 35, xp: 54000, messages: 3654 },
    { rank: 7, id: '7', username: 'Contributor', discriminator: '2345', avatar: '', level: 32, xp: 45000, messages: 3012 },
    { rank: 8, id: '8', username: 'Newcomer', discriminator: '6789', avatar: '', level: 28, xp: 35000, messages: 2341 },
    { rank: 9, id: '9', username: 'CasualUser', discriminator: '0123', avatar: '', level: 25, xp: 28000, messages: 1890 },
    { rank: 10, id: '10', username: 'Lurker', discriminator: '4567', avatar: '', level: 22, xp: 22000, messages: 1456 },
  ];

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Crown className="w-5 h-5 text-yellow-400" />;
      case 2:
        return <Medal className="w-5 h-5 text-gray-300" />;
      case 3:
        return <Medal className="w-5 h-5 text-amber-600" />;
      default:
        return <span className="w-5 text-center font-bold text-discord-light">#{rank}</span>;
    }
  };

  const getRankBg = (rank: number) => {
    switch (rank) {
      case 1:
        return 'bg-gradient-to-r from-yellow-500/20 to-transparent border-l-2 border-yellow-400';
      case 2:
        return 'bg-gradient-to-r from-gray-400/20 to-transparent border-l-2 border-gray-300';
      case 3:
        return 'bg-gradient-to-r from-amber-600/20 to-transparent border-l-2 border-amber-600';
      default:
        return 'bg-discord-dark';
    }
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  const filteredLeaderboard = leaderboard.filter(entry =>
    entry.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Trophy className="w-8 h-8 text-yellow-400" />
          <div>
            <h1 className="text-2xl font-bold">Leaderboard</h1>
            <p className="text-discord-light">View server rankings and member statistics</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn btn-secondary flex items-center gap-2">
            <Download className="w-4 h-4" />
            Export
          </button>
          <button className="btn btn-secondary flex items-center gap-2">
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-4 gap-4">
        <div className="card text-center">
          <p className="text-3xl font-bold">1,234</p>
          <p className="text-sm text-discord-light">Total Members</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold">52</p>
          <p className="text-sm text-discord-light">Highest Level</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold">1.2M</p>
          <p className="text-sm text-discord-light">Total XP Earned</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold">85K</p>
          <p className="text-sm text-discord-light">Messages This Month</p>
        </div>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-discord-light" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search members..."
              className="input w-full pl-9"
            />
          </div>
          <div className="flex rounded-lg overflow-hidden">
            {(['all', 'month', 'week'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTimeframe(t)}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  timeframe === t
                    ? 'bg-discord-blurple text-white'
                    : 'bg-discord-dark text-discord-light hover:bg-discord-darker'
                }`}
              >
                {t === 'all' ? 'All Time' : t === 'month' ? 'This Month' : 'This Week'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Leaderboard */}
      <div className="card p-0 overflow-hidden">
        <div className="space-y-1 p-2">
          {filteredLeaderboard.map(entry => (
            <div
              key={entry.id}
              className={`flex items-center gap-4 rounded-lg p-3 ${getRankBg(entry.rank)}`}
            >
              <div className="w-8 flex justify-center">{getRankIcon(entry.rank)}</div>

              <div className="w-10 h-10 rounded-full bg-discord-blurple flex items-center justify-center text-sm font-bold">
                {entry.username[0].toUpperCase()}
              </div>

              <div className="flex-1">
                <p className="font-semibold">{entry.username}</p>
                <p className="text-xs text-discord-light">
                  Level {entry.level} • {formatNumber(entry.xp)} XP
                </p>
              </div>

              <div className="text-right">
                <p className="font-semibold">{formatNumber(entry.messages)}</p>
                <p className="text-xs text-discord-light">messages</p>
              </div>

              {/* XP Progress to next level */}
              <div className="w-32">
                <div className="h-2 bg-discord-dark rounded-full overflow-hidden">
                  <div
                    className="h-full bg-discord-blurple rounded-full"
                    style={{ width: `${(entry.xp % 1000) / 10}%` }}
                  />
                </div>
                <p className="text-xs text-discord-light text-center mt-1">
                  {entry.xp % 1000}/1000 XP
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Pagination */}
        <div className="border-t border-discord-dark p-4 flex items-center justify-between">
          <p className="text-sm text-discord-light">
            Showing 1-10 of 1,234 members
          </p>
          <div className="flex gap-2">
            <button className="btn btn-secondary" disabled>
              Previous
            </button>
            <button className="btn btn-secondary">Next</button>
          </div>
        </div>
      </div>
    </div>
  );
}
