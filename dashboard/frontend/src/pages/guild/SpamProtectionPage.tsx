import { useState } from 'react';
import { Zap, Save, Hash } from 'lucide-react';

export default function SpamProtectionPage() {
  const [enabled, setEnabled] = useState(false);
  const [config, setConfig] = useState({
    messageLimit: 5,
    timeWindow: 5,
    duplicateThreshold: 3,
    mentionLimit: 5,
    emojiLimit: 10,
    newlineLimit: 10,
    capsPercentage: 70,
    action: 'mute',
    muteDuration: 5,
    deleteMessages: true,
    logChannel: '',
    ignoredRoles: [] as string[],
    ignoredChannels: [] as string[],
  });

  const updateConfig = (updates: Partial<typeof config>) => {
    setConfig(prev => ({ ...prev, ...updates }));
  };

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Zap className="w-8 h-8 text-yellow-400" />
          <div>
            <h1 className="text-2xl font-bold">Spam Protection</h1>
            <p className="text-discord-light">Automatically detect and handle spam messages</p>
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
            <h3 className="font-semibold">Enable Spam Protection</h3>
            <p className="text-sm text-discord-light">
              Automatically detect and take action on spam messages
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
          {/* Rate Limiting */}
          <div className="card space-y-4">
            <h3 className="font-semibold">Rate Limiting</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Message Limit</label>
                <input
                  type="number"
                  value={config.messageLimit}
                  onChange={e => updateConfig({ messageLimit: parseInt(e.target.value) || 1 })}
                  className="input w-full"
                  min="2"
                  max="20"
                />
                <p className="text-xs text-discord-light mt-1">
                  Max messages before triggering
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Time Window (seconds)</label>
                <input
                  type="number"
                  value={config.timeWindow}
                  onChange={e => updateConfig({ timeWindow: parseInt(e.target.value) || 1 })}
                  className="input w-full"
                  min="1"
                  max="60"
                />
                <p className="text-xs text-discord-light mt-1">
                  Time period to count messages
                </p>
              </div>
            </div>
          </div>

          {/* Content Filters */}
          <div className="card space-y-4">
            <h3 className="font-semibold">Content Filters</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Duplicate Threshold</label>
                <input
                  type="number"
                  value={config.duplicateThreshold}
                  onChange={e => updateConfig({ duplicateThreshold: parseInt(e.target.value) || 1 })}
                  className="input w-full"
                  min="2"
                  max="10"
                />
                <p className="text-xs text-discord-light mt-1">
                  Identical messages before action
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Mention Limit</label>
                <input
                  type="number"
                  value={config.mentionLimit}
                  onChange={e => updateConfig({ mentionLimit: parseInt(e.target.value) || 0 })}
                  className="input w-full"
                  min="0"
                  max="50"
                />
                <p className="text-xs text-discord-light mt-1">
                  Max mentions per message (0 = disabled)
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Emoji Limit</label>
                <input
                  type="number"
                  value={config.emojiLimit}
                  onChange={e => updateConfig({ emojiLimit: parseInt(e.target.value) || 0 })}
                  className="input w-full"
                  min="0"
                  max="100"
                />
                <p className="text-xs text-discord-light mt-1">
                  Max emojis per message (0 = disabled)
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Newline Limit</label>
                <input
                  type="number"
                  value={config.newlineLimit}
                  onChange={e => updateConfig({ newlineLimit: parseInt(e.target.value) || 0 })}
                  className="input w-full"
                  min="0"
                  max="50"
                />
                <p className="text-xs text-discord-light mt-1">
                  Max newlines per message (0 = disabled)
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Caps Percentage</label>
                <input
                  type="number"
                  value={config.capsPercentage}
                  onChange={e => updateConfig({ capsPercentage: parseInt(e.target.value) || 0 })}
                  className="input w-full"
                  min="0"
                  max="100"
                />
                <p className="text-xs text-discord-light mt-1">
                  Max % of caps allowed (0 = disabled)
                </p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="card space-y-4">
            <h3 className="font-semibold">Actions</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Action to Take</label>
                <select
                  value={config.action}
                  onChange={e => updateConfig({ action: e.target.value })}
                  className="input w-full"
                >
                  <option value="warn">Warn</option>
                  <option value="mute">Mute</option>
                  <option value="kick">Kick</option>
                  <option value="ban">Ban</option>
                </select>
              </div>
              {config.action === 'mute' && (
                <div>
                  <label className="block text-sm font-medium mb-2">Mute Duration (minutes)</label>
                  <input
                    type="number"
                    value={config.muteDuration}
                    onChange={e => updateConfig({ muteDuration: parseInt(e.target.value) || 1 })}
                    className="input w-full"
                    min="1"
                    max="10080"
                  />
                </div>
              )}
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.deleteMessages}
                onChange={e => updateConfig({ deleteMessages: e.target.checked })}
                className="w-4 h-4 rounded"
              />
              <span>Delete spam messages</span>
            </label>
          </div>

          {/* Logging */}
          <div className="card space-y-4">
            <h3 className="font-semibold">Logging</h3>
            <div>
              <label className="block text-sm font-medium mb-2">Log Channel</label>
              <div className="relative">
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-discord-light" />
                <select
                  value={config.logChannel}
                  onChange={e => updateConfig({ logChannel: e.target.value })}
                  className="input w-full pl-9"
                >
                  <option value="">No logging</option>
                  <option value="mod-log">mod-log</option>
                  <option value="spam-log">spam-log</option>
                  <option value="bot-log">bot-log</option>
                </select>
              </div>
            </div>
          </div>

          {/* Exclusions */}
          <div className="card space-y-4">
            <h3 className="font-semibold">Exclusions</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Ignored Roles</label>
                <select className="input w-full" multiple size={4}>
                  <option value="admin">Admin</option>
                  <option value="moderator">Moderator</option>
                  <option value="trusted">Trusted</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Ignored Channels</label>
                <select className="input w-full" multiple size={4}>
                  <option value="spam">spam</option>
                  <option value="bot-commands">bot-commands</option>
                </select>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
