import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { MessageSquare, Save, Hash, Info, CheckCircle } from 'lucide-react';
import { WelcomeConfig } from '@wall-e/shared';
import { useGuildConfig, useErrorMessage } from '../../hooks/useGuildConfig';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorAlert from '../../components/ErrorAlert';

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
  const [showSuccess, setShowSuccess] = useState(false);

  // Fetch and update welcome config using the reusable hook
  const {
    data,
    isLoading,
    error,
    update,
    isUpdating,
    updateError,
    refetch
  } = useGuildConfig<WelcomeConfig>(guildId, 'welcome');

  const errorMessage = useErrorMessage(error || updateError);

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
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
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
        <button
          onClick={handleSave}
          disabled={isUpdating}
          className="btn btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isUpdating ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Saving...
            </>
          ) : showSuccess ? (
            <>
              <CheckCircle className="w-4 h-4" />
              Saved!
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              Save Changes
            </>
          )}
        </button>
      </div>

      {/* Update Error Alert */}
      {updateError && (
        <ErrorAlert
          message="Failed to save configuration"
          details={errorMessage || undefined}
          onRetry={handleSave}
          variant="error"
        />
      )}

      {/* Success Message */}
      {showSuccess && (
        <div className="bg-green-500/10 border border-green-500/50 rounded-lg p-4 flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-green-500" />
          <p className="text-green-400">Configuration saved successfully!</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-discord-dark pb-2">
        <button
          onClick={() => setActiveTab('welcome')}
          className={`px-4 py-2 rounded-t-lg transition-colors ${
            activeTab === 'welcome'
              ? 'bg-discord-blurple text-white'
              : 'text-discord-light hover:text-white hover:bg-discord-dark'
          }`}
        >
          Welcome Message
        </button>
        <button
          onClick={() => setActiveTab('leave')}
          className={`px-4 py-2 rounded-t-lg transition-colors ${
            activeTab === 'leave'
              ? 'bg-discord-blurple text-white'
              : 'text-discord-light hover:text-white hover:bg-discord-dark'
          }`}
        >
          Leave Message
        </button>
      </div>

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
              <button
                onClick={() => updateConfig({ enabled: !localConfig.enabled })}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  localConfig.enabled ? 'bg-discord-blurple' : 'bg-discord-dark'
                }`}
              >
                <span
                  className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                    localConfig.enabled ? 'translate-x-7' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          {localConfig.enabled && (
            <>
              {/* Channel Selector */}
              <div className="card">
                <label className="block text-sm font-medium mb-2">Welcome Channel</label>
                <div className="relative">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-discord-light" />
                  <input
                    type="text"
                    value={localConfig.channelId || ''}
                    onChange={e => updateConfig({ channelId: e.target.value })}
                    className="input pl-9 w-full"
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
                <textarea
                  value={localConfig.message}
                  onChange={e => updateConfig({ message: e.target.value })}
                  className="input w-full h-32 resize-none"
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
                  <button
                    onClick={() => updateConfig({ embedEnabled: !localConfig.embedEnabled })}
                    className={`relative w-12 h-6 rounded-full transition-colors ${
                      localConfig.embedEnabled ? 'bg-discord-blurple' : 'bg-discord-dark'
                    }`}
                  >
                    <span
                      className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                        localConfig.embedEnabled ? 'translate-x-7' : 'translate-x-1'
                      }`}
                    />
                  </button>
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
                        <input
                          type="text"
                          value={localConfig.embedColor || ''}
                          onChange={e => updateConfig({ embedColor: e.target.value })}
                          className="input flex-1"
                          placeholder="#5865F2"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2">Embed Image URL (optional)</label>
                      <input
                        type="text"
                        value={localConfig.embedImage || ''}
                        onChange={e => updateConfig({ embedImage: e.target.value })}
                        className="input w-full"
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
                  <button
                    onClick={() => updateConfig({ dmEnabled: !localConfig.dmEnabled })}
                    className={`relative w-12 h-6 rounded-full transition-colors ${
                      localConfig.dmEnabled ? 'bg-discord-blurple' : 'bg-discord-dark'
                    }`}
                  >
                    <span
                      className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                        localConfig.dmEnabled ? 'translate-x-7' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                {localConfig.dmEnabled && (
                  <div className="pt-4 border-t border-discord-dark">
                    <label className="block text-sm font-medium mb-2">DM Message</label>
                    <textarea
                      value={localConfig.dmMessage || ''}
                      onChange={e => updateConfig({ dmMessage: e.target.value })}
                      className="input w-full h-24 resize-none"
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
              <button
                onClick={() => updateConfig({ leaveEnabled: !localConfig.leaveEnabled })}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  localConfig.leaveEnabled ? 'bg-discord-blurple' : 'bg-discord-dark'
                }`}
              >
                <span
                  className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                    localConfig.leaveEnabled ? 'translate-x-7' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          {localConfig.leaveEnabled && (
            <>
              {/* Leave Channel Selector */}
              <div className="card">
                <label className="block text-sm font-medium mb-2">Leave Channel</label>
                <div className="relative">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-discord-light" />
                  <input
                    type="text"
                    value={localConfig.leaveChannelId || ''}
                    onChange={e => updateConfig({ leaveChannelId: e.target.value })}
                    className="input pl-9 w-full"
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
                <textarea
                  value={localConfig.leaveMessage || ''}
                  onChange={e => updateConfig({ leaveMessage: e.target.value })}
                  className="input w-full h-32 resize-none"
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
