import { useState } from 'react';
import { Lightbulb, Save, Hash, ThumbsUp, ThumbsDown, Check, X } from 'lucide-react';

interface Suggestion {
  id: string;
  authorId: string;
  authorName: string;
  content: string;
  status: 'pending' | 'approved' | 'denied' | 'implemented';
  upvotes: number;
  downvotes: number;
  createdAt: Date;
}

export default function SuggestionsPage() {
  const [enabled, setEnabled] = useState(false);
  const [config, setConfig] = useState({
    channelId: '',
    reviewChannelId: '',
    upvoteEmoji: '👍',
    downvoteEmoji: '👎',
    requireApproval: true,
    anonymousSuggestions: false,
    cooldown: 60,
  });

  const [suggestions] = useState<Suggestion[]>([
    { id: '1', authorId: '1', authorName: 'User1', content: 'Add more music channels for different genres', status: 'approved', upvotes: 45, downvotes: 3, createdAt: new Date(Date.now() - 86400000) },
    { id: '2', authorId: '2', authorName: 'User2', content: 'Weekly movie night events', status: 'pending', upvotes: 32, downvotes: 8, createdAt: new Date(Date.now() - 172800000) },
    { id: '3', authorId: '3', authorName: 'User3', content: 'Add a suggestion cooldown', status: 'implemented', upvotes: 28, downvotes: 2, createdAt: new Date(Date.now() - 604800000) },
    { id: '4', authorId: '4', authorName: 'User4', content: 'Remove the memes channel', status: 'denied', upvotes: 5, downvotes: 42, createdAt: new Date(Date.now() - 259200000) },
  ]);

  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'denied' | 'implemented'>('all');

  const updateConfig = (updates: Partial<typeof config>) => {
    setConfig(prev => ({ ...prev, ...updates }));
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: 'bg-yellow-500/20 text-yellow-400',
      approved: 'bg-green-500/20 text-green-400',
      denied: 'bg-red-500/20 text-red-400',
      implemented: 'bg-discord-blurple/20 text-discord-blurple',
    };
    return styles[status] || 'bg-gray-500/20 text-gray-400';
  };

  const filteredSuggestions = filter === 'all'
    ? suggestions
    : suggestions.filter(s => s.status === filter);

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Lightbulb className="w-8 h-8 text-yellow-400" />
          <div>
            <h1 className="text-2xl font-bold">Suggestions</h1>
            <p className="text-discord-light">Let members submit and vote on ideas</p>
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
            <h3 className="font-semibold">Enable Suggestions</h3>
            <p className="text-sm text-discord-light">
              Allow members to submit suggestions via command
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
          {/* Settings */}
          <div className="card space-y-4">
            <h3 className="font-semibold">Settings</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Suggestions Channel</label>
                <div className="relative">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-discord-light" />
                  <select
                    value={config.channelId}
                    onChange={e => updateConfig({ channelId: e.target.value })}
                    className="input w-full pl-9"
                  >
                    <option value="">Select channel...</option>
                    <option value="suggestions">suggestions</option>
                    <option value="ideas">ideas</option>
                    <option value="feedback">feedback</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Review Channel (Staff)</label>
                <div className="relative">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-discord-light" />
                  <select
                    value={config.reviewChannelId}
                    onChange={e => updateConfig({ reviewChannelId: e.target.value })}
                    className="input w-full pl-9"
                  >
                    <option value="">No review channel</option>
                    <option value="suggestion-review">suggestion-review</option>
                    <option value="staff-chat">staff-chat</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Upvote Emoji</label>
                <select
                  value={config.upvoteEmoji}
                  onChange={e => updateConfig({ upvoteEmoji: e.target.value })}
                  className="input w-full"
                >
                  <option value="👍">👍</option>
                  <option value="✅">✅</option>
                  <option value="⬆️">⬆️</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Downvote Emoji</label>
                <select
                  value={config.downvoteEmoji}
                  onChange={e => updateConfig({ downvoteEmoji: e.target.value })}
                  className="input w-full"
                >
                  <option value="👎">👎</option>
                  <option value="❌">❌</option>
                  <option value="⬇️">⬇️</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Cooldown (min)</label>
                <input
                  type="number"
                  value={config.cooldown}
                  onChange={e => updateConfig({ cooldown: parseInt(e.target.value) || 0 })}
                  className="input w-full"
                  min="0"
                />
              </div>
            </div>

            <div className="space-y-3">
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <p className="font-medium">Require Staff Approval</p>
                  <p className="text-sm text-discord-light">Suggestions must be approved before posting</p>
                </div>
                <button
                  onClick={() => updateConfig({ requireApproval: !config.requireApproval })}
                  className={`relative w-10 h-5 rounded-full transition-colors ${
                    config.requireApproval ? 'bg-green-500' : 'bg-discord-dark'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                      config.requireApproval ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </label>
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <p className="font-medium">Anonymous Suggestions</p>
                  <p className="text-sm text-discord-light">Hide author names from public view</p>
                </div>
                <button
                  onClick={() => updateConfig({ anonymousSuggestions: !config.anonymousSuggestions })}
                  className={`relative w-10 h-5 rounded-full transition-colors ${
                    config.anonymousSuggestions ? 'bg-green-500' : 'bg-discord-dark'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                      config.anonymousSuggestions ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </label>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-4">
            <div className="card text-center">
              <p className="text-3xl font-bold">{suggestions.length}</p>
              <p className="text-sm text-discord-light">Total</p>
            </div>
            <div className="card text-center">
              <p className="text-3xl font-bold text-yellow-400">{suggestions.filter(s => s.status === 'pending').length}</p>
              <p className="text-sm text-discord-light">Pending</p>
            </div>
            <div className="card text-center">
              <p className="text-3xl font-bold text-green-400">{suggestions.filter(s => s.status === 'approved').length}</p>
              <p className="text-sm text-discord-light">Approved</p>
            </div>
            <div className="card text-center">
              <p className="text-3xl font-bold text-discord-blurple">{suggestions.filter(s => s.status === 'implemented').length}</p>
              <p className="text-sm text-discord-light">Implemented</p>
            </div>
          </div>

          {/* Filter */}
          <div className="flex gap-2">
            {(['all', 'pending', 'approved', 'denied', 'implemented'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
                  filter === f ? 'bg-discord-blurple text-white' : 'bg-discord-dark text-discord-light hover:bg-discord-darker'
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          {/* Suggestions List */}
          <div className="space-y-3">
            {filteredSuggestions.map(suggestion => (
              <div key={suggestion.id} className="card">
                <div className="flex items-start gap-4">
                  <div className="flex flex-col items-center gap-1 bg-discord-dark rounded-lg p-2 min-w-[60px]">
                    <ThumbsUp className="w-4 h-4 text-green-400" />
                    <span className="font-bold text-green-400">{suggestion.upvotes}</span>
                    <span className="font-bold text-red-400">{suggestion.downvotes}</span>
                    <ThumbsDown className="w-4 h-4 text-red-400" />
                  </div>
                  
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`px-2 py-0.5 rounded text-xs capitalize ${getStatusBadge(suggestion.status)}`}>
                        {suggestion.status}
                      </span>
                      <span className="text-sm text-discord-light">by {suggestion.authorName}</span>
                    </div>
                    <p>{suggestion.content}</p>
                  </div>

                  {suggestion.status === 'pending' && (
                    <div className="flex gap-2">
                      <button className="p-2 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30">
                        <Check className="w-4 h-4" />
                      </button>
                      <button className="p-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
