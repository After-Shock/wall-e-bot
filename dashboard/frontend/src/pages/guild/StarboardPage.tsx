import { useState } from 'react';
import { Star, Save, Hash, Image } from 'lucide-react';

export default function StarboardPage() {
  const [enabled, setEnabled] = useState(false);
  const [config, setConfig] = useState({
    channelId: '',
    emoji: '⭐',
    threshold: 3,
    selfStar: false,
    ignoreBots: true,
    ignoreNsfw: true,
    embedColor: '#FFD700',
  });

  const updateConfig = (updates: Partial<typeof config>) => {
    setConfig(prev => ({ ...prev, ...updates }));
  };

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Star className="w-8 h-8 text-yellow-400" />
          <div>
            <h1 className="text-2xl font-bold">Starboard</h1>
            <p className="text-discord-light">Highlight popular messages with star reactions</p>
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
            <h3 className="font-semibold">Enable Starboard</h3>
            <p className="text-sm text-discord-light">
              Messages that receive enough star reactions will be posted to the starboard channel
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
          {/* Basic Settings */}
          <div className="card space-y-4">
            <h3 className="font-semibold">Basic Settings</h3>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Starboard Channel</label>
                <div className="relative">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-discord-light" />
                  <select
                    value={config.channelId}
                    onChange={e => updateConfig({ channelId: e.target.value })}
                    className="input w-full pl-9"
                  >
                    <option value="">Select channel...</option>
                    <option value="starboard">starboard</option>
                    <option value="hall-of-fame">hall-of-fame</option>
                    <option value="best-of">best-of</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Star Emoji</label>
                <select
                  value={config.emoji}
                  onChange={e => updateConfig({ emoji: e.target.value })}
                  className="input w-full"
                >
                  <option value="⭐">⭐ Star</option>
                  <option value="🌟">🌟 Glowing Star</option>
                  <option value="✨">✨ Sparkles</option>
                  <option value="💫">💫 Dizzy</option>
                  <option value="🔥">🔥 Fire</option>
                  <option value="❤️">❤️ Heart</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Minimum Stars Required
                </label>
                <input
                  type="number"
                  value={config.threshold}
                  onChange={e => updateConfig({ threshold: parseInt(e.target.value) || 1 })}
                  className="input w-full"
                  min="1"
                  max="100"
                />
                <p className="text-xs text-discord-light mt-1">
                  Messages need at least {config.threshold} {config.emoji} reactions
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Embed Color</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={config.embedColor}
                    onChange={e => updateConfig({ embedColor: e.target.value })}
                    className="w-10 h-10 rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={config.embedColor}
                    onChange={e => updateConfig({ embedColor: e.target.value })}
                    className="input flex-1"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Behavior Settings */}
          <div className="card space-y-4">
            <h3 className="font-semibold">Behavior</h3>

            <div className="space-y-3">
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <p className="font-medium">Allow Self-Starring</p>
                  <p className="text-sm text-discord-light">
                    Users can star their own messages
                  </p>
                </div>
                <button
                  onClick={() => updateConfig({ selfStar: !config.selfStar })}
                  className={`relative w-10 h-5 rounded-full transition-colors ${
                    config.selfStar ? 'bg-green-500' : 'bg-discord-dark'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                      config.selfStar ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </label>

              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <p className="font-medium">Ignore Bot Messages</p>
                  <p className="text-sm text-discord-light">
                    Bot messages won't be added to starboard
                  </p>
                </div>
                <button
                  onClick={() => updateConfig({ ignoreBots: !config.ignoreBots })}
                  className={`relative w-10 h-5 rounded-full transition-colors ${
                    config.ignoreBots ? 'bg-green-500' : 'bg-discord-dark'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                      config.ignoreBots ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </label>

              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <p className="font-medium">Ignore NSFW Channels</p>
                  <p className="text-sm text-discord-light">
                    Messages from NSFW channels won't be starred
                  </p>
                </div>
                <button
                  onClick={() => updateConfig({ ignoreNsfw: !config.ignoreNsfw })}
                  className={`relative w-10 h-5 rounded-full transition-colors ${
                    config.ignoreNsfw ? 'bg-green-500' : 'bg-discord-dark'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                      config.ignoreNsfw ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </label>
            </div>
          </div>

          {/* Preview */}
          <div className="card">
            <h3 className="font-semibold mb-4">Preview</h3>
            <div className="bg-discord-dark rounded-lg p-4">
              <div className="flex gap-4">
                <div
                  className="w-1 rounded-full shrink-0"
                  style={{ backgroundColor: config.embedColor }}
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">{config.emoji}</span>
                    <span className="font-semibold text-yellow-400">{config.threshold}</span>
                    <span className="text-discord-light">|</span>
                    <Hash className="w-4 h-4 text-discord-light" />
                    <span className="text-discord-light">general</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-discord-blurple" />
                    <div>
                      <span className="font-semibold">Username</span>
                      <p className="text-sm text-discord-light mt-1">
                        This is an example message that reached the starboard! ⭐
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <Image className="w-4 h-4 text-discord-light" />
                    <span className="text-xs text-discord-blurple">Jump to message</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
