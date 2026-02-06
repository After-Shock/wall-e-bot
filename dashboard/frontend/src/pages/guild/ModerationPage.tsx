import { useState } from 'react';
import { Shield, Search, Filter, User, Clock, AlertTriangle, Ban, MessageSquareOff } from 'lucide-react';

interface ModAction {
  id: string;
  type: 'warn' | 'mute' | 'kick' | 'ban' | 'unban' | 'unmute';
  targetId: string;
  targetName: string;
  moderatorId: string;
  moderatorName: string;
  reason: string;
  timestamp: Date;
  duration?: number;
}

export default function ModerationPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');

  const modActions: ModAction[] = [
    { id: '1', type: 'ban', targetId: '1', targetName: 'Spammer123', moderatorId: 'm1', moderatorName: 'Admin', reason: 'Spam and advertising', timestamp: new Date(Date.now() - 3600000) },
    { id: '2', type: 'warn', targetId: '2', targetName: 'RuleBreaker', moderatorId: 'm1', moderatorName: 'Admin', reason: 'NSFW content in general', timestamp: new Date(Date.now() - 7200000) },
    { id: '3', type: 'mute', targetId: '3', targetName: 'LoudUser', moderatorId: 'm2', moderatorName: 'Moderator', reason: 'Excessive caps and spam', timestamp: new Date(Date.now() - 10800000), duration: 3600 },
    { id: '4', type: 'kick', targetId: '4', targetName: 'TrollAccount', moderatorId: 'm1', moderatorName: 'Admin', reason: 'Trolling members', timestamp: new Date(Date.now() - 86400000) },
    { id: '5', type: 'unmute', targetId: '3', targetName: 'LoudUser', moderatorId: 'm2', moderatorName: 'Moderator', reason: 'Mute expired', timestamp: new Date(Date.now() - 7200000) },
  ];

  const getActionIcon = (type: string) => {
    switch (type) {
      case 'ban': return <Ban className="w-4 h-4 text-red-400" />;
      case 'unban': return <Ban className="w-4 h-4 text-green-400" />;
      case 'kick': return <User className="w-4 h-4 text-orange-400" />;
      case 'warn': return <AlertTriangle className="w-4 h-4 text-yellow-400" />;
      case 'mute': return <MessageSquareOff className="w-4 h-4 text-gray-400" />;
      case 'unmute': return <MessageSquareOff className="w-4 h-4 text-green-400" />;
      default: return <Shield className="w-4 h-4" />;
    }
  };

  const getActionColor = (type: string) => {
    switch (type) {
      case 'ban': return 'bg-red-500/20 text-red-400 border-red-500/50';
      case 'unban': return 'bg-green-500/20 text-green-400 border-green-500/50';
      case 'kick': return 'bg-orange-500/20 text-orange-400 border-orange-500/50';
      case 'warn': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
      case 'mute': return 'bg-gray-500/20 text-gray-400 border-gray-500/50';
      case 'unmute': return 'bg-green-500/20 text-green-400 border-green-500/50';
      default: return 'bg-discord-dark';
    }
  };

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  };

  const filteredActions = modActions.filter(action => {
    const matchesSearch = action.targetName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      action.reason.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filterType === 'all' || action.type === filterType;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Shield className="w-8 h-8 text-red-400" />
        <div>
          <h1 className="text-2xl font-bold">Moderation Log</h1>
          <p className="text-discord-light">View recent moderation actions taken in this server</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-5 gap-4">
        {['ban', 'kick', 'mute', 'warn', 'unban'].map(type => {
          const count = modActions.filter(a => a.type === type).length;
          return (
            <div key={type} className="card text-center">
              <div className="flex justify-center mb-2">{getActionIcon(type)}</div>
              <p className="text-2xl font-bold">{count}</p>
              <p className="text-xs text-discord-light capitalize">{type}s</p>
            </div>
          );
        })}
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
              placeholder="Search by user or reason..."
              className="input w-full pl-9"
            />
          </div>
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-discord-light" />
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
              className="input pl-9 pr-8"
            >
              <option value="all">All Actions</option>
              <option value="ban">Bans</option>
              <option value="kick">Kicks</option>
              <option value="mute">Mutes</option>
              <option value="warn">Warnings</option>
            </select>
          </div>
        </div>
      </div>

      {/* Action Log */}
      <div className="card p-0">
        <div className="divide-y divide-discord-dark">
          {filteredActions.length === 0 ? (
            <div className="text-center py-12 text-discord-light">
              <Shield className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No moderation actions found</p>
            </div>
          ) : (
            filteredActions.map(action => (
              <div key={action.id} className="p-4 hover:bg-discord-dark/50 transition-colors">
                <div className="flex items-start gap-4">
                  <div className={`p-2 rounded-lg border ${getActionColor(action.type)}`}>
                    {getActionIcon(action.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium uppercase ${getActionColor(action.type)}`}>
                        {action.type}
                      </span>
                      <span className="font-semibold">{action.targetName}</span>
                    </div>
                    <p className="text-sm text-discord-light truncate">{action.reason}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-discord-light">
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        by {action.moderatorName}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatTime(action.timestamp)}
                      </span>
                      {action.duration && (
                        <span>Duration: {action.duration / 60}m</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
