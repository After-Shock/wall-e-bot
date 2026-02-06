import { useState } from 'react';
import { AlertTriangle, Search, Plus, Trash2, User, Clock, Save } from 'lucide-react';

interface Warning {
  id: string;
  caseId: number;
  userId: string;
  username: string;
  moderatorId: string;
  moderatorName: string;
  reason: string;
  timestamp: Date;
  active: boolean;
}

export default function WarningsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [thresholds, setThresholds] = useState({
    muteAt: 3,
    kickAt: 5,
    banAt: 7,
  });

  const warnings: Warning[] = [
    { id: '1', caseId: 42, userId: '1', username: 'User1', moderatorId: 'm1', moderatorName: 'Admin', reason: 'Spamming in general', timestamp: new Date(Date.now() - 86400000), active: true },
    { id: '2', caseId: 41, userId: '1', username: 'User1', moderatorId: 'm2', moderatorName: 'Mod', reason: 'NSFW content', timestamp: new Date(Date.now() - 172800000), active: true },
    { id: '3', caseId: 40, userId: '2', username: 'User2', moderatorId: 'm1', moderatorName: 'Admin', reason: 'Harassing other members', timestamp: new Date(Date.now() - 259200000), active: true },
    { id: '4', caseId: 39, userId: '3', username: 'User3', moderatorId: 'm1', moderatorName: 'Admin', reason: 'Self-promotion', timestamp: new Date(Date.now() - 604800000), active: false },
  ];

  const getUserWarningCount = (userId: string) => 
    warnings.filter(w => w.userId === userId && w.active).length;

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const filteredWarnings = warnings.filter(w => {
    const matchesSearch = w.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      w.reason.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesActive = showInactive || w.active;
    return matchesSearch && matchesActive;
  });

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-8 h-8 text-yellow-400" />
          <div>
            <h1 className="text-2xl font-bold">Warnings</h1>
            <p className="text-discord-light">Manage member warnings and thresholds</p>
          </div>
        </div>
        <button className="btn btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Issue Warning
        </button>
      </div>

      {/* Threshold Settings */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Warning Thresholds</h3>
          <button className="btn btn-secondary btn-sm flex items-center gap-2">
            <Save className="w-3 h-3" />
            Save
          </button>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Mute at</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={thresholds.muteAt}
                onChange={e => setThresholds(prev => ({ ...prev, muteAt: parseInt(e.target.value) || 0 }))}
                className="input w-20"
                min="0"
              />
              <span className="text-discord-light">warnings</span>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Kick at</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={thresholds.kickAt}
                onChange={e => setThresholds(prev => ({ ...prev, kickAt: parseInt(e.target.value) || 0 }))}
                className="input w-20"
                min="0"
              />
              <span className="text-discord-light">warnings</span>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Ban at</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={thresholds.banAt}
                onChange={e => setThresholds(prev => ({ ...prev, banAt: parseInt(e.target.value) || 0 }))}
                className="input w-20"
                min="0"
              />
              <span className="text-discord-light">warnings</span>
            </div>
          </div>
        </div>
        <p className="text-xs text-discord-light mt-3">Set to 0 to disable automatic action</p>
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
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={e => setShowInactive(e.target.checked)}
              className="w-4 h-4 rounded"
            />
            <span className="text-sm">Show revoked</span>
          </label>
        </div>
      </div>

      {/* Warnings List */}
      <div className="card p-0">
        {filteredWarnings.length === 0 ? (
          <div className="text-center py-12 text-discord-light">
            <AlertTriangle className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No warnings found</p>
          </div>
        ) : (
          <div className="divide-y divide-discord-dark">
            {filteredWarnings.map(warning => (
              <div
                key={warning.id}
                className={`p-4 ${!warning.active ? 'opacity-50' : ''}`}
              >
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-discord-blurple flex items-center justify-center text-sm font-bold shrink-0">
                    {warning.username[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold">{warning.username}</span>
                      <span className="text-xs text-discord-light">Case #{warning.caseId}</span>
                      {!warning.active && (
                        <span className="px-2 py-0.5 rounded text-xs bg-gray-500/20 text-gray-400">
                          Revoked
                        </span>
                      )}
                      {warning.active && getUserWarningCount(warning.userId) >= thresholds.muteAt && (
                        <span className="px-2 py-0.5 rounded text-xs bg-yellow-500/20 text-yellow-400">
                          {getUserWarningCount(warning.userId)} active
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-discord-light">{warning.reason}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-discord-light">
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        by {warning.moderatorName}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDate(warning.timestamp)}
                      </span>
                    </div>
                  </div>
                  {warning.active && (
                    <button className="p-2 text-discord-light hover:text-red-400 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
