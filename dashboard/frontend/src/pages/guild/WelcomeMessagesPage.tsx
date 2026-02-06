import { useState } from 'react';
import { MessageSquare, Save, Hash, Eye, Info } from 'lucide-react';

interface WelcomeConfig {
  enabled: boolean;
  channelId: string;
  message: string;
  embedEnabled: boolean;
  embed: {
    title: string;
    description: string;
    color: string;
    thumbnail: boolean;
    footer: string;
  };
}

const defaultConfig: WelcomeConfig = {
  enabled: false,
  channelId: '',
  message: 'Welcome to the server, {user}! 🎉',
  embedEnabled: true,
  embed: {
    title: 'Welcome!',
    description: 'Welcome to **{server}**, {user}!\n\nYou are member #{memberCount}.',
    color: '#5865F2',
    thumbnail: true,
    footer: 'Enjoy your stay!',
  },
};

const variables = [
  { name: '{user}', description: 'Mentions the user' },
  { name: '{username}', description: 'Username without mention' },
  { name: '{server}', description: 'Server name' },
  { name: '{memberCount}', description: 'Total member count' },
  { name: '{user.avatar}', description: 'User avatar URL' },
  { name: '{user.id}', description: 'User ID' },
];

export default function WelcomeMessagesPage() {
  const [activeTab, setActiveTab] = useState<'welcome' | 'farewell' | 'ban'>('welcome');
  const [config, setConfig] = useState<WelcomeConfig>(defaultConfig);
  const [showPreview, setShowPreview] = useState(false);

  const updateConfig = (updates: Partial<WelcomeConfig>) => {
    setConfig(prev => ({ ...prev, ...updates }));
  };

  const updateEmbed = (updates: Partial<WelcomeConfig['embed']>) => {
    setConfig(prev => ({
      ...prev,
      embed: { ...prev.embed, ...updates },
    }));
  };

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <MessageSquare className="w-8 h-8 text-discord-blurple" />
          <div>
            <h1 className="text-2xl font-bold">Welcome Messages</h1>
            <p className="text-discord-light">Configure messages for new members, departures, and bans</p>
          </div>
        </div>
        <button className="btn btn-primary flex items-center gap-2">
          <Save className="w-4 h-4" />
          Save Changes
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-discord-dark pb-2">
        {[
          { id: 'welcome', label: 'Welcome Message' },
          { id: 'farewell', label: 'Farewell Message' },
          { id: 'ban', label: 'Ban Message' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={`px-4 py-2 rounded-t-lg transition-colors ${
              activeTab === tab.id
                ? 'bg-discord-blurple text-white'
                : 'text-discord-light hover:text-white hover:bg-discord-dark'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Enable Toggle */}
      <div className="card">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Enable {activeTab === 'welcome' ? 'Welcome' : activeTab === 'farewell' ? 'Farewell' : 'Ban'} Messages</h3>
            <p className="text-sm text-discord-light">
              Send a message when a member {activeTab === 'welcome' ? 'joins' : activeTab === 'farewell' ? 'leaves' : 'is banned from'} the server
            </p>
          </div>
          <button
            onClick={() => updateConfig({ enabled: !config.enabled })}
            className={`relative w-12 h-6 rounded-full transition-colors ${
              config.enabled ? 'bg-discord-blurple' : 'bg-discord-dark'
            }`}
          >
            <span
              className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                config.enabled ? 'translate-x-7' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {config.enabled && (
        <>
          {/* Channel Selector */}
          <div className="card">
            <label className="block text-sm font-medium mb-2">Channel</label>
            <div className="relative">
              <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-discord-light" />
              <select
                value={config.channelId}
                onChange={e => updateConfig({ channelId: e.target.value })}
                className="input pl-9 w-full"
              >
                <option value="">Select a channel...</option>
                <option value="welcome">welcome</option>
                <option value="general">general</option>
                <option value="arrivals">arrivals</option>
              </select>
            </div>
            <p className="text-sm text-discord-light mt-2">
              The channel where {activeTab} messages will be sent
            </p>
          </div>

          {/* Message Type */}
          <div className="card">
            <label className="block text-sm font-medium mb-4">Message Type</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={!config.embedEnabled}
                  onChange={() => updateConfig({ embedEnabled: false })}
                  className="w-4 h-4 text-discord-blurple"
                />
                <span>Plain Text</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={config.embedEnabled}
                  onChange={() => updateConfig({ embedEnabled: true })}
                  className="w-4 h-4 text-discord-blurple"
                />
                <span>Embed</span>
              </label>
            </div>
          </div>

          {/* Message Content */}
          {!config.embedEnabled ? (
            <div className="card">
              <label className="block text-sm font-medium mb-2">Message</label>
              <textarea
                value={config.message}
                onChange={e => updateConfig({ message: e.target.value })}
                className="input w-full h-32 resize-none"
                placeholder="Enter your welcome message..."
              />
            </div>
          ) : (
            <div className="card space-y-4">
              <h3 className="font-semibold">Embed Editor</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Title</label>
                  <input
                    type="text"
                    value={config.embed.title}
                    onChange={e => updateEmbed({ title: e.target.value })}
                    className="input w-full"
                    placeholder="Embed title..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Color</label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={config.embed.color}
                      onChange={e => updateEmbed({ color: e.target.value })}
                      className="w-10 h-10 rounded cursor-pointer"
                    />
                    <input
                      type="text"
                      value={config.embed.color}
                      onChange={e => updateEmbed({ color: e.target.value })}
                      className="input flex-1"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Description</label>
                <textarea
                  value={config.embed.description}
                  onChange={e => updateEmbed({ description: e.target.value })}
                  className="input w-full h-24 resize-none"
                  placeholder="Embed description..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Footer</label>
                  <input
                    type="text"
                    value={config.embed.footer}
                    onChange={e => updateEmbed({ footer: e.target.value })}
                    className="input w-full"
                    placeholder="Footer text..."
                  />
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <input
                    type="checkbox"
                    checked={config.embed.thumbnail}
                    onChange={e => updateEmbed({ thumbnail: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <label className="text-sm">Show user avatar as thumbnail</label>
                </div>
              </div>
            </div>
          )}

          {/* Variables Reference */}
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <Info className="w-4 h-4 text-discord-blurple" />
              <h3 className="font-semibold">Available Variables</h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {variables.map(v => (
                <div key={v.name} className="bg-discord-dark rounded px-3 py-2">
                  <code className="text-discord-blurple text-sm">{v.name}</code>
                  <p className="text-xs text-discord-light">{v.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Preview</h3>
              <button
                onClick={() => setShowPreview(!showPreview)}
                className="btn btn-secondary flex items-center gap-2"
              >
                <Eye className="w-4 h-4" />
                {showPreview ? 'Hide' : 'Show'} Preview
              </button>
            </div>
            
            {showPreview && (
              <div className="bg-discord-dark rounded-lg p-4">
                {config.embedEnabled ? (
                  <div className="flex gap-4">
                    <div
                      className="w-1 rounded-full"
                      style={{ backgroundColor: config.embed.color }}
                    />
                    <div className="flex-1">
                      {config.embed.title && (
                        <h4 className="font-semibold mb-2">{config.embed.title}</h4>
                      )}
                      <p className="text-sm whitespace-pre-wrap">
                        {config.embed.description
                          .replace('{user}', '@NewUser')
                          .replace('{server}', 'Your Server')
                          .replace('{memberCount}', '1,234')}
                      </p>
                      {config.embed.footer && (
                        <p className="text-xs text-discord-light mt-3">{config.embed.footer}</p>
                      )}
                    </div>
                    {config.embed.thumbnail && (
                      <div className="w-16 h-16 bg-discord-darker rounded-full" />
                    )}
                  </div>
                ) : (
                  <p>
                    {config.message
                      .replace('{user}', '@NewUser')
                      .replace('{server}', 'Your Server')}
                  </p>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
