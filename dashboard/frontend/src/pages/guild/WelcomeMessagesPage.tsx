import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { MessageSquare, Save, Hash, Info } from 'lucide-react';
import { WelcomeConfig } from '@wall-e/shared';
import { useGuildConfig, useErrorMessage } from '../../hooks/useGuildConfig';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorAlert from '../../components/ErrorAlert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

const variables = [
  { name: '{user}', description: 'Mentions the user' },
  { name: '{username}', description: 'Username without mention' },
  { name: '{server}', description: 'Server name' },
  { name: '{memberCount}', description: 'Total member count' },
];

export default function WelcomeMessagesPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const [activeTab, setActiveTab] = useState<'welcome' | 'leave'>('welcome');
  const [localConfig, setLocalConfig] = useState<WelcomeConfig | null>(null);

  // Fetch and update welcome config using the reusable hook
  const {
    data,
    isLoading,
    error,
    update,
    isUpdating,
    refetch
  } = useGuildConfig<WelcomeConfig>(guildId, 'welcome');

  const errorMessage = useErrorMessage(error);

  // Initialize local config when data loads
  useEffect(() => {
    if (data) {
      setLocalConfig(data);
    }
  }, [data]);

  // Show loading state
  if (isLoading) {
    return <LoadingSpinner message="Loading welcome configuration..." fullScreen />;
  }

  // Show error state
  if (error) {
    return (
      <ErrorAlert
        message="Failed to load welcome configuration"
        details={errorMessage || undefined}
        onRetry={() => refetch()}
        fullScreen
      />
    );
  }

  // Config not loaded yet
  if (!localConfig) {
    return <LoadingSpinner fullScreen />;
  }

  const updateConfig = (updates: Partial<WelcomeConfig>) => {
    setLocalConfig(prev => prev ? { ...prev, ...updates } : null);
  };

  const handleSave = async () => {
    if (!localConfig) return;

    try {
      await update(localConfig);
    } catch (err) {
      // Error handling is done by the hook
      console.error('Failed to save config:', err);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <MessageSquare className="w-8 h-8 text-discord-blurple" />
          <div>
            <h1 className="text-2xl font-bold">Welcome Messages</h1>
            <p className="text-discord-light">Configure messages for new members and departures</p>
          </div>
        </div>
        <Button
          onClick={handleSave}
          disabled={isUpdating}
          className="flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isUpdating ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              Save Changes
            </>
          )}
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={v => setActiveTab(v as 'welcome' | 'leave')}>
        <TabsList>
          <TabsTrigger value="welcome">Welcome Message</TabsTrigger>
          <TabsTrigger value="leave">Leave Message</TabsTrigger>
        </TabsList>
      </Tabs>

      {activeTab === 'welcome' ? (
        <>
          {/* Welcome Messages Section */}
          <div className="card">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">Enable Welcome Messages</h3>
                <p className="text-sm text-discord-light">
                  Send a message when a member joins the server
                </p>
              </div>
              <Switch checked={localConfig.enabled} onCheckedChange={() => updateConfig({ enabled: !localConfig.enabled })} />
            </div>
          </div>

          {localConfig.enabled && (
            <>
              {/* Channel Selector */}
              <div className="card">
                <label className="block text-sm font-medium mb-2">Welcome Channel</label>
                <div className="relative">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-discord-light" />
                  <Input
                    type="text"
                    value={localConfig.channelId || ''}
                    onChange={e => updateConfig({ channelId: e.target.value })}
                    className="pl-9 w-full"
                    placeholder="Enter channel ID (e.g., 1234567890123456789)"
                  />
                </div>
                <p className="text-sm text-discord-light mt-2">
                  The channel where welcome messages will be sent
                </p>
              </div>

              {/* Welcome Message */}
              <div className="card">
                <label className="block text-sm font-medium mb-2">Welcome Message</label>
                <Textarea
                  value={localConfig.message}
                  onChange={e => updateConfig({ message: e.target.value })}
                  className="w-full h-32 resize-none"
                  placeholder="Enter your welcome message..."
                />
              </div>

              {/* Embed Settings */}
              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-semibold">Use Embed</h3>
                    <p className="text-sm text-discord-light">Display message as a rich embed</p>
                  </div>
                  <Switch checked={localConfig.embedEnabled} onCheckedChange={() => updateConfig({ embedEnabled: !localConfig.embedEnabled })} />
                </div>

                {localConfig.embedEnabled && (
                  <div className="space-y-4 pt-4 border-t border-discord-dark">
                    <div>
                      <label className="block text-sm font-medium mb-2">Embed Color</label>
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={localConfig.embedColor || '#5865F2'}
                          onChange={e => updateConfig({ embedColor: e.target.value })}
                          className="w-10 h-10 rounded cursor-pointer"
                        />
                        <Input
                          type="text"
                          value={localConfig.embedColor || ''}
                          onChange={e => updateConfig({ embedColor: e.target.value })}
                          className="flex-1"
                          placeholder="#5865F2"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2">Embed Image URL (optional)</label>
                      <Input
                        type="text"
                        value={localConfig.embedImage || ''}
                        onChange={e => updateConfig({ embedImage: e.target.value })}
                        className="w-full"
                        placeholder="https://example.com/image.png"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* DM Settings */}
              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-semibold">Send DM to User</h3>
                    <p className="text-sm text-discord-light">Send a direct message to the new member</p>
                  </div>
                  <Switch checked={localConfig.dmEnabled} onCheckedChange={() => updateConfig({ dmEnabled: !localConfig.dmEnabled })} />
                </div>

                {localConfig.dmEnabled && (
                  <div className="pt-4 border-t border-discord-dark">
                    <label className="block text-sm font-medium mb-2">DM Message</label>
                    <Textarea
                      value={localConfig.dmMessage || ''}
                      onChange={e => updateConfig({ dmMessage: e.target.value })}
                      className="w-full h-24 resize-none"
                      placeholder="Enter DM message..."
                    />
                  </div>
                )}
              </div>
            </>
          )}
        </>
      ) : (
        <>
          {/* Leave Messages Section */}
          <div className="card">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">Enable Leave Messages</h3>
                <p className="text-sm text-discord-light">
                  Send a message when a member leaves the server
                </p>
              </div>
              <Switch checked={localConfig.leaveEnabled} onCheckedChange={() => updateConfig({ leaveEnabled: !localConfig.leaveEnabled })} />
            </div>
          </div>

          {localConfig.leaveEnabled && (
            <>
              {/* Leave Channel Selector */}
              <div className="card">
                <label className="block text-sm font-medium mb-2">Leave Channel</label>
                <div className="relative">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-discord-light" />
                  <Input
                    type="text"
                    value={localConfig.leaveChannelId || ''}
                    onChange={e => updateConfig({ leaveChannelId: e.target.value })}
                    className="pl-9 w-full"
                    placeholder="Enter channel ID (e.g., 1234567890123456789)"
                  />
                </div>
                <p className="text-sm text-discord-light mt-2">
                  The channel where leave messages will be sent
                </p>
              </div>

              {/* Leave Message */}
              <div className="card">
                <label className="block text-sm font-medium mb-2">Leave Message</label>
                <Textarea
                  value={localConfig.leaveMessage || ''}
                  onChange={e => updateConfig({ leaveMessage: e.target.value })}
                  className="w-full h-32 resize-none"
                  placeholder="Enter your leave message..."
                />
              </div>
            </>
          )}
        </>
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
    </div>
  );
}
