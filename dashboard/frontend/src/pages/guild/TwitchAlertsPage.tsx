import { useState } from 'react';
import { Tv, Plus, Trash2, Save, Hash, ExternalLink } from 'lucide-react';

interface Streamer {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  isLive: boolean;
  lastStream?: string;
}

export default function TwitchAlertsPage() {
  const [enabled, setEnabled] = useState(false);
  const [config, setConfig] = useState({
    channelId: '',
    message: '🔴 **{streamer}** is now live on Twitch!\n{title}\n\n{url}',
    deleteAfterOffline: false,
    mentionRole: '',
  });
  const [streamers, setStreamers] = useState<Streamer[]>([
    { id: '1', username: 'streamer1', displayName: 'Streamer One', avatarUrl: '', isLive: true, lastStream: 'Playing Minecraft' },
    { id: '2', username: 'streamer2', displayName: 'Streamer Two', avatarUrl: '', isLive: false, lastStream: 'Just Chatting' },
  ]);
  const [newStreamer, setNewStreamer] = useState('');

  const updateConfig = (updates: Partial<typeof config>) => {
    setConfig(prev => ({ ...prev, ...updates }));
  };

  const addStreamer = () => {
    if (!newStreamer.trim()) return;
    setStreamers(prev => [...prev, {
      id: Date.now().toString(),
      username: newStreamer.toLowerCase(),
      displayName: newStreamer,
      avatarUrl: '',
      isLive: false,
    }]);
    setNewStreamer('');
  };

  const removeStreamer = (id: string) => {
    setStreamers(prev => prev.filter(s => s.id !== id));
  };

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Tv className="w-8 h-8 text-purple-400" />
          <div>
            <h1 className="text-2xl font-bold">Twitch Alerts</h1>
            <p className="text-discord-light">Get notified when streamers go live</p>
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
            <h3 className="font-semibold">Enable Twitch Alerts</h3>
            <p className="text-sm text-discord-light">
              Post notifications when tracked streamers go live
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
            <h3 className="font-semibold">Notification Settings</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Alert Channel</label>
                <div className="relative">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-discord-light" />
                  <select
                    value={config.channelId}
                    onChange={e => updateConfig({ channelId: e.target.value })}
                    className="input w-full pl-9"
                  >
                    <option value="">Select channel...</option>
                    <option value="streams">streams</option>
                    <option value="announcements">announcements</option>
                    <option value="media">media</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Mention Role</label>
                <select
                  value={config.mentionRole}
                  onChange={e => updateConfig({ mentionRole: e.target.value })}
                  className="input w-full"
                >
                  <option value="">No mention</option>
                  <option value="everyone">@everyone</option>
                  <option value="stream-notifications">Stream Notifications</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Alert Message</label>
              <textarea
                value={config.message}
                onChange={e => updateConfig({ message: e.target.value })}
                className="input w-full h-24 resize-none font-mono text-sm"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="text-xs bg-discord-dark px-2 py-1 rounded">{'{streamer}'}</span>
                <span className="text-xs bg-discord-dark px-2 py-1 rounded">{'{title}'}</span>
                <span className="text-xs bg-discord-dark px-2 py-1 rounded">{'{game}'}</span>
                <span className="text-xs bg-discord-dark px-2 py-1 rounded">{'{url}'}</span>
                <span className="text-xs bg-discord-dark px-2 py-1 rounded">{'{viewers}'}</span>
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.deleteAfterOffline}
                onChange={e => updateConfig({ deleteAfterOffline: e.target.checked })}
                className="w-4 h-4 rounded"
              />
              <span>Delete notification when stream ends</span>
            </label>
          </div>

          {/* Streamers */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Tracked Streamers ({streamers.length})</h3>
            </div>

            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={newStreamer}
                onChange={e => setNewStreamer(e.target.value)}
                placeholder="Enter Twitch username..."
                className="input flex-1"
                onKeyDown={e => e.key === 'Enter' && addStreamer()}
              />
              <button onClick={addStreamer} className="btn btn-secondary">
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {streamers.length === 0 ? (
              <div className="text-center py-8 text-discord-light">
                <Tv className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No streamers added</p>
                <p className="text-sm mt-1">Add Twitch usernames to track</p>
              </div>
            ) : (
              <div className="space-y-2">
                {streamers.map(streamer => (
                  <div
                    key={streamer.id}
                    className="flex items-center gap-4 bg-discord-dark rounded-lg p-3"
                  >
                    <div className="w-10 h-10 rounded-full bg-purple-500 flex items-center justify-center">
                      <Tv className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{streamer.displayName}</span>
                        {streamer.isLive && (
                          <span className="px-2 py-0.5 rounded text-xs bg-red-500 text-white animate-pulse">
                            LIVE
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-discord-light">
                        {streamer.isLive ? streamer.lastStream : `Last: ${streamer.lastStream || 'Never'}`}
                      </p>
                    </div>
                    <a
                      href={`https://twitch.tv/${streamer.username}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 text-discord-light hover:text-purple-400 transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                    <button
                      onClick={() => removeStreamer(streamer.id)}
                      className="p-2 text-discord-light hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
