import { useState } from 'react';
import { Clock, Search, Plus, Ban, RefreshCw, User } from 'lucide-react';

interface TempBan {
  id: string;
  userId: string;
  username: string;
  moderatorId: string;
  moderatorName: string;
  reason: string;
  startedAt: Date;
  expiresAt: Date;
}

export default function TempBansPage() {
  const [searchQuery, setSearchQuery] = useState('');

  const tempBans: TempBan[] = [
    { id: '1', userId: '1', username: 'Spammer123', moderatorId: 'm1', moderatorName: 'Admin', reason: 'Spam and advertising', startedAt: new Date(Date.now() - 86400000), expiresAt: new Date(Date.now() + 604800000) },
    { id: '2', userId: '2', username: 'RuleBreaker', moderatorId: 'm1', moderatorName: 'Admin', reason: 'Repeated rule violations', startedAt: new Date(Date.now() - 172800000), expiresAt: new Date(Date.now() + 432000000) },
    { id: '3', userId: '3', username: 'ToxicUser', moderatorId: 'm2', moderatorName: 'Moderator', reason: 'Toxic behavior', startedAt: new Date(Date.now() - 3600000), expiresAt: new Date(Date.now() + 82800000) },
  ];

  const getTimeRemaining = (expiresAt: Date) => {
    const diff = expiresAt.getTime() - Date.now();
    if (diff <= 0) return 'Expired';
    
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    
    if (days > 0) return `${days}d ${hours}h remaining`;
    if (hours > 0) return `${hours}h ${minutes}m remaining`;
    return `${minutes}m remaining`;
  };

  const getProgress = (startedAt: Date, expiresAt: Date) => {
    const total = expiresAt.getTime() - startedAt.getTime();
    const elapsed = Date.now() - startedAt.getTime();
    return Math.min(100, Math.max(0, (elapsed / total) * 100));
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const filteredBans = tempBans.filter(ban =>
    ban.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
    ban.reason.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Clock className="w-8 h-8 text-orange-400" />
          <div>
            <h1 className="text-2xl font-bold">Temporary Bans</h1>
            <p className="text-discord-light">Manage time-limited bans</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn btn-secondary flex items-center gap-2">
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <button className="btn btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Add Temp Ban
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card text-center">
          <p className="text-3xl font-bold text-orange-400">{tempBans.length}</p>
          <p className="text-sm text-discord-light">Active Temp Bans</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold text-yellow-400">
            {tempBans.filter(b => getProgress(b.startedAt, b.expiresAt) > 75).length}
          </p>
          <p className="text-sm text-discord-light">Expiring Soon</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold">156</p>
          <p className="text-sm text-discord-light">Total This Month</p>
        </div>
      </div>

      {/* Search */}
      <div className="card">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-discord-light" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by user or reason..."
            className="input w-full pl-9"
          />
        </div>
      </div>

      {/* Temp Bans List */}
      <div className="space-y-4">
        {filteredBans.length === 0 ? (
          <div className="card text-center py-12 text-discord-light">
            <Ban className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No active temporary bans</p>
          </div>
        ) : (
          filteredBans.map(ban => (
            <div key={ban.id} className="card">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center text-red-400 shrink-0">
                  <Ban className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className="font-semibold text-lg">{ban.username}</span>
                      <span className="text-discord-light text-sm ml-2">({ban.userId})</span>
                    </div>
                    <div className="flex gap-2">
                      <button className="btn btn-secondary btn-sm">Unban</button>
                      <button className="btn btn-secondary btn-sm">Extend</button>
                    </div>
                  </div>
                  
                  <p className="text-discord-light mb-3">{ban.reason}</p>
                  
                  {/* Progress Bar */}
                  <div className="mb-2">
                    <div className="h-2 bg-discord-dark rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-orange-500 to-red-500 rounded-full transition-all"
                        style={{ width: `${getProgress(ban.startedAt, ban.expiresAt)}%` }}
                      />
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-discord-light">
                      Started: {formatDate(ban.startedAt)}
                    </span>
                    <span className={`font-medium ${
                      getProgress(ban.startedAt, ban.expiresAt) > 75 ? 'text-yellow-400' : 'text-green-400'
                    }`}>
                      {getTimeRemaining(ban.expiresAt)}
                    </span>
                    <span className="text-discord-light">
                      Expires: {formatDate(ban.expiresAt)}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-1 mt-2 text-xs text-discord-light">
                    <User className="w-3 h-3" />
                    Banned by {ban.moderatorName}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
