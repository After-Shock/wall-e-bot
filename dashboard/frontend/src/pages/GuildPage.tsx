import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { ArrowLeft, Save, Shield, Star, MessageSquare, Bot, Settings } from 'lucide-react';
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
              <div>
                <h2 className="text-xl font-semibold mb-6">Bot Customization</h2>
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium mb-2">Bot Nickname</label>
                    <input
                      type="text"
                      className="input max-w-xs"
                      placeholder="Wall-E"
                    />
                    <p className="text-sm text-discord-light mt-1">
                      Customize the bot&apos;s nickname in this server
                    </p>
                  </div>
                </div>
              </div>
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
