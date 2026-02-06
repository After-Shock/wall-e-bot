import { useState } from 'react';
import { Link2, Save, Plus, Trash2, Hash, Shield } from 'lucide-react';

export default function LinkProtectionPage() {
  const [enabled, setEnabled] = useState(false);
  const [config, setConfig] = useState({
    blockAll: false,
    allowDiscord: true,
    allowImages: true,
    allowYoutube: true,
    allowTwitch: true,
    allowTwitter: true,
    blockInvites: true,
    blockIpGrabbers: true,
    action: 'delete',
    logChannel: '',
  });
  const [whitelist, setWhitelist] = useState(['example.com', 'trusted-site.org']);
  const [blacklist, setBlacklist] = useState(['malicious.com', 'phishing.net']);
  const [newWhitelist, setNewWhitelist] = useState('');
  const [newBlacklist, setNewBlacklist] = useState('');

  const updateConfig = (updates: Partial<typeof config>) => {
    setConfig(prev => ({ ...prev, ...updates }));
  };

  const addToWhitelist = () => {
    if (!newWhitelist.trim()) return;
    setWhitelist(prev => [...prev, newWhitelist.trim()]);
    setNewWhitelist('');
  };

  const addToBlacklist = () => {
    if (!newBlacklist.trim()) return;
    setBlacklist(prev => [...prev, newBlacklist.trim()]);
    setNewBlacklist('');
  };

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link2 className="w-8 h-8 text-blue-400" />
          <div>
            <h1 className="text-2xl font-bold">Link Protection</h1>
            <p className="text-discord-light">Control which links can be posted</p>
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
            <h3 className="font-semibold">Enable Link Protection</h3>
            <p className="text-sm text-discord-light">
              Automatically filter or delete messages containing links
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
          {/* Mode */}
          <div className="card space-y-4">
            <h3 className="font-semibold">Link Mode</h3>
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="mode"
                  checked={!config.blockAll}
                  onChange={() => updateConfig({ blockAll: false })}
                  className="w-4 h-4"
                />
                <div>
                  <p className="font-medium">Whitelist Mode</p>
                  <p className="text-sm text-discord-light">Block all links except whitelisted domains</p>
                </div>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="mode"
                  checked={config.blockAll}
                  onChange={() => updateConfig({ blockAll: true })}
                  className="w-4 h-4"
                />
                <div>
                  <p className="font-medium">Blacklist Mode</p>
                  <p className="text-sm text-discord-light">Allow all links except blacklisted domains</p>
                </div>
              </label>
            </div>
          </div>

          {/* Allowed Platforms */}
          <div className="card space-y-4">
            <h3 className="font-semibold">Always Allow</h3>
            <div className="grid grid-cols-3 gap-4">
              {[
                { key: 'allowDiscord', label: 'Discord Links' },
                { key: 'allowImages', label: 'Image Links' },
                { key: 'allowYoutube', label: 'YouTube' },
                { key: 'allowTwitch', label: 'Twitch' },
                { key: 'allowTwitter', label: 'Twitter/X' },
              ].map(item => (
                <label key={item.key} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config[item.key as keyof typeof config] as boolean}
                    onChange={e => updateConfig({ [item.key]: e.target.checked })}
                    className="w-4 h-4 rounded"
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Security */}
          <div className="card space-y-4">
            <h3 className="font-semibold flex items-center gap-2">
              <Shield className="w-5 h-5 text-green-400" />
              Security
            </h3>
            <div className="space-y-3">
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <p className="font-medium">Block Discord Invites</p>
                  <p className="text-sm text-discord-light">Block discord.gg and other invite links</p>
                </div>
                <button
                  onClick={() => updateConfig({ blockInvites: !config.blockInvites })}
                  className={`relative w-10 h-5 rounded-full transition-colors ${
                    config.blockInvites ? 'bg-green-500' : 'bg-discord-dark'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                      config.blockInvites ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </label>
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <p className="font-medium">Block IP Grabbers</p>
                  <p className="text-sm text-discord-light">Block known IP logger and grabber sites</p>
                </div>
                <button
                  onClick={() => updateConfig({ blockIpGrabbers: !config.blockIpGrabbers })}
                  className={`relative w-10 h-5 rounded-full transition-colors ${
                    config.blockIpGrabbers ? 'bg-green-500' : 'bg-discord-dark'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                      config.blockIpGrabbers ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </label>
            </div>
          </div>

          {/* Whitelist */}
          <div className="card space-y-4">
            <h3 className="font-semibold text-green-400">Whitelisted Domains</h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={newWhitelist}
                onChange={e => setNewWhitelist(e.target.value)}
                placeholder="example.com"
                className="input flex-1"
                onKeyDown={e => e.key === 'Enter' && addToWhitelist()}
              />
              <button onClick={addToWhitelist} className="btn btn-secondary">
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {whitelist.map(domain => (
                <span
                  key={domain}
                  className="flex items-center gap-2 bg-green-500/20 text-green-400 px-3 py-1 rounded-full text-sm"
                >
                  {domain}
                  <button
                    onClick={() => setWhitelist(prev => prev.filter(d => d !== domain))}
                    className="hover:text-white"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Blacklist */}
          <div className="card space-y-4">
            <h3 className="font-semibold text-red-400">Blacklisted Domains</h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={newBlacklist}
                onChange={e => setNewBlacklist(e.target.value)}
                placeholder="malicious.com"
                className="input flex-1"
                onKeyDown={e => e.key === 'Enter' && addToBlacklist()}
              />
              <button onClick={addToBlacklist} className="btn btn-secondary">
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {blacklist.map(domain => (
                <span
                  key={domain}
                  className="flex items-center gap-2 bg-red-500/20 text-red-400 px-3 py-1 rounded-full text-sm"
                >
                  {domain}
                  <button
                    onClick={() => setBlacklist(prev => prev.filter(d => d !== domain))}
                    className="hover:text-white"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Action */}
          <div className="card space-y-4">
            <h3 className="font-semibold">Action & Logging</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Action</label>
                <select
                  value={config.action}
                  onChange={e => updateConfig({ action: e.target.value })}
                  className="input w-full"
                >
                  <option value="delete">Delete Message</option>
                  <option value="warn">Warn User</option>
                  <option value="mute">Mute User</option>
                  <option value="kick">Kick User</option>
                  <option value="ban">Ban User</option>
                </select>
              </div>
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
                    <option value="link-log">link-log</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
