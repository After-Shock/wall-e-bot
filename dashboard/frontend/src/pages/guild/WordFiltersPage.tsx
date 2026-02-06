import { useState } from 'react';
import { Filter, Save, Plus, Trash2, AlertTriangle } from 'lucide-react';

interface WordFilter {
  id: string;
  pattern: string;
  isRegex: boolean;
  action: 'delete' | 'warn' | 'mute' | 'kick' | 'ban';
  enabled: boolean;
}

export default function WordFiltersPage() {
  const [enabled, setEnabled] = useState(true);
  const [filters, setFilters] = useState<WordFilter[]>([
    { id: '1', pattern: 'badword1', isRegex: false, action: 'delete', enabled: true },
    { id: '2', pattern: 'slur.*', isRegex: true, action: 'warn', enabled: true },
    { id: '3', pattern: 'spam phrase', isRegex: false, action: 'mute', enabled: false },
  ]);
  const [newFilter, setNewFilter] = useState({ pattern: '', isRegex: false, action: 'delete' as const });
  const [isAdding, setIsAdding] = useState(false);

  const addFilter = () => {
    if (!newFilter.pattern.trim()) return;
    setFilters(prev => [
      ...prev,
      {
        id: Date.now().toString(),
        pattern: newFilter.pattern,
        isRegex: newFilter.isRegex,
        action: newFilter.action,
        enabled: true,
      },
    ]);
    setNewFilter({ pattern: '', isRegex: false, action: 'delete' });
    setIsAdding(false);
  };

  const removeFilter = (id: string) => {
    setFilters(prev => prev.filter(f => f.id !== id));
  };

  const toggleFilter = (id: string) => {
    setFilters(prev => prev.map(f => f.id === id ? { ...f, enabled: !f.enabled } : f));
  };

  const getActionBadge = (action: string) => {
    const colors: Record<string, string> = {
      delete: 'bg-gray-500/20 text-gray-400',
      warn: 'bg-yellow-500/20 text-yellow-400',
      mute: 'bg-orange-500/20 text-orange-400',
      kick: 'bg-red-500/20 text-red-400',
      ban: 'bg-red-600/20 text-red-500',
    };
    return colors[action] || 'bg-gray-500/20 text-gray-400';
  };

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Filter className="w-8 h-8 text-purple-400" />
          <div>
            <h1 className="text-2xl font-bold">Word Filters</h1>
            <p className="text-discord-light">Block specific words and phrases</p>
          </div>
        </div>
        <button className="btn btn-primary flex items-center gap-2">
          <Save className="w-4 h-4" />
          Save Changes
        </button>
      </div>

      {/* Enable Toggle */}
      <div className="card">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Enable Word Filters</h3>
            <p className="text-sm text-discord-light">
              Automatically filter messages containing blocked words
            </p>
          </div>
          <button
            onClick={() => setEnabled(!enabled)}
            className={`relative w-12 h-6 rounded-full transition-colors ${
              enabled ? 'bg-discord-blurple' : 'bg-discord-dark'
            }`}
          >
            <span
              className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                enabled ? 'translate-x-7' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {enabled && (
        <>
          {/* Quick Add Preset */}
          <div className="card">
            <h3 className="font-semibold mb-3">Quick Add Presets</h3>
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-secondary btn-sm">+ Profanity Filter</button>
              <button className="btn btn-secondary btn-sm">+ Slurs</button>
              <button className="btn btn-secondary btn-sm">+ Spam Phrases</button>
              <button className="btn btn-secondary btn-sm">+ Zalgo Text</button>
              <button className="btn btn-secondary btn-sm">+ Discord Invites</button>
            </div>
          </div>

          {/* Filters List */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Custom Filters ({filters.length})</h3>
              <button
                onClick={() => setIsAdding(true)}
                className="btn btn-secondary flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Add Filter
              </button>
            </div>

            {isAdding && (
              <div className="bg-discord-dark rounded-lg p-4 mb-4">
                <div className="flex items-end gap-4">
                  <div className="flex-1">
                    <label className="block text-sm font-medium mb-2">Word/Pattern</label>
                    <input
                      type="text"
                      value={newFilter.pattern}
                      onChange={e => setNewFilter(prev => ({ ...prev, pattern: e.target.value }))}
                      className="input w-full"
                      placeholder="Enter word or regex pattern..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Type</label>
                    <select
                      value={newFilter.isRegex ? 'regex' : 'word'}
                      onChange={e => setNewFilter(prev => ({ ...prev, isRegex: e.target.value === 'regex' }))}
                      className="input"
                    >
                      <option value="word">Exact Word</option>
                      <option value="regex">Regex</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Action</label>
                    <select
                      value={newFilter.action}
                      onChange={e => setNewFilter(prev => ({ ...prev, action: e.target.value as any }))}
                      className="input"
                    >
                      <option value="delete">Delete</option>
                      <option value="warn">Warn</option>
                      <option value="mute">Mute</option>
                      <option value="kick">Kick</option>
                      <option value="ban">Ban</option>
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={addFilter} className="btn btn-primary">Add</button>
                    <button onClick={() => setIsAdding(false)} className="btn btn-secondary">Cancel</button>
                  </div>
                </div>
              </div>
            )}

            {filters.length === 0 ? (
              <div className="text-center py-12 text-discord-light">
                <Filter className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No word filters configured</p>
                <p className="text-sm mt-1">Add filters to block specific words or phrases</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filters.map(filter => (
                  <div
                    key={filter.id}
                    className={`flex items-center gap-4 bg-discord-dark rounded-lg p-3 ${
                      !filter.enabled ? 'opacity-50' : ''
                    }`}
                  >
                    <button
                      onClick={() => toggleFilter(filter.id)}
                      className={`relative w-10 h-5 rounded-full transition-colors ${
                        filter.enabled ? 'bg-green-500' : 'bg-gray-600'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                          filter.enabled ? 'translate-x-5' : 'translate-x-0.5'
                        }`}
                      />
                    </button>

                    <code className="flex-1 bg-discord-darker px-3 py-1 rounded font-mono text-sm">
                      {filter.pattern}
                    </code>

                    {filter.isRegex && (
                      <span className="px-2 py-0.5 rounded text-xs bg-purple-500/20 text-purple-400">
                        Regex
                      </span>
                    )}

                    <span className={`px-2 py-0.5 rounded text-xs capitalize ${getActionBadge(filter.action)}`}>
                      {filter.action}
                    </span>

                    <button
                      onClick={() => removeFilter(filter.id)}
                      className="p-2 text-discord-light hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Warning */}
          <div className="bg-yellow-500/10 border border-yellow-500/50 rounded-lg p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-yellow-400">Regex Patterns</p>
              <p className="text-sm text-discord-light mt-1">
                Be careful with regex patterns - poorly written patterns can cause performance issues
                or block unintended content. Test your patterns before enabling them.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
