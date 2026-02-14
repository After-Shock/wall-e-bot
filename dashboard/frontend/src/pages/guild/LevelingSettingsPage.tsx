import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { TrendingUp, Save, Hash, Volume2, Gift, CheckCircle, Info } from 'lucide-react';
import { LevelingConfig } from '@wall-e/shared';
import { useGuildConfig, useErrorMessage } from '../../hooks/useGuildConfig';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorAlert from '../../components/ErrorAlert';

export default function LevelingSettingsPage() {
  const { guildId } = useParams<{ guildId: string }>();
  const [localConfig, setLocalConfig] = useState<LevelingConfig | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  // Fetch and update leveling config
  const {
    data,
    isLoading,
    error,
    update,
    isUpdating,
    updateError,
    refetch
  } = useGuildConfig<LevelingConfig>(guildId, 'leveling');

  const errorMessage = useErrorMessage(error || updateError);

  // Initialize local config when data loads
  useEffect(() => {
    if (data) {
      setLocalConfig(data);
    }
  }, [data]);

  // Show loading state
  if (isLoading) {
    return <LoadingSpinner message="Loading leveling configuration..." fullScreen />;
  }

  // Show error state
  if (error) {
    return (
      <ErrorAlert
        message="Failed to load leveling configuration"
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

  const updateConfig = (updates: Partial<LevelingConfig>) => {
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
          <TrendingUp className="w-8 h-8 text-green-400" />
          <div>
            <h1 className="text-2xl font-bold">Leveling Settings</h1>
            <p className="text-discord-light">Configure XP gain and level-up announcements</p>
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
            <h3 className="font-semibold">Enable Leveling System</h3>
            <p className="text-sm text-discord-light">
              Members earn XP by chatting and level up over time
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
          {/* XP Settings */}
          <div className="card space-y-4">
            <h3 className="font-semibold flex items-center gap-2">
              <Gift className="w-5 h-5 text-purple-400" />
              XP Settings
            </h3>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Min XP Per Message</label>
                <input
                  type="number"
                  value={localConfig.xpPerMessage.min}
                  onChange={e => updateConfig({
                    xpPerMessage: { ...localConfig.xpPerMessage, min: parseInt(e.target.value) || 0 }
                  })}
                  className="input w-full"
                  min="0"
                  max="100"
                />
                <p className="text-xs text-discord-light mt-1">Minimum XP earned</p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Max XP Per Message</label>
                <input
                  type="number"
                  value={localConfig.xpPerMessage.max}
                  onChange={e => updateConfig({
                    xpPerMessage: { ...localConfig.xpPerMessage, max: parseInt(e.target.value) || 0 }
                  })}
                  className="input w-full"
                  min="0"
                  max="100"
                />
                <p className="text-xs text-discord-light mt-1">Maximum XP earned</p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">XP Cooldown (seconds)</label>
              <input
                type="number"
                value={localConfig.xpCooldown}
                onChange={e => updateConfig({ xpCooldown: parseInt(e.target.value) || 0 })}
                className="input w-full"
                min="0"
                max="300"
              />
              <p className="text-xs text-discord-light mt-1">Time between XP gains (prevents spam)</p>
            </div>
          </div>

          {/* Level-Up Announcements */}
          <div className="card space-y-4">
            <h3 className="font-semibold flex items-center gap-2">
              <Volume2 className="w-5 h-5 text-blue-400" />
              Level-Up Announcements
            </h3>

            <div>
              <label className="block text-sm font-medium mb-2">Announcement Channel</label>
              <div className="relative">
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-discord-light" />
                <select
                  value={localConfig.levelUpChannel || 'current'}
                  onChange={e => updateConfig({ levelUpChannel: e.target.value as any })}
                  className="input w-full pl-9"
                >
                  <option value="current">Current channel (where they leveled up)</option>
                  <option value="dm">Direct message to user</option>
                  <option value="">Custom channel (enter ID below)</option>
                </select>
              </div>

              {localConfig.levelUpChannel &&
               localConfig.levelUpChannel !== 'current' &&
               localConfig.levelUpChannel !== 'dm' && (
                <input
                  type="text"
                  value={localConfig.levelUpChannel}
                  onChange={e => updateConfig({ levelUpChannel: e.target.value })}
                  className="input w-full mt-2"
                  placeholder="Enter channel ID (e.g., 1234567890123456789)"
                />
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Announcement Message</label>
              <textarea
                value={localConfig.levelUpMessage}
                onChange={e => updateConfig({ levelUpMessage: e.target.value })}
                className="input w-full h-24 resize-none"
                placeholder="Congratulations {user}!"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="text-xs bg-discord-dark px-2 py-1 rounded">{'{user}'} - Mention</span>
                <span className="text-xs bg-discord-dark px-2 py-1 rounded">{'{username}'} - Name</span>
                <span className="text-xs bg-discord-dark px-2 py-1 rounded">{'{level}'} - New level</span>
              </div>
            </div>
          </div>

          {/* Exclusions */}
          <div className="card space-y-4">
            <h3 className="font-semibold">Exclusions</h3>
            <p className="text-sm text-discord-light">
              Configure which channels and roles should not earn XP
            </p>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Ignored Channels (IDs)</label>
                <textarea
                  value={(localConfig.ignoredChannels || []).join('\n')}
                  onChange={e => updateConfig({
                    ignoredChannels: e.target.value.split('\n').filter(id => id.trim())
                  })}
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
                  onChange={e => updateConfig({
                    ignoredRoles: e.target.value.split('\n').filter(id => id.trim())
                  })}
                  className="input w-full h-24 resize-none font-mono text-sm"
                  placeholder="123456789012345678&#10;987654321098765432"
                />
                <p className="text-xs text-discord-light mt-1">
                  One role ID per line
                </p>
              </div>
            </div>
          </div>

          {/* Info Note */}
          <div className="card bg-blue-500/10 border-blue-500/50">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-blue-400 mt-0.5" />
              <div>
                <h4 className="font-semibold text-blue-400 mb-1">Role Rewards & Multipliers</h4>
                <p className="text-sm text-discord-light">
                  To configure role rewards for reaching specific levels or XP multipliers for certain roles,
                  visit the <strong>Role Rewards</strong> page in the sidebar.
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
