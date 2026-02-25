import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { ArrowLeft, Save, Shield, Star, MessageSquare, Bot, Settings, Loader2, Image } from 'lucide-react';
import { useState } from 'react';

interface ModulesConfig {
  moderation: boolean;
  automod: boolean;
  leveling: boolean;
  welcome: boolean;
  logging: boolean;
  reactionRoles: boolean;
  customCommands: boolean;
}

interface GuildConfig {
  guild_id: string;
  config: {
    prefix: string;
    modules: ModulesConfig;
    welcome: {
      enabled: boolean;
      channelId?: string;
      message: string;
    };
    leveling: {
      enabled: boolean;
      xpPerMessage: { min: number; max: number };
    };
  };
}

interface ConfigUpdate {
  prefix?: string;
  modules?: Partial<ModulesConfig>;
  welcome?: Partial<GuildConfig['config']['welcome']>;
  leveling?: Partial<GuildConfig['config']['leveling']>;
}

export default function GuildPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('general');

  const { data: config, isLoading } = useQuery({
    queryKey: ['guild', guildId],
    queryFn: async () => {
      const response = await api.get<GuildConfig>(`/api/guilds/${guildId}`);
      return response.data;
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (updates: ConfigUpdate) => {
      await api.patch(`/api/guilds/${guildId}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guild', guildId] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-discord-blurple"></div>
      </div>
    );
  }

  const tabs = [
    { id: 'general', label: 'General', icon: Settings },
    { id: 'moderation', label: 'Moderation', icon: Shield },
    { id: 'leveling', label: 'Leveling', icon: Star },
    { id: 'welcome', label: 'Welcome', icon: MessageSquare },
    { id: 'customization', label: 'Customization', icon: Bot },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-8">
        <Link to="/dashboard" className="flex items-center gap-2 text-discord-light hover:text-white mb-4">
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </Link>
        <h1 className="text-3xl font-bold">Server Settings</h1>
      </div>

      <div className="flex gap-6">
        {/* Sidebar */}
        <div className="w-64 shrink-0">
          <nav className="space-y-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  activeTab === tab.id
                    ? 'bg-discord-blurple text-white'
                    : 'text-discord-light hover:bg-discord-dark hover:text-white'
                }`}
              >
                <tab.icon className="w-5 h-5" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1">
          <div className="card">
            {activeTab === 'general' && (
              <div>
                <h2 className="text-xl font-semibold mb-6">General Settings</h2>
                
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium mb-2">Bot Prefix</label>
                    <input
                      type="text"
                      className="input max-w-xs"
                      defaultValue={config?.config?.prefix || '!'}
                      placeholder="!"
                    />
                    <p className="text-sm text-discord-light mt-1">
                      Prefix for text commands (slash commands are always available)
                    </p>
                  </div>

                  <div>
                    <h3 className="font-medium mb-4">Enabled Modules</h3>
                    <div className="space-y-3">
                      {Object.entries(config?.config?.modules || {}).map(([key, enabled]) => (
                        <label key={key} className="flex items-center justify-between">
                          <span className="capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
                          <button
                            className={`toggle ${enabled ? 'toggle-enabled' : 'toggle-disabled'}`}
                            onClick={() => {
                              updateMutation.mutate({
                                modules: {
                                  ...config?.config?.modules,
                                  [key]: !enabled,
                                },
                              });
                            }}
                          >
                            <span className={`toggle-dot ${enabled ? 'translate-x-5' : 'translate-x-1'}`} />
                          </button>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'moderation' && (
              <div>
                <h2 className="text-xl font-semibold mb-6">Moderation Settings</h2>
                <p className="text-discord-light">
                  Configure auto-moderation, warning thresholds, and mod log channels.
                </p>
                {/* Add moderation settings here */}
              </div>
            )}

            {activeTab === 'leveling' && (
              <div>
                <h2 className="text-xl font-semibold mb-6">Leveling Settings</h2>
                <p className="text-discord-light">
                  Configure XP rates, level-up messages, and role rewards.
                </p>
                {/* Add leveling settings here */}
              </div>
            )}

            {activeTab === 'welcome' && (
              <div>
                <h2 className="text-xl font-semibold mb-6">Welcome Messages</h2>
                <p className="text-discord-light">
                  Configure welcome and leave messages for your server.
                </p>
                {/* Add welcome settings here */}
              </div>
            )}

            {activeTab === 'customization' && (
              <CustomizationTab guildId={guildId!} />
            )}

            <div className="mt-8 pt-6 border-t border-discord-darker flex justify-end">
              <button
                className="btn btn-primary flex items-center gap-2"
                onClick={() => {
                  // Save changes
                }}
              >
                <Save className="w-4 h-4" />
                Save Changes
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Customization Tab ────────────────────────────────────────────────────────

function CustomizationTab({ guildId }: { guildId: string }) {
  const [nickname, setNickname] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [nickSaving, setNickSaving] = useState(false);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [nickMsg, setNickMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [avatarMsg, setAvatarMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const saveNickname = async () => {
    setNickSaving(true);
    setNickMsg(null);
    try {
      await api.patch(`/api/bot/guilds/${guildId}/nickname`, { nickname });
      setNickMsg({ type: 'success', text: nickname ? `Nickname set to "${nickname}"` : 'Nickname cleared' });
    } catch (e: any) {
      setNickMsg({ type: 'error', text: e?.response?.data?.error || 'Failed to update nickname' });
    } finally {
      setNickSaving(false);
    }
  };

  const saveAvatar = async () => {
    if (!avatarUrl.trim()) return;
    setAvatarSaving(true);
    setAvatarMsg(null);
    try {
      await api.patch('/api/bot/avatar', { imageUrl: avatarUrl });
      setAvatarMsg({ type: 'success', text: 'Avatar updated! Changes may take a moment to appear.' });
      setAvatarUrl('');
    } catch (e: any) {
      setAvatarMsg({ type: 'error', text: e?.response?.data?.error || 'Failed to update avatar' });
    } finally {
      setAvatarSaving(false);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-semibold mb-6">Bot Customization</h2>
      <div className="space-y-8">

        {/* Nickname */}
        <div>
          <label className="block text-sm font-medium mb-2">Server Nickname</label>
          <div className="flex items-center gap-3 max-w-sm">
            <input
              type="text"
              value={nickname}
              onChange={e => setNickname(e.target.value)}
              className="input flex-1"
              placeholder="Wall-E"
              maxLength={32}
            />
            <button
              onClick={saveNickname}
              disabled={nickSaving}
              className="btn btn-primary flex items-center gap-2 shrink-0"
            >
              {nickSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save
            </button>
          </div>
          <p className="text-sm text-discord-light mt-1">
            Changes the bot's name only in this server. Leave blank to clear the nickname.
          </p>
          {nickMsg && (
            <p className={`text-sm mt-2 ${nickMsg.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
              {nickMsg.text}
            </p>
          )}
        </div>

        {/* Avatar */}
        <div>
          <label className="block text-sm font-medium mb-2 flex items-center gap-2">
            <Image className="w-4 h-4" />
            Bot Avatar
            <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded">Global — applies to all servers</span>
          </label>
          <div className="flex items-center gap-3 max-w-lg">
            <input
              type="url"
              value={avatarUrl}
              onChange={e => setAvatarUrl(e.target.value)}
              className="input flex-1"
              placeholder="https://example.com/avatar.png"
            />
            <button
              onClick={saveAvatar}
              disabled={avatarSaving || !avatarUrl.trim()}
              className="btn btn-primary flex items-center gap-2 shrink-0"
            >
              {avatarSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Apply
            </button>
          </div>
          <p className="text-sm text-discord-light mt-1">
            Paste a direct link to a PNG, JPG, or GIF (max 8MB). Discord rate-limits avatar changes to ~2 per hour.
          </p>
          {avatarMsg && (
            <p className={`text-sm mt-2 ${avatarMsg.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
              {avatarMsg.text}
            </p>
          )}
        </div>

      </div>
    </div>
  );
}
