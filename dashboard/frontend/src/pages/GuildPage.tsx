import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { ArrowLeft, Save, Shield, Star, MessageSquare, Bot, Settings, Loader2, Image, Activity } from 'lucide-react';
import { useState, useEffect } from 'react';

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
    { id: 'access', label: 'Access', icon: Shield },
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

      <div className="flex flex-col md:flex-row gap-6">
        {/* Sidebar */}
        <div className="w-full md:w-56 shrink-0">
          <nav className="flex md:flex-col gap-1 overflow-x-auto pb-1 md:pb-0">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3 md:px-4 py-2 md:py-3 rounded-lg transition-colors whitespace-nowrap shrink-0 md:w-full ${
                  activeTab === tab.id
                    ? 'bg-discord-blurple text-white'
                    : 'text-discord-light hover:bg-discord-dark hover:text-white'
                }`}
              >
                <tab.icon className="w-4 h-4 md:w-5 md:h-5" />
                <span className="text-sm">{tab.label}</span>
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

            {activeTab === 'access' && (
              <DashboardAccessTab guildId={guildId!} />
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
  const [activityType, setActivityType] = useState('PLAYING');
  const [activityText, setActivityText] = useState('');
  const [nickSaving, setNickSaving] = useState(false);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [activitySaving, setActivitySaving] = useState(false);
  const [nickMsg, setNickMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [avatarMsg, setAvatarMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [activityMsg, setActivityMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    api.get('/api/bot/activity').then(r => {
      setActivityType(r.data.type || 'PLAYING');
      setActivityText(r.data.text || '');
    }).catch(() => {});
  }, []);

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

  const saveActivity = async () => {
    setActivitySaving(true);
    setActivityMsg(null);
    try {
      await api.patch('/api/bot/activity', { type: activityType, text: activityText });
      setActivityMsg({ type: 'success', text: 'Activity updated! The bot will apply it within a minute.' });
    } catch (e: any) {
      setActivityMsg({ type: 'error', text: e?.response?.data?.error || 'Failed to update activity' });
    } finally {
      setActivitySaving(false);
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

        {/* Activity Status */}
        <div>
          <label className="block text-sm font-medium mb-2 flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Bot Activity Status
            <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded">Global — applies to all servers</span>
          </label>
          <div className="flex items-center gap-3 max-w-lg">
            <select
              value={activityType}
              onChange={e => setActivityType(e.target.value)}
              className="input w-36 shrink-0"
            >
              <option value="PLAYING">Playing</option>
              <option value="WATCHING">Watching</option>
              <option value="LISTENING">Listening to</option>
              <option value="COMPETING">Competing in</option>
            </select>
            <input
              type="text"
              value={activityText}
              onChange={e => setActivityText(e.target.value)}
              className="input flex-1"
              placeholder="your server"
              maxLength={128}
            />
            <button
              onClick={saveActivity}
              disabled={activitySaving}
              className="btn btn-primary flex items-center gap-2 shrink-0"
            >
              {activitySaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save
            </button>
          </div>
          <p className="text-sm text-discord-light mt-1">
            Sets the bot's status line (e.g. "Playing your server"). Leave text blank to clear.
          </p>
          {activityMsg && (
            <p className={`text-sm mt-2 ${activityMsg.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
              {activityMsg.text}
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

// ─── Dashboard Access Tab ─────────────────────────────────────────────────────

interface DashboardRole {
  roleId: string;
  roleName: string;
}

interface GuildRole {
  id: string;
  name: string;
  color: number;
}

function DashboardAccessTab({ guildId }: { guildId: string }) {
  const queryClient = useQueryClient();
  const [addingRoleId, setAddingRoleId] = useState('');

  const { data: configuredRoles = [], isLoading: rolesLoading } = useQuery({
    queryKey: ['dashboard-roles', guildId],
    queryFn: async () => {
      const r = await api.get<DashboardRole[]>(`/api/guilds/${guildId}/dashboard-roles`);
      return r.data;
    },
  });

  const { data: guildRoles = [], isError: rolesError } = useQuery({
    queryKey: ['guild-roles', guildId],
    queryFn: async () => {
      const r = await api.get<GuildRole[]>(`/api/guilds/${guildId}/roles`);
      return r.data;
    },
  });

  const addMutation = useMutation({
    mutationFn: (roleId: string) => api.post(`/api/guilds/${guildId}/dashboard-roles`, { roleId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-roles', guildId] });
      setAddingRoleId('');
    },
  });

  const removeMutation = useMutation({
    mutationFn: (roleId: string) => api.delete(`/api/guilds/${guildId}/dashboard-roles/${roleId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-roles', guildId] });
    },
  });

  const configuredIds = new Set(configuredRoles.map(r => r.roleId));
  const availableRoles = guildRoles.filter(r => !configuredIds.has(r.id));

  function roleColor(color: number): string {
    return color === 0 ? '#b5bac1' : '#' + color.toString(16).padStart(6, '0');
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-2">Dashboard Access</h2>
      <p className="text-discord-light text-sm mb-6">
        Members with these roles can access this server's dashboard with full permissions.
      </p>

      {rolesLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-discord-light" />
        </div>
      ) : (
        <div className="space-y-4">
          {configuredRoles.length === 0 ? (
            <p className="text-discord-light text-sm">
              No roles configured. Only server admins can access the dashboard.
            </p>
          ) : (
            <div className="space-y-2">
              {configuredRoles.map(role => (
                <div key={role.roleId} className="flex items-center justify-between p-3 bg-discord-darker rounded-lg">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: roleColor(guildRoles.find(r => r.id === role.roleId)?.color ?? 0) }}
                    />
                    <span className="text-sm font-medium">{role.roleName}</span>
                  </div>
                  <button
                    onClick={() => removeMutation.mutate(role.roleId)}
                    disabled={removeMutation.isPending}
                    className="text-red-400 hover:text-red-300 text-sm transition-colors"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            {rolesError ? (
              <input
                type="text"
                value={addingRoleId}
                onChange={e => setAddingRoleId(e.target.value)}
                placeholder="Enter role ID…"
                className="input flex-1"
              />
            ) : guildRoles.length === 0 ? (
              <input
                type="text"
                value={addingRoleId}
                onChange={e => setAddingRoleId(e.target.value)}
                placeholder="Enter role ID…"
                className="input flex-1"
              />
            ) : availableRoles.length === 0 ? (
              <p className="text-discord-light text-sm self-center">All roles have been added.</p>
            ) : (
              <select
                value={addingRoleId}
                onChange={e => setAddingRoleId(e.target.value)}
                className="input flex-1"
              >
                <option value="">Select a role…</option>
                {availableRoles.map(role => (
                  <option key={role.id} value={role.id}>{role.name}</option>
                ))}
              </select>
            )}
            {(!rolesError && guildRoles.length > 0 && availableRoles.length === 0) ? null : (
              <button
                onClick={() => addingRoleId && addMutation.mutate(addingRoleId)}
                disabled={!addingRoleId || addMutation.isPending}
                className="btn btn-primary flex items-center gap-2 shrink-0"
              >
                {addMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Add Role
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
