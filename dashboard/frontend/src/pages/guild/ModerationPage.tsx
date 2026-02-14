import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Shield, Save, Hash, AlertTriangle, CheckCircle, MessageSquare } from 'lucide-react';
import { ModerationConfig } from '@wall-e/shared';
import { useGuildConfig, useErrorMessage } from '../../hooks/useGuildConfig';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorAlert from '../../components/ErrorAlert';

export default function ModerationPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const [localConfig, setLocalConfig] = useState<ModerationConfig | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  // Fetch and update moderation config
  const {
    data,
    isLoading,
    error,
    update,
    isUpdating,
    updateError,
    refetch
  } = useGuildConfig<ModerationConfig>(guildId, 'moderation');

  const errorMessage = useErrorMessage(error || updateError);

  // Initialize local config when data loads
  useEffect(() => {
    if (data) {
      setLocalConfig(data);
    }
  }, [data]);

  // Show loading state
  if (isLoading) {
    return <LoadingSpinner message="Loading moderation configuration..." fullScreen />;
  }

  // Show error state
  if (error) {
    return (
      <ErrorAlert
        message="Failed to load moderation configuration"
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

  const updateConfig = (updates: Partial<ModerationConfig>) => {
    setLocalConfig(prev => prev ? { ...prev, ...updates } : null);
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
          <Shield className="w-8 h-8 text-red-400" />
          <div>
            <h1 className="text-2xl font-bold">Moderation Settings</h1>
            <p className="text-discord-light">Configure moderation tools and automatic actions</p>
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

      {/* Mute Role Configuration */}
      <div className="card space-y-4">
        <h3 className="font-semibold flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-gray-400" />
          Mute Role
        </h3>
        <p className="text-sm text-discord-light">
          The role that will be assigned to muted members. Make sure this role has Send Messages permission disabled.
        </p>

        <div>
          <label className="block text-sm font-medium mb-2">Mute Role ID</label>
          <input
            type="text"
            value={localConfig.muteRoleId || ''}
            onChange={e => updateConfig({ muteRoleId: e.target.value })}
            className="input w-full font-mono"
            placeholder="Enter role ID (e.g., 1234567890123456789)"
          />
          <p className="text-xs text-discord-light mt-1">
            Leave empty to use timeout feature instead
          </p>
        </div>
      </div>

      {/* Moderation Log Channel */}
      <div className="card space-y-4">
        <h3 className="font-semibold flex items-center gap-2">
          <Hash className="w-5 h-5 text-blue-400" />
          Moderation Log Channel
        </h3>
        <p className="text-sm text-discord-light">
          Channel where moderation actions will be logged
        </p>

        <div>
          <label className="block text-sm font-medium mb-2">Log Channel ID</label>
          <input
            type="text"
            value={localConfig.modLogChannelId || ''}
            onChange={e => updateConfig({ modLogChannelId: e.target.value })}
            className="input w-full font-mono"
            placeholder="Enter channel ID (e.g., 1234567890123456789)"
          />
          <p className="text-xs text-discord-light mt-1">
            Logs include warnings, mutes, kicks, and bans
          </p>
        </div>
      </div>

      {/* Warning Thresholds */}
      <div className="card space-y-4">
        <h3 className="font-semibold flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-yellow-400" />
          Warning Thresholds
        </h3>
        <p className="text-sm text-discord-light">
          Automatic actions when members reach warning thresholds
        </p>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Kick Threshold</label>
            <input
              type="number"
              value={localConfig.warnThresholds.kick}
              onChange={e => updateConfig({
                warnThresholds: {
                  ...localConfig.warnThresholds,
                  kick: parseInt(e.target.value) || 1
                }
              })}
              className="input w-full"
              min="1"
              max="100"
            />
            <p className="text-xs text-discord-light mt-1">
              Number of warnings before auto-kick
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Ban Threshold</label>
            <input
              type="number"
              value={localConfig.warnThresholds.ban}
              onChange={e => updateConfig({
                warnThresholds: {
                  ...localConfig.warnThresholds,
                  ban: parseInt(e.target.value) || 1
                }
              })}
              className="input w-full"
              min="1"
              max="100"
            />
            <p className="text-xs text-discord-light mt-1">
              Number of warnings before auto-ban
            </p>
          </div>
        </div>
      </div>

      {/* Moderation Behavior */}
      <div className="card space-y-4">
        <h3 className="font-semibold">Moderation Behavior</h3>

        <div className="space-y-3">
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <p className="font-medium">Auto-Delete Mod Commands</p>
              <p className="text-sm text-discord-light">
                Automatically delete moderation commands after execution
              </p>
            </div>
            <button
              onClick={() => updateConfig({ autoDeleteModCommands: !localConfig.autoDeleteModCommands })}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                localConfig.autoDeleteModCommands ? 'bg-discord-blurple' : 'bg-discord-dark'
              }`}
            >
              <span
                className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                  localConfig.autoDeleteModCommands ? 'translate-x-7' : 'translate-x-1'
                }`}
              />
            </button>
          </label>

          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <p className="font-medium">DM on Moderation Action</p>
              <p className="text-sm text-discord-light">
                Send a direct message to members when they are warned, muted, kicked, or banned
              </p>
            </div>
            <button
              onClick={() => updateConfig({ dmOnAction: !localConfig.dmOnAction })}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                localConfig.dmOnAction ? 'bg-discord-blurple' : 'bg-discord-dark'
              }`}
            >
              <span
                className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                  localConfig.dmOnAction ? 'translate-x-7' : 'translate-x-1'
                }`}
              />
            </button>
          </label>
        </div>
      </div>
    </div>
  );
}
