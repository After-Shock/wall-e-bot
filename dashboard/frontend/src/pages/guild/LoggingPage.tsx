import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { ScrollText, Save, Hash, CheckCircle } from 'lucide-react';
import { LoggingConfig } from '@wall-e/shared';
import { useGuildConfig, useErrorMessage } from '../../hooks/useGuildConfig';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorAlert from '../../components/ErrorAlert';

// Event categories for organized UI
const eventCategories = [
  {
    id: 'messages',
    name: 'Messages',
    description: 'Message edits and deletions',
    events: [
      { key: 'messageDelete' as const, name: 'Message Deleted', description: 'Log when messages are deleted' },
      { key: 'messageEdit' as const, name: 'Message Edited', description: 'Log when messages are edited' },
    ],
  },
  {
    id: 'members',
    name: 'Members',
    description: 'Member joins, leaves, and updates',
    events: [
      { key: 'memberJoin' as const, name: 'Member Joined', description: 'Log when members join' },
      { key: 'memberLeave' as const, name: 'Member Left', description: 'Log when members leave' },
      { key: 'nicknameChange' as const, name: 'Nickname Changed', description: 'Log nickname changes' },
      { key: 'usernameChange' as const, name: 'Username Changed', description: 'Log username changes' },
    ],
  },
  {
    id: 'moderation',
    name: 'Moderation',
    description: 'Bans and unbans',
    events: [
      { key: 'memberBan' as const, name: 'Member Banned', description: 'Log when members are banned' },
      { key: 'memberUnban' as const, name: 'Member Unbanned', description: 'Log when members are unbanned' },
    ],
  },
  {
    id: 'server',
    name: 'Server',
    description: 'Channel and role changes',
    events: [
      { key: 'channelCreate' as const, name: 'Channel Created', description: 'Log channel creations' },
      { key: 'channelDelete' as const, name: 'Channel Deleted', description: 'Log channel deletions' },
      { key: 'roleCreate' as const, name: 'Role Created', description: 'Log role creations' },
      { key: 'roleDelete' as const, name: 'Role Deleted', description: 'Log role deletions' },
    ],
  },
  {
    id: 'voice',
    name: 'Voice',
    description: 'Voice channel activity',
    events: [
      { key: 'voiceStateUpdate' as const, name: 'Voice State Update', description: 'Log voice joins, leaves, and moves' },
    ],
  },
];

export default function LoggingPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const [localConfig, setLocalConfig] = useState<LoggingConfig | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  // Fetch and update logging config
  const {
    data,
    isLoading,
    error,
    update,
    isUpdating,
    updateError,
    refetch
  } = useGuildConfig<LoggingConfig>(guildId, 'logging');

  const errorMessage = useErrorMessage(error || updateError);

  // Initialize local config when data loads
  useEffect(() => {
    if (data) {
      setLocalConfig(data);
    }
  }, [data]);

  // Show loading state
  if (isLoading) {
    return <LoadingSpinner message="Loading logging configuration..." fullScreen />;
  }

  // Show error state
  if (error) {
    return (
      <ErrorAlert
        message="Failed to load logging configuration"
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

  const updateConfig = (updates: Partial<LoggingConfig>) => {
    setLocalConfig(prev => prev ? { ...prev, ...updates } : null);
  };

  const updateEvent = (eventKey: keyof LoggingConfig['events'], enabled: boolean) => {
    setLocalConfig(prev => prev ? {
      ...prev,
      events: { ...prev.events, [eventKey]: enabled }
    } : null);
  };

  const toggleCategory = (categoryId: string, enabled: boolean) => {
    const category = eventCategories.find(c => c.id === categoryId);
    if (!category || !localConfig) return;

    const updates: Partial<LoggingConfig['events']> = {};
    category.events.forEach(event => {
      updates[event.key] = enabled;
    });

    setLocalConfig({
      ...localConfig,
      events: { ...localConfig.events, ...updates }
    });
  };

  const handleSave = async () => {
    if (!localConfig) return;

    try {
      await update(localConfig);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to save config:', err);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ScrollText className="w-8 h-8 text-discord-blurple" />
          <div>
            <h1 className="text-2xl font-bold">Logging</h1>
            <p className="text-discord-light">Configure event logging for your server</p>
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

      {/* Enable Toggle */}
      <div className="card">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Enable Logging</h3>
            <p className="text-sm text-discord-light">Log server events to a designated channel</p>
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
          {/* Log Channel */}
          <div className="card">
            <div>
              <h3 className="font-semibold mb-2">Log Channel</h3>
              <p className="text-sm text-discord-light mb-4">Where to send log messages</p>
            </div>

            <input
              type="text"
              value={localConfig.channelId || ''}
              onChange={e => updateConfig({ channelId: e.target.value })}
              className="input w-full font-mono"
              placeholder="Enter channel ID (e.g., 1234567890123456789)"
            />
          </div>

          {/* Event Categories */}
          <div className="space-y-4">
            {eventCategories.map(category => {
              const enabledCount = category.events.filter(e => localConfig.events[e.key]).length;
              const allEnabled = enabledCount === category.events.length;
              const someEnabled = enabledCount > 0 && !allEnabled;

              return (
                <div key={category.id} className="card">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="font-semibold">{category.name}</h3>
                      <p className="text-sm text-discord-light">{category.description}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-discord-light">
                        {enabledCount}/{category.events.length} enabled
                      </span>
                      <button
                        onClick={() => toggleCategory(category.id, !allEnabled)}
                        className={`relative w-10 h-5 rounded-full transition-colors ${
                          allEnabled ? 'bg-green-500' : someEnabled ? 'bg-yellow-500' : 'bg-discord-dark'
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                            allEnabled || someEnabled ? 'translate-x-5' : 'translate-x-0.5'
                          }`}
                        />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {category.events.map(event => (
                      <div
                        key={event.key}
                        className="bg-discord-dark rounded-lg p-3 flex items-center justify-between"
                      >
                        <div>
                          <p className="font-medium text-sm">{event.name}</p>
                          <p className="text-xs text-discord-light">{event.description}</p>
                        </div>
                        <button
                          onClick={() => updateEvent(event.key, !localConfig.events[event.key])}
                          className={`relative w-10 h-5 rounded-full transition-colors ${
                            localConfig.events[event.key] ? 'bg-green-500' : 'bg-discord-darker'
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                              localConfig.events[event.key] ? 'translate-x-5' : 'translate-x-0.5'
                            }`}
                          />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
