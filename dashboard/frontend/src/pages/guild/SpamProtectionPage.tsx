import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Zap, Save, CheckCircle, Clock } from 'lucide-react';
import { AutoModConfig } from '@wall-e/shared';
import { useGuildConfig, useErrorMessage } from '../../hooks/useGuildConfig';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorAlert from '../../components/ErrorAlert';

export default function SpamProtectionPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const [localConfig, setLocalConfig] = useState<AutoModConfig | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  const {
    data,
    isLoading,
    error,
    update,
    isUpdating,
    updateError,
    refetch
  } = useGuildConfig<AutoModConfig>(guildId, 'automod');

  const errorMessage = useErrorMessage(error || updateError);

  useEffect(() => {
    if (data) {
      setLocalConfig(data);
    }
  }, [data]);

  if (isLoading) {
    return <LoadingSpinner message="Loading spam protection..." fullScreen />;
  }

  if (error) {
    return (
      <ErrorAlert
        message="Failed to load spam protection configuration"
        details={errorMessage || undefined}
        onRetry={() => refetch()}
        fullScreen
      />
    );
  }

  if (!localConfig) {
    return <LoadingSpinner fullScreen />;
  }

  const updateAntiSpam = (updates: Partial<AutoModConfig['antiSpam']>) => {
    setLocalConfig(prev => prev ? {
      ...prev,
      antiSpam: { ...prev.antiSpam, ...updates }
    } : null);
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
          <Zap className="w-8 h-8 text-yellow-400" />
          <div>
            <h1 className="text-2xl font-bold">Spam Protection</h1>
            <p className="text-discord-light">Automatically detect and handle spam messages</p>
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
            <h3 className="font-semibold">Enable Spam Protection</h3>
            <p className="text-sm text-discord-light">
              Automatically detect and take action on spam messages
            </p>
          </div>
          <button
            onClick={() => updateAntiSpam({ enabled: !localConfig.antiSpam.enabled })}
            className={`relative w-12 h-6 rounded-full transition-colors ${
              localConfig.antiSpam.enabled ? 'bg-discord-blurple' : 'bg-discord-dark'
            }`}
          >
            <span
              className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                localConfig.antiSpam.enabled ? 'translate-x-7' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {localConfig.antiSpam.enabled && (
        <>
          {/* Rate Limiting */}
          <div className="card space-y-4">
            <h3 className="font-semibold">Spam Detection Settings</h3>
            <p className="text-sm text-discord-light">
              Trigger when a user sends too many messages in a short time
            </p>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Max Messages</label>
                <input
                  type="number"
                  value={localConfig.antiSpam.maxMessages}
                  onChange={e => updateAntiSpam({ maxMessages: parseInt(e.target.value) || 1 })}
                  className="input w-full"
                  min="2"
                  max="50"
                />
                <p className="text-xs text-discord-light mt-1">
                  Maximum messages allowed in time window
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Time Window (seconds)
                </label>
                <input
                  type="number"
                  value={localConfig.antiSpam.interval}
                  onChange={e => updateAntiSpam({ interval: parseInt(e.target.value) || 1 })}
                  className="input w-full"
                  min="1"
                  max="60"
                />
                <p className="text-xs text-discord-light mt-1">
                  Time period to count messages
                </p>
              </div>
            </div>
          </div>

          {/* Action */}
          <div className="card space-y-4">
            <h3 className="font-semibold">Action</h3>
            <p className="text-sm text-discord-light">
              What to do when spam is detected
            </p>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Action to Take</label>
                <select
                  value={localConfig.antiSpam.action}
                  onChange={e => updateAntiSpam({ action: e.target.value as any })}
                  className="input w-full"
                >
                  <option value="warn">Warn user</option>
                  <option value="mute">Mute user</option>
                  <option value="kick">Kick from server</option>
                  <option value="ban">Ban from server</option>
                </select>
              </div>
              {localConfig.antiSpam.action === 'mute' && (
                <div>
                  <label className="block text-sm font-medium mb-2">Mute Duration (minutes)</label>
                  <input
                    type="number"
                    value={localConfig.antiSpam.muteDuration || 10}
                    onChange={e => updateAntiSpam({ muteDuration: parseInt(e.target.value) || 10 })}
                    className="input w-full"
                    min="1"
                    max="10080"
                  />
                  <p className="text-xs text-discord-light mt-1">
                    Maximum: 10080 minutes (1 week)
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Exclusions */}
          <div className="card space-y-4">
            <h3 className="font-semibold">Exclusions</h3>
            <p className="text-sm text-discord-light">
              Channels and roles that are excluded from spam protection
            </p>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Ignored Channels (IDs)</label>
                <textarea
                  value={(localConfig.ignoredChannels || []).join('\n')}
                  onChange={e => setLocalConfig(prev => prev ? {
                    ...prev,
                    ignoredChannels: e.target.value.split('\n').filter(id => id.trim())
                  } : null)}
                  className="input w-full h-24 resize-none font-mono text-sm"
                  placeholder="123456789012345678&#10;987654321098765432"
                />
                <p className="text-xs text-discord-light mt-1">
                  One channel ID per line
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Ignored Roles (IDs)</label>
                <textarea
                  value={(localConfig.ignoredRoles || []).join('\n')}
                  onChange={e => setLocalConfig(prev => prev ? {
                    ...prev,
                    ignoredRoles: e.target.value.split('\n').filter(id => id.trim())
                  } : null)}
                  className="input w-full h-24 resize-none font-mono text-sm"
                  placeholder="123456789012345678&#10;987654321098765432"
                />
                <p className="text-xs text-discord-light mt-1">
                  One role ID per line
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
