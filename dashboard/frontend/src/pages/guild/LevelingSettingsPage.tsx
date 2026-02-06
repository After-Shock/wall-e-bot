import { useState } from 'react';
import { TrendingUp, Save, Hash, Volume2, Gift } from 'lucide-react';

export default function LevelingSettingsPage() {
  const [enabled, setEnabled] = useState(false);
  const [config, setConfig] = useState({
    xpPerMessage: 15,
    xpCooldown: 60,
    xpMultiplier: 1,
    announceChannel: '',
    announceMessage: '🎉 Congratulations {user}! You reached **Level {level}**!',
    stackRoles: true,
    removeOnLeave: false,
    ignoredChannels: [] as string[],
    ignoredRoles: [] as string[],
  });

  const updateConfig = (updates: Partial<typeof config>) => {
    setConfig(prev => ({ ...prev, ...updates }));
  };

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <TrendingUp className="w-8 h-8 text-green-400" />
          <div>
            <h1 className="text-2xl font-bold">Leveling Settings</h1>
            <p className="text-discord-light">Configure XP gain and level-up announcements</p>
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
            <h3 className="font-semibold">Enable Leveling System</h3>
            <p className="text-sm text-discord-light">
              Members earn XP by chatting and level up over time
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
          {/* XP Settings */}
          <div className="card space-y-4">
            <h3 className="font-semibold flex items-center gap-2">
              <Gift className="w-5 h-5 text-purple-400" />
              XP Settings
            </h3>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">XP Per Message</label>
                <input
                  type="number"
                  value={config.xpPerMessage}
                  onChange={e => updateConfig({ xpPerMessage: parseInt(e.target.value) || 0 })}
                  className="input w-full"
                  min="1"
                  max="100"
                />
                <p className="text-xs text-discord-light mt-1">Base XP earned per message</p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Cooldown (seconds)</label>
                <input
                  type="number"
                  value={config.xpCooldown}
                  onChange={e => updateConfig({ xpCooldown: parseInt(e.target.value) || 0 })}
                  className="input w-full"
                  min="0"
                  max="3600"
                />
                <p className="text-xs text-discord-light mt-1">Time between XP gains</p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">XP Multiplier</label>
                <select
                  value={config.xpMultiplier}
                  onChange={e => updateConfig({ xpMultiplier: parseFloat(e.target.value) })}
                  className="input w-full"
                >
                  <option value="0.5">0.5x (Half)</option>
                  <option value="1">1x (Normal)</option>
                  <option value="1.5">1.5x</option>
                  <option value="2">2x (Double)</option>
                  <option value="3">3x (Triple)</option>
                </select>
                <p className="text-xs text-discord-light mt-1">Server-wide multiplier</p>
              </div>
            </div>
          </div>

          {/* Level-Up Announcements */}
          <div className="card space-y-4">
            <h3 className="font-semibold flex items-center gap-2">
              <Volume2 className="w-5 h-5 text-blue-400" />
              Level-Up Announcements
            </h3>

            <div>
              <label className="block text-sm font-medium mb-2">Announcement Channel</label>
              <div className="relative">
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-discord-light" />
                <select
                  value={config.announceChannel}
                  onChange={e => updateConfig({ announceChannel: e.target.value })}
                  className="input w-full pl-9"
                >
                  <option value="">Same channel (where they leveled up)</option>
                  <option value="level-ups">level-ups</option>
                  <option value="general">general</option>
                  <option value="bot-commands">bot-commands</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Announcement Message</label>
              <textarea
                value={config.announceMessage}
                onChange={e => updateConfig({ announceMessage: e.target.value })}
                className="input w-full h-24 resize-none"
                placeholder="Congratulations {user}!"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="text-xs bg-discord-dark px-2 py-1 rounded">{'{user}'} - Mention</span>
                <span className="text-xs bg-discord-dark px-2 py-1 rounded">{'{username}'} - Name</span>
                <span className="text-xs bg-discord-dark px-2 py-1 rounded">{'{level}'} - New level</span>
                <span className="text-xs bg-discord-dark px-2 py-1 rounded">{'{xp}'} - Total XP</span>
              </div>
            </div>
          </div>

          {/* Role Behavior */}
          <div className="card space-y-4">
            <h3 className="font-semibold">Role Behavior</h3>

            <div className="space-y-3">
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <p className="font-medium">Stack Role Rewards</p>
                  <p className="text-sm text-discord-light">
                    Keep previous level roles when earning new ones
                  </p>
                </div>
                <button
                  onClick={() => updateConfig({ stackRoles: !config.stackRoles })}
                  className={`relative w-10 h-5 rounded-full transition-colors ${
                    config.stackRoles ? 'bg-green-500' : 'bg-discord-dark'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                      config.stackRoles ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </label>

              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <p className="font-medium">Remove XP on Leave</p>
                  <p className="text-sm text-discord-light">
                    Delete member's XP when they leave the server
                  </p>
                </div>
                <button
                  onClick={() => updateConfig({ removeOnLeave: !config.removeOnLeave })}
                  className={`relative w-10 h-5 rounded-full transition-colors ${
                    config.removeOnLeave ? 'bg-green-500' : 'bg-discord-dark'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                      config.removeOnLeave ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </label>
            </div>
          </div>

          {/* Ignored Channels/Roles */}
          <div className="card space-y-4">
            <h3 className="font-semibold">Exclusions</h3>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Ignored Channels</label>
                <select className="input w-full" multiple size={4}>
                  <option value="bot-commands">bot-commands</option>
                  <option value="spam">spam</option>
                  <option value="memes">memes</option>
                </select>
                <p className="text-xs text-discord-light mt-1">
                  No XP gained in these channels
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Ignored Roles</label>
                <select className="input w-full" multiple size={4}>
                  <option value="muted">Muted</option>
                  <option value="bots">Bots</option>
                </select>
                <p className="text-xs text-discord-light mt-1">
                  Members with these roles don't gain XP
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
